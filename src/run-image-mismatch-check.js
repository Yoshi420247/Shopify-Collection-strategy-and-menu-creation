#!/usr/bin/env node
// Detect products whose images don't match — flags suspect listings
// where some images appear to show a completely different product.
//
// Usage:
//   node src/run-image-mismatch-check.js                          # Scan all products (dry-run)
//   node src/run-image-mismatch-check.js --max=10                 # Test with 10 products
//   node src/run-image-mismatch-check.js --product-ids=123,456    # Specific products
//   node src/run-image-mismatch-check.js --analysis-model=sonnet  # Use Sonnet for accuracy
//   node src/run-image-mismatch-check.js --min-images=3           # Only check products with 3+ images
//   node src/run-image-mismatch-check.js --tag-suspects           # Add 'image-mismatch-suspect' tag to flagged products
//
// Performance:
//   --workers=N      Process N products in parallel (default: 5)
//
import { config } from './config.js';
import { getAllProductsByVendor, getProduct, updateProduct } from './shopify-api.js';
import { detectImageMismatches } from './image-mismatch-detector.js';
import { PRICING } from './variant-analyzer.js';
import { writeFileSync, appendFileSync } from 'fs';

const SUSPECT_TAG = 'image-mismatch-suspect';

const DEFAULTS = {
  batchSize: 20,
  offset: 0,
  maxProducts: 0,
  productIds: null,
  workers: 5,
  analysisModel: 'gemini',
  minImages: 2,           // Minimum images needed to compare (2+)
  tagSuspects: false,      // Whether to add a tag to flagged products
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = { ...DEFAULTS };

  for (const arg of args) {
    if (arg === '--tag-suspects') options.tagSuspects = true;
    else if (arg.startsWith('--batch-size=')) options.batchSize = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--offset=')) options.offset = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--max=')) options.maxProducts = parseInt(arg.split('=')[1], 10);
    else if (arg.startsWith('--product-ids=')) options.productIds = arg.split('=')[1].split(',').map(Number);
    else if (arg.startsWith('--workers=')) options.workers = Math.max(1, parseInt(arg.split('=')[1], 10));
    else if (arg.startsWith('--analysis-model=')) options.analysisModel = arg.split('=')[1];
    else if (arg.startsWith('--min-images=')) options.minImages = Math.max(2, parseInt(arg.split('=')[1], 10));
  }

  return options;
}

