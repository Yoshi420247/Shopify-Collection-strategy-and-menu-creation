#!/usr/bin/env node
// Main orchestrator for AI-powered Shopify variant analysis and creation
//
// Usage:
//   node src/run-variant-analysis.js --dry-run                     # Analyze and report only
//   node src/run-variant-analysis.js --apply                       # Analyze AND create variants
//   node src/run-variant-analysis.js --dry-run --max=10            # Test with 10 products
//   node src/run-variant-analysis.js --product-ids=123,456         # Specific products
//
// Cost-saving flags:
//   --from-report=<path>   Apply a previous dry-run report (ZERO AI cost)
//   --screen               Use cheap Haiku screening before Sonnet (~50% savings)
//   --skip-existing        Skip products that already have color variants
//
import { config } from './config.js';
import { getAllProductsByVendor, getProduct } from './shopify-api.js';
import { analyzeProduct, screenProduct, productAlreadyHasColorVariants } from './variant-analyzer.js';
import { buildVariantPlan, applyVariantPlan } from './variant-creator.js';
import { writeFileSync, appendFileSync, readFileSync, existsSync } from 'fs';

const DEFAULTS = {
  batchSize: 20,
  offset: 0,
  maxProducts: 0,          // 0 = all
  confidenceThreshold: 0.7,
  mode: 'dry-run',
  productIds: null,
  fromReport: null,        // Path to a dry-run report to reuse (skips AI entirely)
  screen: false,           // Use cheap Haiku screening before expensive Sonnet analysis
  skipExisting: false,     // Skip products that already have color variants
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { ...DEFAULTS };

  for (const arg of args) {
    if (arg === '--apply') options.mode = 'apply';
    else if (arg === '--dry-run') options.mode = 'dry-run';
    else if (arg === '--screen') options.screen = true;
    else if (arg === '--skip-existing') options.skipExisting = true;
    else if (arg.startsWith('--batch-size=')) options.batchSize = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--offset=')) options.offset = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--max=')) options.maxProducts = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--confidence=')) options.confidenceThreshold = parseFloat(arg.split('=')[1]);
    else if (arg.startsWith('--product-ids=')) options.productIds = arg.split('=')[1].split(',').map(Number);
    else if (arg.startsWith('--from-report=')) options.fromReport = arg.split('=')[1];
  }

  return options;
}

