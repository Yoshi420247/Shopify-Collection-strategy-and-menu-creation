#!/usr/bin/env node
// ============================================================================
// Bulk Product Wholesale Tagger
// ============================================================================
//
// Uses Gemini Flash (vision + text) to identify bulk/wholesale products in the
// Shopify inventory, then strips all collection tags EXCEPT the wholesale tag.
//
// This removes bulk products from retail-facing collections while keeping them
// accessible in the wholesale collection for B2B customers.
//
// Features:
//   - Two-pass detection: free text heuristics + cheap Gemini Flash vision
//   - Skip-already-processed: tracks processed products in a local JSON log
//   - Dry-run mode: preview changes without modifying Shopify
//   - Rollback file: saves original tags before any modification
//   - Confidence thresholds: configurable minimum confidence for auto-tagging
//   - Batch processing: respects Shopify rate limits
//   - Cost tracking: reports total Gemini API spend
//   - Vendor filtering: process specific vendors only
//   - GitHub Action summary output
//
// Usage:
//   node src/bulk-wholesale-tagger.js                  # Dry run (preview)
//   node src/bulk-wholesale-tagger.js --execute        # Apply changes
//   node src/bulk-wholesale-tagger.js --force-vision   # Use vision on all products
//   node src/bulk-wholesale-tagger.js --reset-log      # Clear processing log
//   node src/bulk-wholesale-tagger.js --product-ids=123,456  # Specific products
//   node src/bulk-wholesale-tagger.js --vendor="What You Need"  # Specific vendor
//   node src/bulk-wholesale-tagger.js --min-confidence=0.6      # Custom threshold

import { config } from './config.js';
import { paginateAll, updateProduct, getProduct } from './shopify-api.js';
import { detectBulkProduct, analyzeTextForBulk } from './bulk-product-analyzer.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Configuration ───────────────────────────────────────────────────────────

const WHOLESALE_TAG = 'collection:wholesale';  // Tag that links to wholesale collection
const PROCESSING_LOG = resolve(__dirname, '..', 'data', 'bulk-processing-log.json');
const ROLLBACK_FILE = resolve(__dirname, '..', 'data', 'bulk-rollback-tags.json');

// Tags to ALWAYS preserve (never strip these regardless of bulk status)
const PRESERVED_TAG_PREFIXES = [
  'collection:wholesale',  // The wholesale collection link
];

// Tags that are structural/non-collection (preserve these too)
const STRUCTURAL_TAG_PREFIXES = [
  'vendor:',               // Vendor identification
];

// ── CLI argument parsing ────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    execute: false,
    forceVision: false,
    resetLog: false,
    productIds: null,
    vendor: null,
    minConfidence: 0.5,
    maxProducts: Infinity,
    textOnly: false,
    skipProcessed: true,
  };

  for (const arg of args) {
    if (arg === '--execute') opts.execute = true;
    else if (arg === '--force-vision') opts.forceVision = true;
    else if (arg === '--reset-log') opts.resetLog = true;
    else if (arg === '--text-only') opts.textOnly = true;
    else if (arg === '--no-skip') opts.skipProcessed = false;
    else if (arg.startsWith('--product-ids=')) opts.productIds = arg.split('=')[1].split(',').map(Number);
    else if (arg.startsWith('--vendor=')) opts.vendor = arg.split('=')[1];
    else if (arg.startsWith('--min-confidence=')) opts.minConfidence = parseFloat(arg.split('=')[1]);
    else if (arg.startsWith('--max=')) opts.maxProducts = parseInt(arg.split('=')[1]);
  }

  return opts;
}

// ── Processing log (skip already-processed products) ────────────────────────

function loadProcessingLog() {
  try {
    if (existsSync(PROCESSING_LOG)) {
      return JSON.parse(readFileSync(PROCESSING_LOG, 'utf-8'));
    }
  } catch { /* ignore corrupt file */ }
  return { processedProducts: {}, lastRun: null, totalRuns: 0 };
}

function saveProcessingLog(log) {
  const dir = dirname(PROCESSING_LOG);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(PROCESSING_LOG, JSON.stringify(log, null, 2));
}

function isAlreadyProcessed(log, productId, product) {
  const entry = log.processedProducts[productId];
  if (!entry) return false;

  // Re-process if the product was updated after we last processed it
  const productUpdated = new Date(product.updated_at).getTime();
  const processedAt = new Date(entry.processedAt).getTime();
  return productUpdated <= processedAt;
}

// ── Rollback file (save original tags before modification) ──────────────────