function printBanner(options) {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║    Shopify Image Mismatch Detector               ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  Min images to check:  ${options.minImages}`);
  console.log(`  Batch size:           ${options.batchSize}`);
  console.log(`  Workers:              ${options.workers}`);
  const hasGemini = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const modelNames = { gemini: 'Gemini Flash ($0.10/M)', sonnet: 'Claude Sonnet ($3/M)' };
  const requestedModel = modelNames[options.analysisModel] || options.analysisModel;
  if (options.analysisModel === 'gemini' && !hasGemini) {
    console.log(`  Analysis model:       ${requestedModel}`);
    console.log(`  WARNING:              GEMINI_API_KEY not set — falling back to Sonnet ($3/M)`);
  } else {
    console.log(`  Analysis model:       ${requestedModel}`);
  }
  if (options.tagSuspects) console.log(`  Tag suspects:         ENABLED (will add '${SUSPECT_TAG}' tag)`);
  if (options.offset > 0) console.log(`  Starting offset:      ${options.offset}`);
  if (options.maxProducts > 0) console.log(`  Max products:         ${options.maxProducts}`);
  if (options.productIds) console.log(`  Specific products:    ${options.productIds.join(', ')}`);
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

// ── Process a single product ──────────────────────────────────────────────────

async function processProduct(product, idx, total, options) {
  const log = [];
  const L = (msg) => log.push(msg);

  L(`\n  [${idx + 1}/${total}] ${product.title}`);
  L(`    ID: ${product.id} | Images: ${product.images?.length || 0}`);

  const entry = {
    id: product.id,
    title: product.title,
    handle: product.handle,
    imageCount: (product.images || []).length,
    status: null,
    analysis: null,
    tagged: false,
  };

  // Skip products with too few images
  if ((product.images || []).length < options.minImages) {
    L(`    SKIP: Only ${(product.images || []).length} image(s) (need ${options.minImages}+)`);
    entry.status = 'skipped_few_images';
    return { entry, log, category: 'skipped' };
  }

  // Run image mismatch detection
  const analysis = await detectImageMismatches(product, {
    analysisModel: options.analysisModel,
  });
  entry.analysis = analysis;

  if (analysis.error) {
    L(`    ERROR: ${analysis.reasoning}`);
    entry.status = 'error';
    return { entry, log, category: 'error', usage: analysis.usage };
  }

  if (analysis.skipped) {
    L(`    SKIP: ${analysis.reasoning}`);
    entry.status = 'skipped';
    return { entry, log, category: 'skipped', usage: analysis.usage };
  }

  // Log findings
  L(`    Primary product: ${analysis.primary_product}`);
  L(`    All match: ${analysis.all_match} | Confidence: ${analysis.confidence} | Checked: ${analysis.total_images_checked} images`);

  if (analysis.all_match) {
    L(`    OK: All images match the product`);
    entry.status = 'ok';
    return { entry, log, category: 'ok', usage: analysis.usage };
  }

  // ── MISMATCH DETECTED ──
  const mismatchCount = analysis.mismatched_images.length;
  L(`    SUSPECT: ${mismatchCount} mismatched image(s) detected!`);
  for (const m of analysis.mismatched_images) {
    L(`      Image #${m.image_number}: ${m.description}`);
    L(`        Reason: ${m.reason}`);
    if (m.image_src) L(`        URL: ${m.image_src}`);
  }
  L(`    AI reasoning: ${analysis.reasoning}`);

  entry.status = 'suspect';

  // Optionally tag the product
  if (options.tagSuspects) {
    try {
      const currentTags = product.tags || '';
      if (!currentTags.split(',').map(t => t.trim()).includes(SUSPECT_TAG)) {
        const newTags = currentTags ? `${currentTags}, ${SUSPECT_TAG}` : SUSPECT_TAG;
        await updateProduct(product.id, { id: product.id, tags: newTags });
        L(`    TAGGED: Added '${SUSPECT_TAG}' tag`);
        entry.tagged = true;
      } else {
        L(`    Already tagged with '${SUSPECT_TAG}'`);
      }
    } catch (err) {
      L(`    TAG ERROR: ${err.message}`);
    }
  }

  return { entry, log, category: 'suspect', usage: analysis.usage };
}

// ── Report generation ─────────────────────────────────────────────────────────

