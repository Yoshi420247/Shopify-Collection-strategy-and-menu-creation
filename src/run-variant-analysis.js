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
//   --screen               Use cheap Gemini Flash screening before analysis (~50% savings)
//   --skip-existing        Skip products that already have color variants
//   --analysis-model=X     gemini (default, cheapest), sonnet (most accurate), auto (gemini + escalate)
//
// Performance:
//   --workers=N            Process N products in parallel (default: 5)
//
import { config } from './config.js';
import { getAllProductsByVendor, getProduct } from './shopify-api.js';
import { analyzeProduct, screenProduct, productAlreadyHasColorVariants, PRICING } from './variant-analyzer.js';
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
  screen: false,           // Use cheap Gemini screening before analysis
  skipExisting: false,     // Skip products that already have color variants
  workers: 5,              // Parallel workers for processing products concurrently
  analysisModel: 'gemini', // gemini (cheapest), sonnet (accurate), auto (gemini + escalate)
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
    else if (arg.startsWith('--workers=')) options.workers = Math.max(1, parseInt(arg.split('=')[1], 10));
    else if (arg.startsWith('--analysis-model=')) options.analysisModel = arg.split('=')[1];
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
  console.log(`  Workers:             ${options.workers}`);
  const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const modelNames = { gemini: 'Gemini Flash ($0.10/M)', sonnet: 'Claude Sonnet ($3/M)', auto: 'Gemini Flash → Sonnet escalation' };
  const requestedModel = modelNames[options.analysisModel] || options.analysisModel;
  if ((options.analysisModel === 'gemini' || options.analysisModel === 'auto') && !hasGemini) {
    console.log(`  Analysis model:      ${requestedModel}`);
    console.log(`  ⚠ WARNING:          GEMINI_API_KEY not set — falling back to Sonnet ($3/M)`);
  } else {
    console.log(`  Analysis model:      ${requestedModel}`);
  }
  if (options.screen) {
    const screenModel = hasGemini ? 'Gemini Flash' : 'Haiku (no GEMINI_API_KEY)';
    console.log(`  Screening:           ENABLED (${screenModel})`);
  }
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

// ── Cost tracker ──────────────────────────────────────────────────────────────

function createCostTracker() {
  return {
    'gemini-flash': { inputTokens: 0, outputTokens: 0, calls: 0, cost: 0 },
    'haiku':        { inputTokens: 0, outputTokens: 0, calls: 0, cost: 0 },
    'sonnet':       { inputTokens: 0, outputTokens: 0, calls: 0, cost: 0 },
  };
}

function trackUsage(costTracker, usage) {
  if (!usage || !usage.model) return;
  // Handle escalation: if this was an auto-escalated call, track both models
  if (usage.escalatedFrom) {
    trackUsage(costTracker, usage.escalatedFrom);
  }
  const bucket = costTracker[usage.model];
  if (!bucket) return;
  bucket.inputTokens += usage.inputTokens || 0;
  bucket.outputTokens += usage.outputTokens || 0;
  bucket.calls++;
  bucket.cost += usage.cost || 0;
}

function getTotalCost(costTracker) {
  return Object.values(costTracker).reduce((sum, b) => sum + b.cost, 0);
}

function formatCostBreakdown(costTracker) {
  const lines = [];
  for (const [model, data] of Object.entries(costTracker)) {
    if (data.calls === 0) continue;
    const inK = (data.inputTokens / 1000).toFixed(1);
    const outK = (data.outputTokens / 1000).toFixed(1);
    lines.push(`    ${model.padEnd(14)} ${String(data.calls).padStart(5)} calls | ${inK.padStart(8)}K in | ${outK.padStart(7)}K out | $${data.cost.toFixed(4)}`);
  }
  return lines;
}

// ── Parallel worker pool ──────────────────────────────────────────────────────

async function runPool(items, fn, concurrency) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

// ── Process a single product (returns structured result + buffered log) ───────