function printBanner(options) {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     Shopify AI Variant Analyzer & Creator       ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Mode:                ${options.mode.toUpperCase()}`);
  console.log(`  Confidence threshold: ${options.confidenceThreshold}`);
  console.log(`  Batch size:          ${options.batchSize}`);
  if (options.screen) console.log(`  Haiku screening:     ENABLED (saves ~50% on AI costs)`);
  if (options.skipExisting) console.log(`  Skip existing:       ENABLED`);
  if (options.fromReport) console.log(`  From report:         ${options.fromReport} (no AI cost)`);
  if (options.offset > 0) console.log(`  Starting offset:     ${options.offset}`);
  if (options.maxProducts > 0) console.log(`  Max products:        ${options.maxProducts}`);
  if (options.productIds) console.log(`  Specific products:   ${options.productIds.join(', ')}`);
  console.log('');
}

async function fetchProducts(options) {
  if (options.productIds) {
    console.log(`Fetching ${options.productIds.length} specific product(s)...`);
    const products = [];
    for (const id of options.productIds) {
      try {
        const data = await getProduct(id);
        if (data.product) products.push(data.product);
        else console.log(`  Warning: Product ${id} not found`);
      } catch (err) {
        console.log(`  Warning: Failed to fetch product ${id}: ${err.message}`);
      }
    }
    return products;
  }

  console.log(`Fetching all "${config.vendor}" vendor products...`);
  const products = await getAllProductsByVendor(config.vendor);
  console.log(`Found ${products.length} products`);
  return products;
}

function generateMarkdownSummary(results) {
  let md = `## AI Variant Analysis Report\n\n`;
  md += `**Mode:** \`${results.mode}\` | **Date:** ${results.timestamp}\n\n`;
  md += `### Summary\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Total Analyzed | ${results.analyzed} |\n`;
  md += `| Needs New Variants | ${results.needsVariants} |\n`;
  md += `| Needs Updates | ${results.needsUpdates} |\n`;
  md += `| Already Correct | ${results.correct} |\n`;
  md += `| Skipped (no images/low confidence) | ${results.skipped} |\n`;
  md += `| Errors | ${results.errors} |\n`;
  if (results.mode === 'apply') {
    md += `| **Successfully Applied** | **${results.applied}** |\n`;
  }
  md += `\n`;

  // Products that need changes
  const actionProducts = results.products.filter(
    p => p.status === 'create_variants' || p.status === 'update_variants'
  );

  if (actionProducts.length > 0) {
    md += `### Products Needing Changes\n\n`;
    md += `| # | Product | Current | Proposed | Changes |\n`;
    md += `|---|---------|---------|----------|--------|\n`;
    for (let i = 0; i < Math.min(actionProducts.length, 100); i++) {
      const p = actionProducts[i];
      const title = p.title.length > 45 ? p.title.substring(0, 42) + '...' : p.title;
      const changes = p.plan?.changes?.join('; ') || 'N/A';
      const current = p.plan?.currentVariantCount || '?';
      const proposed = p.plan?.proposedVariantCount || '?';
      const applied = p.result?.success ? ' ✅' : (results.mode === 'apply' ? ' ❌' : '');
      md += `| ${i + 1} | ${title}${applied} | ${current} | ${proposed} | ${changes} |\n`;
    }
    if (actionProducts.length > 100) {
      md += `\n*... and ${actionProducts.length - 100} more products*\n`;
    }
  }

  // Error summary
  const errorProducts = results.products.filter(p => p.status === 'error');
  if (errorProducts.length > 0) {
    md += `\n### Errors (${errorProducts.length})\n\n`;
    for (const p of errorProducts.slice(0, 20)) {
      md += `- **${p.title}** (ID: ${p.id}): ${p.analysis?.reasoning || 'Unknown error'}\n`;
    }
  }

  return md;
}