function generateMarkdownSummary(results) {
  let md = `## Image Mismatch Detection Report\n\n`;
  md += `**Date:** ${results.timestamp}\n\n`;
  md += `### Summary\n\n`;
  md += `| Metric | Count |\n|--------|-------|\n`;
  md += `| Total Checked | ${results.analyzed} |\n`;
  md += `| Images Match (OK) | ${results.ok} |\n`;
  md += `| **Suspect (Mismatched)** | **${results.suspects}** |\n`;
  md += `| Skipped (few images) | ${results.skipped} |\n`;
  md += `| Errors | ${results.errors} |\n`;
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

  // Suspect products
  const suspects = results.products.filter(p => p.status === 'suspect');
  if (suspects.length > 0) {
    md += `### Suspect Products (Mismatched Images)\n\n`;
    for (let i = 0; i < suspects.length; i++) {
      const p = suspects[i];
      const a = p.analysis;
      md += `#### ${i + 1}. ${p.title}\n`;
      md += `- **Product ID:** ${p.id}\n`;
      md += `- **Handle:** ${p.handle}\n`;
      md += `- **Total images:** ${p.imageCount}\n`;
      md += `- **Primary product:** ${a?.primary_product || 'N/A'}\n`;
      md += `- **Confidence:** ${a?.confidence || 'N/A'}\n`;
      if (p.tagged) md += `- **Tagged:** Yes (${SUSPECT_TAG})\n`;
      md += `\n`;

      if (a?.mismatched_images?.length > 0) {
        md += `| Image # | Shows | Reason |\n|---------|-------|--------|\n`;
        for (const m of a.mismatched_images) {
          md += `| ${m.image_number} | ${m.description} | ${m.reason} |\n`;
        }
        md += `\n`;
      }
      md += `> ${a?.reasoning || ''}\n\n`;
    }
  }

  return md;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs();
  printBanner(options);

  // Validate required environment variables
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
  const hasGeminiKey = !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);

  if (!hasAnthropicKey && !hasGeminiKey) {
    console.error('ERROR: Either ANTHROPIC_API_KEY or GEMINI_API_KEY/GOOGLE_API_KEY is required');
    process.exit(1);
  }
  if (!config.shopify.storeUrl) {
    console.error('ERROR: SHOPIFY_STORE_URL environment variable is required (e.g. "my-store.myshopify.com")');
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

  // Filter to products with enough images
  const eligible = products.filter(p => (p.images || []).length >= options.minImages);
  console.log(`\n${products.length} total products, ${eligible.length} with ${options.minImages}+ images to check`);
  if (options.workers > 1) console.log(`Using ${options.workers} parallel workers`);
  console.log('');

  if (eligible.length === 0) {
    console.log('No products with enough images to check. Exiting.');
    return;
  }

  // Initialize tracking
  const costTracker = createCostTracker();
  const results = {
    timestamp: new Date().toISOString(),
    totalProducts: products.length,
    eligibleProducts: eligible.length,
    analyzed: 0,
    ok: 0,
    suspects: 0,
    skipped: 0,
    errors: 0,
    products: [],
    costs: null,
    totalCost: 0,
  };

  const reportPath = `image-mismatch-report-${Date.now()}.json`;
  const totalBatches = Math.ceil(eligible.length / options.batchSize);
  const startTime = Date.now();

  for (let batchIdx = 0; batchIdx < eligible.length; batchIdx += options.batchSize) {
    const batch = eligible.slice(batchIdx, batchIdx + options.batchSize);
    const batchNum = Math.floor(batchIdx / options.batchSize) + 1;

    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  Batch ${batchNum}/${totalBatches} (products ${batchIdx + 1}–${batchIdx + batch.length} of ${eligible.length})`);
    console.log(`${'─'.repeat(60)}`);

    const batchResults = await runPool(batch, async (product, localIdx) => {
      const globalIdx = batchIdx + localIdx;
      return processProduct(product, globalIdx, eligible.length, options);
    }, options.workers);

    // Collect results and print buffered logs
    for (const r of batchResults) {
      for (const line of r.log) console.log(line);

      if (r.usage) trackUsage(costTracker, r.usage);

      results.analyzed++;
      results.products.push(r.entry);

      if (r.category === 'skipped') results.skipped++;
      else if (r.category === 'error') results.errors++;
      else if (r.category === 'ok') results.ok++;
      else if (r.category === 'suspect') results.suspects++;
    }

    const runningCost = getTotalCost(costTracker);
    console.log(`\n  [Batch ${batchNum} done | Running cost: $${runningCost.toFixed(4)}]`);

    // Save checkpoint
    results.costs = costTracker;
    results.totalCost = runningCost;
    writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`  [Checkpoint saved to ${reportPath}]`);
  }

  results.costs = costTracker;
  results.totalCost = getTotalCost(costTracker);
  results.durationMs = Date.now() - startTime;
  printSummary(results, reportPath);
}

function printSummary(results, reportPath) {
  console.log(`\n\n${'═'.repeat(60)}`);
  console.log('  IMAGE MISMATCH DETECTION SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Total checked:        ${results.analyzed}`);
  console.log(`  Images match (OK):    ${results.ok}`);
  console.log(`  SUSPECT (mismatched): ${results.suspects}`);
  console.log(`  Skipped:              ${results.skipped}`);
  console.log(`  Errors:               ${results.errors}`);
  if (results.durationMs) {
    const secs = (results.durationMs / 1000).toFixed(1);
    const perProduct = results.analyzed > 0 ? (results.durationMs / results.analyzed / 1000).toFixed(2) : '?';
    console.log(`  Duration:             ${secs}s (${perProduct}s/product)`);
  }

  // Cost breakdown
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

  // List suspects
  const suspects = results.products.filter(p => p.status === 'suspect');
  if (suspects.length > 0) {
    console.log(`\n  FLAGGED PRODUCTS (${suspects.length}):`);
    console.log(`${'─'.repeat(60)}`);
    for (const s of suspects) {
      const mismatchCount = s.analysis?.mismatched_images?.length || 0;
      console.log(`  - ${s.title}`);
      console.log(`    ID: ${s.id} | ${mismatchCount} mismatched image(s) | ${s.tagged ? 'TAGGED' : 'not tagged'}`);
      for (const m of (s.analysis?.mismatched_images || [])) {
        console.log(`      Image #${m.image_number}: ${m.description} (${m.reason})`);
      }
    }
  } else {
    console.log('\n  No mismatched images found!');
  }

  // Save final report
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nFull report: ${reportPath}`);

  // GitHub Actions step summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    const summary = generateMarkdownSummary(results);
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
    console.log('GitHub step summary written.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