async function processProduct(product, idx, total, options) {
  const log = [];  // Buffer log lines to print atomically
  const L = (msg) => log.push(msg);

  L(`\n  [${idx + 1}/${total}] ${product.title}`);
  L(`    ID: ${product.id} | Variants: ${product.variants?.length || 0} | Images: ${product.images?.length || 0}`);

  const entry = { id: product.id, title: product.title, status: null, screen: null, analysis: null, plan: null, result: null };

  // ── Pre-filter: skip products that already have color variants ──
  if (options.skipExisting && productAlreadyHasColorVariants(product)) {
    L(`    SKIP: Already has color variants set up`);
    entry.status = 'skipped_existing';
    return { entry, log, category: 'skipped' };
  }

  // ── Screening: cheap check before expensive Sonnet call ──────────
  if (options.screen) {
    const screenModel = process.env.GEMINI_API_KEY ? 'Gemini Flash' : 'Haiku';
    L(`    Screening with ${screenModel}...`);
    const screenResult = await screenProduct(product);
    entry.screen = screenResult;
    if (!screenResult.needsAnalysis) {
      L(`    SCREEN (${screenResult.model}): ${screenResult.reason} — skipping full analysis`);
      entry.status = 'screened_out';
      return { entry, log, category: 'screened', usage: [screenResult.usage] };
    }
    L(`    SCREEN (${screenResult.model}): ${screenResult.reason} — proceeding to full analysis`);
  }

  // ── Full AI Analysis ────────────────────────────────────────────
  const analysis = await analyzeProduct(product, {
    analysisModel: options.analysisModel,
    confidenceThreshold: options.confidenceThreshold,
  });
  entry.analysis = analysis;

  if (analysis.error) {
    L(`    ERROR: ${analysis.reasoning}`);
    entry.status = 'error';
    return { entry, log, category: 'error', usage: [entry.screen?.usage, analysis.usage] };
  }

  if (analysis.skipped) {
    L(`    SKIP: ${analysis.reasoning}`);
    entry.status = 'skipped';
    return { entry, log, category: 'skipped', usage: [entry.screen?.usage, analysis.usage] };
  }

  // Log what the AI found
  L(`    AI: has_variants=${analysis.has_variants} | confidence=${analysis.confidence} | items=${analysis.item_count}`);
  L(`    Reasoning: ${analysis.reasoning}`);
  if (analysis.detected_variants?.color) L(`    Colors: ${analysis.detected_variants.color.join(', ')}`);
  if (analysis.detected_variants?.size) L(`    Sizes: ${analysis.detected_variants.size.join(', ')}`);
  if (analysis.detected_variants?.style) L(`    Styles: ${analysis.detected_variants.style.join(', ')}`);

  // ── Confidence gate ──────────────────────────────────────────────
  if (analysis.confidence < options.confidenceThreshold) {
    L(`    LOW CONFIDENCE (${analysis.confidence} < ${options.confidenceThreshold}) — skipping`);
    entry.status = 'low_confidence';
    return { entry, log, category: 'skipped', usage: [entry.screen?.usage, analysis.usage] };
  }

  // ── Build variant plan ───────────────────────────────────────────
  const plan = buildVariantPlan(product, analysis);
  entry.plan = plan;

  L(`    Plan: ${plan.action} — ${plan.reason}`);
  if (plan.changes.length > 0) plan.changes.forEach(c => L(`      • ${c}`));

  if (plan.action === 'skip') {
    entry.status = 'skip';
    return { entry, log, category: 'correct', usage: [entry.screen?.usage, analysis.usage] };
  }

  entry.status = plan.action;
  const category = plan.action === 'create_variants' ? 'needsVariants' : 'needsUpdates';

  // ── Apply changes (if not dry-run) ──────────────────────────────
  if (options.mode === 'apply' && plan.action !== 'skip') {
    const applyResult = await applyVariantPlan(product, plan);
    entry.result = applyResult;
    L(`    Result: ${applyResult.success ? 'SUCCESS' : 'FAILED'} — ${applyResult.message}`);
    if (applyResult.success) {
      return { entry, log, category, applied: true, usage: [entry.screen?.usage, analysis.usage] };
    }
  }

  return { entry, log, category, usage: [entry.screen?.usage, analysis.usage] };
}

// ── Report generation ─────────────────────────────────────────────────────────

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
  if (results.mode !== 'dry-run') {
    md += `| **Successfully Applied** | **${results.applied}** |\n`;
  }
  md += `\n`;

  // Cost breakdown
  if (results.costs) {
    md += `### AI Cost Breakdown\n\n`;
    md += `| Model | Calls | Input Tokens | Output Tokens | Cost |\n`;
    md += `|-------|------:|-------------:|--------------:|-----:|\n`;
    for (const [model, data] of Object.entries(results.costs)) {
      if (data.calls === 0) continue;
      md += `| ${model} | ${data.calls} | ${data.inputTokens.toLocaleString()} | ${data.outputTokens.toLocaleString()} | $${data.cost.toFixed(4)} |\n`;
    }
    md += `| **Total** | | | | **$${results.totalCost.toFixed(4)}** |\n`;
    md += `\n`;
  }

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