function loadRollbackData() {
  try {
    if (existsSync(ROLLBACK_FILE)) {
      return JSON.parse(readFileSync(ROLLBACK_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

function saveRollbackEntry(productId, originalTags) {
  const data = loadRollbackData();
  // Only save the first time — don't overwrite with already-modified tags
  if (!data[productId]) {
    data[productId] = {
      originalTags,
      savedAt: new Date().toISOString(),
    };
    const dir = dirname(ROLLBACK_FILE);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(ROLLBACK_FILE, JSON.stringify(data, null, 2));
  }
}

// ── Tag manipulation ────────────────────────────────────────────────────────

/**
 * Given a product's current tags, produce the wholesale-only tag set.
 * Keeps: wholesale tag + structural tags (vendor:)
 * Removes: everything else (family:, material:, use:, pillar:, brand:, style:, etc.)
 */
function buildWholesaleTagSet(currentTags) {
  const tagList = currentTags.split(',').map(t => t.trim()).filter(Boolean);
  const kept = [];

  for (const tag of tagList) {
    const lower = tag.toLowerCase();
    // Always keep the wholesale tag
    if (PRESERVED_TAG_PREFIXES.some(p => lower.startsWith(p))) {
      kept.push(tag);
      continue;
    }
    // Keep structural tags
    if (STRUCTURAL_TAG_PREFIXES.some(p => lower.startsWith(p))) {
      kept.push(tag);
      continue;
    }
    // Everything else gets removed
  }

  // Ensure wholesale tag is present
  if (!kept.some(t => t.toLowerCase() === WHOLESALE_TAG)) {
    kept.push(WHOLESALE_TAG);
  }

  return kept.join(', ');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main execution ──────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  console.log('='.repeat(70));
  console.log('  BULK PRODUCT WHOLESALE TAGGER');
  console.log('='.repeat(70));
  console.log(`  Mode:           ${opts.execute ? 'EXECUTE (will modify Shopify)' : 'DRY RUN (preview only)'}`);
  console.log(`  Skip processed: ${opts.skipProcessed}`);
  console.log(`  Force vision:   ${opts.forceVision}`);
  console.log(`  Text only:      ${opts.textOnly}`);
  console.log(`  Min confidence: ${opts.minConfidence}`);
  console.log(`  Wholesale tag:  ${WHOLESALE_TAG}`);
  if (opts.vendor) console.log(`  Vendor filter:  ${opts.vendor}`);
  if (opts.productIds) console.log(`  Product IDs:    ${opts.productIds.join(', ')}`);
  if (opts.maxProducts < Infinity) console.log(`  Max products:   ${opts.maxProducts}`);
  console.log('='.repeat(70));
  console.log();

  // Reset log if requested
  if (opts.resetLog) {
    console.log('Resetting processing log...');
    saveProcessingLog({ processedProducts: {}, lastRun: null, totalRuns: 0 });
    console.log('Processing log cleared.\n');
  }

  const processingLog = loadProcessingLog();

  // ── Fetch products ──────────────────────────────────────────────────────

  let products;
  if (opts.productIds) {
    console.log(`Fetching ${opts.productIds.length} specific product(s)...`);
    products = [];
    for (const id of opts.productIds) {
      const data = await getProduct(id);
      if (data?.product) products.push(data.product);
    }
  } else {
    const params = { limit: 250 };
    if (opts.vendor) params.vendor = opts.vendor;

    console.log('Fetching all products from Shopify...');
    products = await paginateAll('products.json', 'products', params);
  }

  console.log(`Found ${products.length} products to analyze.\n`);

  if (products.length === 0) {
    console.log('No products found. Exiting.');
    return;
  }

  // ── Analyze products ────────────────────────────────────────────────────

  const results = {
    bulkProducts: [],
    retailProducts: [],
    skipped: [],
    errors: [],
    totalCost: 0,
    visionCalls: 0,
    textOnlyCalls: 0,
  };

  let processed = 0;
  for (const product of products) {
    if (processed >= opts.maxProducts) break;
    processed++;

    const progress = `[${processed}/${Math.min(products.length, opts.maxProducts)}]`;

    // Skip if already processed (and product hasn't changed)
    if (opts.skipProcessed && isAlreadyProcessed(processingLog, product.id, product)) {
      const prev = processingLog.processedProducts[product.id];
      console.log(`${progress} SKIP "${product.title}" (processed ${prev.processedAt}, result: ${prev.result})`);
      results.skipped.push({
        productId: product.id,
        productTitle: product.title,
        previousResult: prev.result,
      });
      continue;
    }

    // Run analysis
    console.log(`${progress} Analyzing "${product.title}"...`);
    let analysis;

    try {
      if (opts.textOnly) {
        const textResult = analyzeTextForBulk(product);
        analysis = {
          productId: product.id,
          productTitle: product.title,
          isBulk: textResult.isBulk,
          combinedScore: textResult.score,
          method: 'text-only',
          textAnalysis: textResult,
          visionAnalysis: null,
          usage: null,
        };
        results.textOnlyCalls++;
      } else {
        analysis = await detectBulkProduct(product, {
          forceVision: opts.forceVision,
          geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
        });

        if (analysis.usage) {
          results.totalCost += analysis.usage.cost;
          results.visionCalls++;
        } else {
          results.textOnlyCalls++;
        }
      }
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      results.errors.push({ productId: product.id, productTitle: product.title, error: err.message });
      continue;
    }

    // Determine if bulk based on confidence threshold
    const meetsThreshold = analysis.isBulk && analysis.combinedScore >= opts.minConfidence;

    if (meetsThreshold) {
      const signals = [];
      if (analysis.textAnalysis?.signals?.length) signals.push(...analysis.textAnalysis.signals);
      if (analysis.visionAnalysis?.bulk_signals?.length) signals.push(...analysis.visionAnalysis.bulk_signals);

      console.log(`  BULK (score: ${analysis.combinedScore.toFixed(2)}, method: ${analysis.method})`);
      if (signals.length) console.log(`  Signals: ${signals.join('; ')}`);

      const currentTags = product.tags || '';
      const newTags = buildWholesaleTagSet(currentTags);
      const removedTags = currentTags.split(',').map(t => t.trim()).filter(t => !newTags.split(',').map(n => n.trim()).includes(t));

      results.bulkProducts.push({
        productId: product.id,
        productTitle: product.title,
        score: analysis.combinedScore,
        method: analysis.method,
        signals,
        currentTags,
        newTags,
        removedTags,
        packaging_type: analysis.visionAnalysis?.packaging_type || 'unknown',
        estimated_units: analysis.visionAnalysis?.estimated_unit_count || null,
      });

      if (removedTags.length > 0) {
        console.log(`  Tags to remove: ${removedTags.join(', ')}`);
        console.log(`  Tags to keep:   ${newTags}`);
      } else {
        console.log(`  Already has correct tags.`);
      }
    } else {
      console.log(`  RETAIL (score: ${analysis.combinedScore.toFixed(2)}, method: ${analysis.method})`);
      results.retailProducts.push({
        productId: product.id,
        productTitle: product.title,
        score: analysis.combinedScore,
        method: analysis.method,
      });
    }

    // Update processing log
    processingLog.processedProducts[product.id] = {
      processedAt: new Date().toISOString(),
      result: meetsThreshold ? 'bulk' : 'retail',
      score: analysis.combinedScore,
      method: analysis.method,
    };

    // Small delay between vision calls to be nice to Gemini API
    if (analysis.usage) await sleep(200);

    console.log();
  }

  // ── Apply changes (execute mode) ────────────────────────────────────────

  let applied = 0;
  let applyErrors = 0;

  if (opts.execute && results.bulkProducts.length > 0) {
    console.log('='.repeat(70));
    console.log('  APPLYING TAG CHANGES');
    console.log('='.repeat(70));
    console.log();

    for (const item of results.bulkProducts) {
      if (item.removedTags.length === 0) {
        console.log(`  SKIP "${item.productTitle}" — tags already correct`);
        continue;
      }

      // Save rollback data BEFORE modifying
      saveRollbackEntry(item.productId, item.currentTags);

      console.log(`  Updating "${item.productTitle}" (${item.productId})...`);
      try {
        await updateProduct(item.productId, { tags: item.newTags });
        console.log(`    OK — removed ${item.removedTags.length} tags, kept wholesale tag`);
        applied++;
      } catch (err) {
        console.log(`    FAILED: ${err.message}`);
        applyErrors++;
      }

      await sleep(600); // Respect Shopify rate limits
    }
  }

  // ── Save processing log ─────────────────────────────────────────────────

  processingLog.lastRun = new Date().toISOString();
  processingLog.totalRuns = (processingLog.totalRuns || 0) + 1;

  // Ensure data directory exists
  const dataDir = dirname(PROCESSING_LOG);
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  saveProcessingLog(processingLog);

  // ── Print summary ───────────────────────────────────────────────────────

  console.log();
  console.log('='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total products analyzed: ${processed}`);
  console.log(`  Skipped (already processed): ${results.skipped.length}`);
  console.log(`  Identified as BULK:    ${results.bulkProducts.length}`);
  console.log(`  Identified as RETAIL:  ${results.retailProducts.length}`);
  console.log(`  Errors:                ${results.errors.length}`);
  console.log();
  console.log(`  Analysis method breakdown:`);
  console.log(`    Text-only calls:  ${results.textOnlyCalls}`);
  console.log(`    Vision calls:     ${results.visionCalls}`);
  console.log(`    Total API cost:   $${results.totalCost.toFixed(4)}`);
  console.log();

  if (results.bulkProducts.length > 0) {
    console.log('  Bulk products found:');
    for (const item of results.bulkProducts) {
      const unitInfo = item.estimated_units ? ` (~${item.estimated_units} units)` : '';
      console.log(`    - ${item.productTitle} (score: ${item.score.toFixed(2)}, ${item.packaging_type}${unitInfo})`);
      console.log(`      Remove: ${item.removedTags.length > 0 ? item.removedTags.join(', ') : '(none to remove)'}`);
    }
    console.log();
  }

  if (opts.execute) {
    console.log(`  Changes applied:  ${applied}`);
    console.log(`  Apply errors:     ${applyErrors}`);
    if (applied > 0) {
      console.log(`  Rollback file:    ${ROLLBACK_FILE}`);
    }
  } else {
    console.log('  No changes made (dry run). Use --execute to apply.');
  }

  console.log('='.repeat(70));

  // ── GitHub Actions step summary ─────────────────────────────────────────

  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = [
      '## Bulk Product Wholesale Tagger Report\n',
      `**Mode:** \`${opts.execute ? 'execute' : 'dry-run'}\``,
      `**Timestamp:** ${new Date().toISOString()}\n`,
      '### Results\n',
      `| Metric | Count |`,
      `|--------|-------|`,
      `| Products analyzed | ${processed} |`,
      `| Skipped (cached) | ${results.skipped.length} |`,
      `| Identified as bulk | ${results.bulkProducts.length} |`,
      `| Identified as retail | ${results.retailProducts.length} |`,
      `| Errors | ${results.errors.length} |`,
      `| Gemini vision calls | ${results.visionCalls} |`,
      `| Text-only (free) | ${results.textOnlyCalls} |`,
      `| API cost | $${results.totalCost.toFixed(4)} |`,
      '',
    ];

    if (results.bulkProducts.length > 0) {
      summary.push('### Bulk Products Detected\n');
      summary.push('| Product | Score | Packaging | Tags Removed |');
      summary.push('|---------|-------|-----------|-------------|');
      for (const item of results.bulkProducts) {
        summary.push(`| ${item.productTitle} | ${item.score.toFixed(2)} | ${item.packaging_type} | ${item.removedTags.length} |`);
      }
      summary.push('');
    }

    if (opts.execute && applied > 0) {
      summary.push(`### Changes Applied\n`);
      summary.push(`- **${applied}** products had tags stripped to wholesale-only`);
      summary.push(`- **${applyErrors}** products failed to update`);
      summary.push(`- Rollback data saved to \`${ROLLBACK_FILE}\``);
      summary.push('');
    }

    if (results.errors.length > 0) {
      summary.push('### Errors\n');
      for (const err of results.errors) {
        summary.push(`- **${err.productTitle}**: ${err.error}`);
      }
      summary.push('');
    }

    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n'));
  }
}

// ── Rollback command ────────────────────────────────────────────────────────

async function rollback() {
  console.log('='.repeat(70));
  console.log('  ROLLBACK — Restoring original tags');
  console.log('='.repeat(70));

  const data = loadRollbackData();
  const productIds = Object.keys(data);

  if (productIds.length === 0) {
    console.log('No rollback data found. Nothing to restore.');
    return;
  }

  console.log(`Found ${productIds.length} products to restore.\n`);

  let restored = 0;
  let errors = 0;

  for (const id of productIds) {
    const { originalTags, savedAt } = data[id];
    console.log(`Restoring product ${id} (saved ${savedAt})...`);
    console.log(`  Tags: ${originalTags}`);

    try {
      await updateProduct(parseInt(id), { tags: originalTags });
      console.log('  OK');
      restored++;
    } catch (err) {
      console.log(`  FAILED: ${err.message}`);
      errors++;
    }

    await sleep(600);
  }

  console.log(`\nRestored: ${restored}, Errors: ${errors}`);
}

// ── Entry point ─────────────────────────────────────────────────────────────

if (process.argv.includes('--rollback')) {
  rollback().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
} else {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
