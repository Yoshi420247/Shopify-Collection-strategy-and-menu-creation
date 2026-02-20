#!/usr/bin/env node
// Main orchestrator for AI-powered Shopify variant analysis and creation
//
// Usage:
//   node src/run-variant-analysis.js --dry-run          # Analyze and report only
//   node src/run-variant-analysis.js --apply             # Analyze AND create variants
//   node src/run-variant-analysis.js --dry-run --max=10  # Test with 10 products
//   node src/run-variant-analysis.js --product-ids=123,456  # Specific products
//
import { config } from './config.js';
import { getAllProductsByVendor, getProduct } from './shopify-api.js';
import { analyzeProduct } from './variant-analyzer.js';
import { buildVariantPlan, applyVariantPlan } from './variant-creator.js';
import { writeFileSync, appendFileSync } from 'fs';

const DEFAULTS = {
  batchSize: 20,
  offset: 0,
  maxProducts: 0,          // 0 = all
  confidenceThreshold: 0.7,
  mode: 'dry-run',
  productIds: null,
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { ...DEFAULTS };

  for (const arg of args) {
    if (arg === '--apply') options.mode = 'apply';
    else if (arg === '--dry-run') options.mode = 'dry-run';
    else if (arg.startsWith('--batch-size=')) options.batchSize = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--offset=')) options.offset = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--max=')) options.maxProducts = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--confidence=')) options.confidenceThreshold = parseFloat(arg.split('=')[1]);
    else if (arg.startsWith('--product-ids=')) options.productIds = arg.split('=')[1].split(',').map(Number);
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

      // ── Step 1: AI Analysis ──────────────────────────────────────────
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
  console.log(`\n\n${'═'.repeat(60)}`);
  console.log('  SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Total analyzed:       ${results.analyzed}`);
  console.log(`  Needs new variants:   ${results.needsVariants}`);
  console.log(`  Needs variant updates: ${results.needsUpdates}`);
  console.log(`  Already correct:      ${results.correct}`);
  console.log(`  Skipped/low conf:     ${results.skipped}`);
  console.log(`  Errors:               ${results.errors}`);
  if (options.mode === 'apply') {
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
  if (options.mode === 'apply' && results.errors > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