async function main() {
  const options = parseArgs();
  printBanner(options);

  // ── FROM-REPORT MODE: apply a previous dry-run without re-running AI ──
  if (options.fromReport) {
    return await applyFromReport(options);
  }

  // Validate required environment variables
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is required');
    process.exit(1);
  }
  if (!config.shopify.accessToken) {
    console.error('ERROR: SHOPIFY_ACCESS_TOKEN environment variable is required');
    process.exit(1);
  }

  // Fetch products
  const allProducts = await fetchProducts(options);

  // Apply offset and max
  let products = allProducts.slice(options.offset);
  if (options.maxProducts > 0) {
    products = products.slice(0, options.maxProducts);
  }

  console.log(`\nProcessing ${products.length} products (offset: ${options.offset})${options.maxProducts > 0 ? ` (max: ${options.maxProducts})` : ''}\n`);

  if (products.length === 0) {
    console.log('No products to process. Exiting.');
    return;
  }

  // Initialize results tracker
  const results = {
    timestamp: new Date().toISOString(),
    mode: options.mode,
    totalProducts: products.length,
    analyzed: 0,
    needsVariants: 0,
    needsUpdates: 0,
    correct: 0,
    skipped: 0,
    screened: 0,
    errors: 0,
    applied: 0,
    products: [],
  };

  const reportPath = `variant-analysis-report-${Date.now()}.json`;

  // Process products in batches
  const totalBatches = Math.ceil(products.length / options.batchSize);

  for (let batchIdx = 0; batchIdx < products.length; batchIdx += options.batchSize) {
    const batch = products.slice(batchIdx, batchIdx + options.batchSize);
    const batchNum = Math.floor(batchIdx / options.batchSize) + 1;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Batch ${batchNum}/${totalBatches} (products ${batchIdx + 1}–${batchIdx + batch.length} of ${products.length})`);
    console.log(`${'─'.repeat(60)}`);

    for (const product of batch) {
      results.analyzed++;
      const idx = results.analyzed;

      console.log(`\n  [${idx}/${products.length}] ${product.title}`);
      console.log(`    ID: ${product.id} | Variants: ${product.variants?.length || 0} | Images: ${product.images?.length || 0}`);

      // ── Pre-filter: skip products that already have color variants ──
      if (options.skipExisting && productAlreadyHasColorVariants(product)) {
        console.log(`    SKIP: Already has color variants set up`);
        results.skipped++;
        results.products.push({ id: product.id, title: product.title, status: 'skipped_existing', analysis: null, plan: null, result: null });
        continue;
      }

      // ── Screening: cheap check before expensive Sonnet call ──────────
      if (options.screen) {
        const screenModel = process.env.GEMINI_API_KEY ? 'Gemini Flash' : 'Haiku';
        console.log(`    Screening with ${screenModel}...`);
        const screenResult = await screenProduct(product);
        if (!screenResult.needsAnalysis) {
          console.log(`    SCREEN (${screenResult.model}): ${screenResult.reason} — skipping full analysis`);
          results.screened++;
          results.skipped++;
          results.products.push({ id: product.id, title: product.title, status: 'screened_out', screen: screenResult, analysis: null, plan: null, result: null });
          continue;
        }
        console.log(`    SCREEN (${screenResult.model}): ${screenResult.reason} — proceeding to full analysis`);
      }

      // ── Step 1: Full AI Analysis (Sonnet) ──────────────────────────
      const analysis = await analyzeProduct(product, {
        confidenceThreshold: options.confidenceThreshold,
      });

      if (analysis.error) {
        console.log(`    ERROR: ${analysis.reasoning}`);
        results.errors++;
        results.products.push({ id: product.id, title: product.title, status: 'error', analysis, plan: null, result: null });
        continue;
      }

      if (analysis.skipped) {
        console.log(`    SKIP: ${analysis.reasoning}`);
        results.skipped++;
        results.products.push({ id: product.id, title: product.title, status: 'skipped', analysis, plan: null, result: null });
        continue;
      }

      // Log what the AI found
      console.log(`    AI: has_variants=${analysis.has_variants} | confidence=${analysis.confidence} | items=${analysis.item_count}`);
      console.log(`    Reasoning: ${analysis.reasoning}`);
      if (analysis.detected_variants?.color) {
        console.log(`    Colors: ${analysis.detected_variants.color.join(', ')}`);
      }
      if (analysis.detected_variants?.size) {
        console.log(`    Sizes: ${analysis.detected_variants.size.join(', ')}`);
      }
      if (analysis.detected_variants?.style) {
        console.log(`    Styles: ${analysis.detected_variants.style.join(', ')}`);
      }

      // ── Step 2: Confidence gate ──────────────────────────────────────
      if (analysis.confidence < options.confidenceThreshold) {
        console.log(`    LOW CONFIDENCE (${analysis.confidence} < ${options.confidenceThreshold}) — skipping`);
        results.skipped++;
        results.products.push({ id: product.id, title: product.title, status: 'low_confidence', analysis, plan: null, result: null });
        continue;
      }

      // ── Step 3: Build variant plan ───────────────────────────────────
      const plan = buildVariantPlan(product, analysis);

      console.log(`    Plan: ${plan.action} — ${plan.reason}`);
      if (plan.changes.length > 0) {
        plan.changes.forEach(c => console.log(`      • ${c}`));
      }

      // Categorize
      if (plan.action === 'skip') {
        results.correct++;
      } else if (plan.action === 'create_variants') {
        results.needsVariants++;
      } else if (plan.action === 'update_variants') {
        results.needsUpdates++;
      }

      // ── Step 4: Apply changes (if not dry-run) ──────────────────────
      let applyResult = null;
      if (options.mode === 'apply' && plan.action !== 'skip') {
        applyResult = await applyVariantPlan(product, plan);
        console.log(`    Result: ${applyResult.success ? 'SUCCESS' : 'FAILED'} — ${applyResult.message}`);
        if (applyResult.success) results.applied++;
      }

      results.products.push({
        id: product.id,
        title: product.title,
        status: plan.action,
        analysis,
        plan,
        result: applyResult,
      });
    }

    // Save checkpoint after each batch
    writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n  [Checkpoint saved to ${reportPath}]`);
  }

  // ── Final summary ──────────────────────────────────────────────────────
  printSummary(results, options, reportPath);
}