// ── Main ──────────────────────────────────────────────────────────────────────

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

  console.log(`\nProcessing ${products.length} products (offset: ${options.offset})${options.maxProducts > 0 ? ` (max: ${options.maxProducts})` : ''}`);
  if (options.workers > 1) console.log(`Using ${options.workers} parallel workers`);
  console.log('');

  if (products.length === 0) {
    console.log('No products to process. Exiting.');
    return;
  }

  // Initialize results tracker and cost tracker
  const costTracker = createCostTracker();
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
    costs: null,
    totalCost: 0,
  };

  const reportPath = `variant-analysis-report-${Date.now()}.json`;
  const totalBatches = Math.ceil(products.length / options.batchSize);
  const startTime = Date.now();

  for (let batchIdx = 0; batchIdx < products.length; batchIdx += options.batchSize) {
    const batch = products.slice(batchIdx, batchIdx + options.batchSize);
    const batchNum = Math.floor(batchIdx / options.batchSize) + 1;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Batch ${batchNum}/${totalBatches} (products ${batchIdx + 1}–${batchIdx + batch.length} of ${products.length})`);
    console.log(`${'─'.repeat(60)}`);

    // Process products in parallel using worker pool
    const batchResults = await runPool(batch, async (product, localIdx) => {
      const globalIdx = batchIdx + localIdx;
      return processProduct(product, globalIdx, products.length, options);
    }, options.workers);

    // Collect results and print buffered logs in order
    for (const r of batchResults) {
      // Print buffered log lines for this product
      for (const line of r.log) console.log(line);

      // Track costs
      if (r.usage) {
        for (const u of r.usage) trackUsage(costTracker, u);
      }

      results.analyzed++;
      results.products.push(r.entry);

      if (r.category === 'skipped') results.skipped++;
      else if (r.category === 'screened') { results.screened++; results.skipped++; }
      else if (r.category === 'error') results.errors++;
      else if (r.category === 'correct') results.correct++;
      else if (r.category === 'needsVariants') results.needsVariants++;
      else if (r.category === 'needsUpdates') results.needsUpdates++;
      if (r.applied) results.applied++;
    }

    // Print running cost
    const runningCost = getTotalCost(costTracker);
    console.log(`\n  [Batch ${batchNum} done | Running cost: $${runningCost.toFixed(4)}]`);

    // Save checkpoint after each batch
    results.costs = costTracker;
    results.totalCost = runningCost;
    writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`  [Checkpoint saved to ${reportPath}]`);
  }

  results.costs = costTracker;
  results.totalCost = getTotalCost(costTracker);
  results.durationMs = Date.now() - startTime;
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
  console.log(`(Original analysis: ${report.analyzed} products on ${report.timestamp})`);
  if (report.totalCost) {
    console.log(`(Original analysis cost: $${report.totalCost.toFixed(4)})`);
  }
  console.log('');

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
    costs: null,
    totalCost: 0,
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
    console.log(`  Screened out:         ${results.screened}`);
  }
  console.log(`  Errors:               ${results.errors}`);
  if (results.mode !== 'dry-run') {
    console.log(`  Successfully applied: ${results.applied}`);
  }
  if (results.durationMs) {
    const secs = (results.durationMs / 1000).toFixed(1);
    const perProduct = results.analyzed > 0 ? (results.durationMs / results.analyzed / 1000).toFixed(2) : '?';
    console.log(`  Duration:             ${secs}s (${perProduct}s/product)`);
  }

  // ── Cost breakdown ──────────────────────────────────────────────
  if (results.costs) {
    const lines = formatCostBreakdown(results.costs);
    if (lines.length > 0) {
      console.log(`${'─'.repeat(60)}`);
      console.log(`  AI COST BREAKDOWN`);
      console.log(`${'─'.repeat(60)}`);
      for (const line of lines) console.log(line);
      console.log(`${'─'.repeat(60)}`);
      console.log(`  TOTAL COST:           $${results.totalCost.toFixed(4)}`);
    }
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