/**
 * Apply variant changes from a previously saved dry-run report.
 * Skips ALL AI analysis — zero Claude API cost.
 */
async function applyFromReport(options) {
  const reportFile = options.fromReport;
  if (!existsSync(reportFile)) {
    console.error(`ERROR: Report file not found: ${reportFile}`);
    process.exit(1);
  }
  if (!config.shopify.accessToken) {
    console.error('ERROR: SHOPIFY_ACCESS_TOKEN environment variable is required');
    process.exit(1);
  }

  console.log(`Loading previous analysis from: ${reportFile}`);
  const report = JSON.parse(readFileSync(reportFile, 'utf8'));

  // Find products that need changes
  const actionable = report.products.filter(
    p => p.status === 'create_variants' || p.status === 'update_variants'
  );

  console.log(`Found ${actionable.length} products with pending variant changes`);
  console.log(`(Original analysis: ${report.analyzed} products on ${report.timestamp})\n`);

  if (actionable.length === 0) {
    console.log('Nothing to apply. Exiting.');
    return;
  }

  const results = {
    timestamp: new Date().toISOString(),
    mode: 'apply-from-report',
    sourceReport: reportFile,
    totalProducts: actionable.length,
    analyzed: 0,
    needsVariants: 0,
    needsUpdates: 0,
    correct: 0,
    skipped: 0,
    screened: 0,
    errors: 0,
    applied: 0,
    products: [],
  };

  for (let i = 0; i < actionable.length; i++) {
    const entry = actionable[i];
    results.analyzed++;
    console.log(`\n  [${i + 1}/${actionable.length}] ${entry.title} (ID: ${entry.id})`);
    console.log(`    Cached plan: ${entry.plan.action} — ${entry.plan.reason}`);

    // Re-fetch product to get current state (variants may have changed since dry-run)
    let product;
    try {
      const data = await getProduct(entry.id);
      product = data.product;
      if (!product) throw new Error('Product not found');
    } catch (err) {
      console.log(`    ERROR: Could not fetch product: ${err.message}`);
      results.errors++;
      results.products.push({ ...entry, result: { success: false, message: err.message } });
      continue;
    }

    // Re-build plan with fresh product data but cached analysis
    const plan = buildVariantPlan(product, entry.analysis);
    if (plan.action === 'skip') {
      console.log(`    SKIP (product may have been updated since dry-run): ${plan.reason}`);
      results.correct++;
      results.products.push({ ...entry, plan, result: null });
      continue;
    }

    const applyResult = await applyVariantPlan(product, plan);
    console.log(`    Result: ${applyResult.success ? 'SUCCESS' : 'FAILED'} — ${applyResult.message}`);
    if (applyResult.success) results.applied++;
    else results.errors++;

    results.products.push({ ...entry, plan, result: applyResult });
  }

  const reportPath = `variant-analysis-report-${Date.now()}.json`;
  printSummary(results, options, reportPath);
}

function printSummary(results, options, reportPath) {
  console.log(`\n\n${'═'.repeat(60)}`);
  console.log('  SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Total analyzed:       ${results.analyzed}`);
  console.log(`  Needs new variants:   ${results.needsVariants}`);
  console.log(`  Needs variant updates: ${results.needsUpdates}`);
  console.log(`  Already correct:      ${results.correct}`);
  console.log(`  Skipped/low conf:     ${results.skipped}`);
  if (results.screened > 0) {
    console.log(`  Screened out (Haiku): ${results.screened}`);
  }
  console.log(`  Errors:               ${results.errors}`);
  if (results.mode !== 'dry-run') {
    console.log(`  Successfully applied: ${results.applied}`);
  }
  console.log(`${'═'.repeat(60)}`);

  // Final report save
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nFull report: ${reportPath}`);

  // GitHub Actions step summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = generateMarkdownSummary(results);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    console.log('GitHub step summary written.');
  }

  // Exit with error code if there were failures in apply mode
  if (results.mode !== 'dry-run' && results.errors > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
