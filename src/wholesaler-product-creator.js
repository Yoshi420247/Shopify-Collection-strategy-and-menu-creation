// Wholesaler → Shopify product creator
// When unmatched WC products are found, this pipeline creates complete Shopify listings:
//   1. Fetches full product data from WooCommerce
//   2. Calculates cost using tiered multipliers
//   3. Determines retail price via competitor research + AI
//   4. Generates SEO-optimized PDP via AI
//   5. Creates Shopify product with tags, type, description
//   6. Downloads WC images and uploads to Shopify
//   7. Runs AI variant detection and creates variants
//   8. Sets cost on inventory item
//   9. AI QA check — verifies listing completeness
//  10. Publishes if QA passes
import 'dotenv/config';
import { getWcProduct, extractFullProductInfo } from './woocommerce-client.js';
import {
  createProduct,
  createProductImage,
  getProduct,
  updateProduct,
  updateInventoryItem,
  getLocations,
  setInventoryLevel,
} from './shopify-api.js';
import { determinePrice, calculateCost } from './pricing-engine.js';
import { generatePDP, determineProductType, generateTags } from './pdp-generator.js';
import { loadMapping, saveMapping } from './product-matcher.js';
import fs from 'fs';
import path from 'path';

const CREATION_LOG_FILE = path.join(process.cwd(), 'wholesaler-creation-log.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Logging ────────────────────────────────────────────────────────────
function loadCreationLog() {
  if (fs.existsSync(CREATION_LOG_FILE)) {
    return JSON.parse(fs.readFileSync(CREATION_LOG_FILE, 'utf8'));
  }
  return { runs: [] };
}

function saveCreationLog(log) {
  if (log.runs.length > 30) log.runs = log.runs.slice(-30);
  fs.writeFileSync(CREATION_LOG_FILE, JSON.stringify(log, null, 2));
}

// ── Image handling ─────────────────────────────────────────────────────
async function downloadImage(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return { base64, mediaType: contentType.split(';')[0] };
  } catch {
    return null;
  }
}

async function uploadWcImagesToShopify(wcImages, shopifyProductId) {
  const uploaded = [];
  for (let i = 0; i < wcImages.length; i++) {
    const img = wcImages[i];
    console.log(`    Downloading image ${i + 1}/${wcImages.length}...`);
    const imageData = await downloadImage(img.src);
    if (!imageData) {
      console.log(`    Failed to download image ${i + 1}`);
      continue;
    }

    try {
      const result = await createProductImage(shopifyProductId, {
        attachment: imageData.base64,
        position: i + 1,
        alt: img.alt || '',
      });
      if (result.image) {
        uploaded.push(result.image);
        console.log(`    Uploaded image ${i + 1} (id: ${result.image.id})`);
      }
    } catch (err) {
      console.log(`    Failed to upload image ${i + 1}: ${err.message}`);
    }

    await sleep(600); // Shopify rate limit
  }
  return uploaded;
}

// ── Variant detection ──────────────────────────────────────────────────
async function detectAndCreateVariants(shopifyProduct) {
  // Dynamically import variant modules (they use Gemini/Anthropic)
  const hasGeminiKey = !!process.env.GOOGLE_API_KEY;
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;

  if (!hasGeminiKey && !hasAnthropicKey) {
    console.log('    No AI API keys for variant detection — skipping');
    return { detected: false, reason: 'no_api_key' };
  }

  try {
    const { analyzeProduct } = await import('./variant-analyzer.js');
    const { buildVariantPlan, applyVariantPlan } = await import('./variant-creator.js');

    // Fetch fresh product data with images
    const { product } = await getProduct(shopifyProduct.id);
    if (!product.images || product.images.length === 0) {
      console.log('    No images for variant analysis — skipping');
      return { detected: false, reason: 'no_images' };
    }

    console.log('    Running AI variant analysis...');
    const analysis = await analyzeProduct(product, {
      analysisModel: hasGeminiKey ? 'gemini' : 'sonnet',
      geminiApiKey: process.env.GOOGLE_API_KEY,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    if (!analysis.has_variants) {
      console.log(`    No variants detected (confidence: ${(analysis.confidence * 100).toFixed(0)}%)`);
      return { detected: false, reason: 'no_variants_found', analysis };
    }

    console.log(`    Variants detected: ${JSON.stringify(analysis.detected_variants)}`);

    // Build and apply variant plan
    const plan = buildVariantPlan(product, analysis);
    if (plan.action === 'skip') {
      console.log(`    Variant plan: skip — ${plan.reason}`);
      return { detected: true, applied: false, reason: plan.reason };
    }

    console.log(`    Applying variant plan: ${plan.action} (${plan.proposedVariantCount} variants)`);
    const result = await applyVariantPlan(product, plan);
    console.log(`    Variants applied: ${result.message}`);
    return { detected: true, applied: true, result, analysis };
  } catch (err) {
    console.log(`    Variant detection error: ${err.message}`);
    return { detected: false, reason: `error: ${err.message}` };
  }
}

// ── Set cost on inventory item ─────────────────────────────────────────
async function setCostOnProduct(shopifyProductId, cost) {
  try {
    const { product } = await getProduct(shopifyProductId);
    for (const variant of product.variants) {
      if (variant.inventory_item_id) {
        await updateInventoryItem(variant.inventory_item_id, { cost: cost.toFixed(2) });
        await sleep(300);
      }
    }
    return true;
  } catch (err) {
    console.log(`    Failed to set cost: ${err.message}`);
    return false;
  }
}

// ── AI QA check ────────────────────────────────────────────────────────
async function qaCheck(shopifyProductId) {
  const issues = [];

  try {
    const { product } = await getProduct(shopifyProductId);

    // Check title
    if (!product.title || product.title.length < 3) {
      issues.push('Missing or too-short title');
    }

    // Check description/PDP
    if (!product.body_html || product.body_html.length < 100) {
      issues.push('Missing or too-short product description');
    }

    // Check images
    if (!product.images || product.images.length === 0) {
      issues.push('No images uploaded');
    }

    // Check pricing
    const variant = product.variants[0];
    if (!variant || !variant.price || parseFloat(variant.price) <= 0) {
      issues.push('No price set');
    }

    // Check product type
    if (!product.product_type) {
      issues.push('No product type set');
    }

    // Check tags
    if (!product.tags || product.tags.length === 0) {
      issues.push('No tags set');
    }

    // Check vendor
    if (!product.vendor) {
      issues.push('No vendor set');
    }

    // Check SKU
    if (variant && (!variant.sku || variant.sku.length === 0)) {
      issues.push('No SKU set on variant');
    }

    return {
      passed: issues.length === 0,
      issues,
      product,
    };
  } catch (err) {
    return {
      passed: false,
      issues: [`Failed to fetch product for QA: ${err.message}`],
    };
  }
}

// ── Single product creation pipeline ───────────────────────────────────
async function createSingleProduct(wcProductInfo, options = {}) {
  const { dryRun = false } = options;
  const productName = wcProductInfo.name;
  const startTime = Date.now();

  console.log(`\n  ┌─ Creating: "${productName}"`);
  console.log(`  │  WC ID: ${wcProductInfo.id} | SKU: ${wcProductInfo.sku}`);

  const result = {
    wcId: wcProductInfo.id,
    wcName: productName,
    wcSku: wcProductInfo.sku,
    success: false,
    shopifyId: null,
    steps: {},
  };

  try {
    // ── Step 1: Pricing ──
    console.log('  │  Step 1: Calculating price...');
    const wynPrice = parseFloat(wcProductInfo.price || wcProductInfo.regular_price || 0);
    const productType = determineProductType(productName);

    const pricing = await determinePrice(productName, wynPrice, productType);
    result.steps.pricing = {
      wynPrice,
      shopifyCost: pricing.cost,
      retailPrice: pricing.retailPrice,
      source: pricing.source,
    };
    console.log(`  │    WYN: $${wynPrice} → Cost: $${pricing.cost} → Retail: $${pricing.retailPrice} (${pricing.source})`);

    if (dryRun) {
      console.log('  │  DRY RUN — stopping here');
      result.steps.dryRun = true;
      result.success = true;
      return result;
    }

    // ── Step 2: Generate PDP ──
    console.log('  │  Step 2: Generating product description...');
    const pdp = await generatePDP(wcProductInfo, pricing.retailPrice);
    const pdpLength = pdp.length;
    result.steps.pdp = { length: pdpLength, generated: pdpLength > 100 };
    console.log(`  │    PDP generated (${pdpLength} chars)`);

    // ── Step 3: Generate tags ──
    const tags = generateTags(wcProductInfo);
    result.steps.tags = tags;

    // ── Step 4: Create Shopify product (as draft) ──
    console.log('  │  Step 3: Creating Shopify product...');
    const weight = parseFloat(wcProductInfo.weight) || 0;
    const stockQty = wcProductInfo.stock_quantity ?? 0;

    const productPayload = {
      title: productName,
      body_html: pdp,
      vendor: 'What You Need',
      product_type: productType,
      tags: tags,
      status: 'draft',
      variants: [{
        price: pricing.retailPrice.toFixed(2),
        sku: wcProductInfo.sku || '',
        inventory_management: 'shopify',
        inventory_quantity: stockQty > 0 ? stockQty : 0,
        weight: weight,
        weight_unit: 'g',
      }],
    };

    const createResult = await createProduct(productPayload);
    if (!createResult.product) {
      throw new Error('Failed to create product — no product returned');
    }

    const shopifyProduct = createResult.product;
    result.shopifyId = shopifyProduct.id;
    result.steps.created = true;
    console.log(`  │    Created Shopify product #${shopifyProduct.id}`);

    // ── Step 5: Set cost on inventory item ──
    console.log('  │  Step 4: Setting cost...');
    await setCostOnProduct(shopifyProduct.id, pricing.cost);
    result.steps.costSet = true;

    // ── Step 6: Upload images from WC ──
    if (wcProductInfo.images && wcProductInfo.images.length > 0) {
      console.log(`  │  Step 5: Uploading ${wcProductInfo.images.length} images...`);
      const uploaded = await uploadWcImagesToShopify(wcProductInfo.images, shopifyProduct.id);
      result.steps.images = { total: wcProductInfo.images.length, uploaded: uploaded.length };
      console.log(`  │    Uploaded ${uploaded.length}/${wcProductInfo.images.length} images`);
    } else {
      console.log('  │  Step 5: No WC images to upload');
      result.steps.images = { total: 0, uploaded: 0 };
    }

    // ── Step 7: Variant detection ──
    console.log('  │  Step 6: Checking for variants...');
    const variantResult = await detectAndCreateVariants(shopifyProduct);
    result.steps.variants = variantResult;

    // ── Step 8: QA check ──
    console.log('  │  Step 7: Running QA check...');
    const qa = await qaCheck(shopifyProduct.id);
    result.steps.qa = { passed: qa.passed, issues: qa.issues };

    if (qa.passed) {
      // ── Step 9: Publish ──
      console.log('  │  Step 8: QA passed — publishing...');
      await updateProduct(shopifyProduct.id, { status: 'active' });
      result.steps.published = true;
      result.success = true;
      console.log(`  └─ Published: "${productName}" → Shopify #${shopifyProduct.id}`);
    } else {
      console.log(`  │  Step 8: QA FAILED — keeping as draft`);
      console.log(`  │    Issues: ${qa.issues.join(', ')}`);
      result.steps.published = false;
      result.success = false;
      result.qaIssues = qa.issues;
      console.log(`  └─ Draft (QA failed): "${productName}" → Shopify #${shopifyProduct.id}`);
    }
  } catch (err) {
    result.error = err.message;
    console.log(`  └─ FAILED: "${productName}" — ${err.message}`);
  }

  result.duration = `${((Date.now() - startTime) / 1000).toFixed(1)}s`;
  return result;
}

// ── Main: create all unmatched products ─────────────────────────────
export async function createUnmatchedProducts(options = {}) {
  const { dryRun = false, limit = 0 } = options;
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Wholesaler → Shopify Product Creator              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will create products)'}`);
  if (limit > 0) console.log(`Limit: ${limit} products`);

  // Load the mapping to get unmatched WC products
  const mapping = loadMapping();
  let unmatchedWc = mapping.unmatchedWc || [];

  if (unmatchedWc.length === 0) {
    console.log('\nNo unmatched WC products found.');
    console.log('Run product matching first: npm run wholesaler:match');
    return { created: 0, failed: 0, skipped: 0 };
  }

  console.log(`\nFound ${unmatchedWc.length} unmatched WC products to create.\n`);

  if (limit > 0) {
    unmatchedWc = unmatchedWc.slice(0, limit);
    console.log(`Processing first ${unmatchedWc.length} products (--limit ${limit})\n`);
  }

  // Fetch full product data from WC for each unmatched product
  const results = [];
  let created = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < unmatchedWc.length; i++) {
    const wcStub = unmatchedWc[i];
    console.log(`\n[${i + 1}/${unmatchedWc.length}] Processing WC #${wcStub.id} "${wcStub.name}"...`);

    // Fetch full product details from WooCommerce
    let wcProduct;
    try {
      const rawProduct = await getWcProduct(wcStub.id);
      wcProduct = extractFullProductInfo(rawProduct);
    } catch (err) {
      console.log(`  Skipping — failed to fetch WC product: ${err.message}`);
      results.push({ wcId: wcStub.id, wcName: wcStub.name, skipped: true, error: err.message });
      skipped++;
      continue;
    }

    const result = await createSingleProduct(wcProduct, { dryRun });
    results.push(result);

    if (result.success) {
      created++;

      // Update the mapping: move this product from unmatched to mapped
      if (!dryRun && result.shopifyId) {
        mapping.mappings.push({
          wc_id: wcProduct.id,
          wc_name: wcProduct.name,
          wc_sku: wcProduct.sku,
          shopify_id: result.shopifyId,
          shopify_title: wcProduct.name,
          shopify_status: result.steps.published ? 'active' : 'draft',
          confidence: 100,
          reason: 'Auto-created from WC product',
          approved: true,
        });
        mapping.unmatchedWc = mapping.unmatchedWc.filter(p => p.id !== wcProduct.id);
      }
    } else if (!result.skipped) {
      failed++;
    }

    // Pause between products to avoid overwhelming APIs
    await sleep(1000);
  }

  // Save updated mapping (with newly created products added)
  if (!dryRun && created > 0) {
    saveMapping(mapping);
    console.log(`\nUpdated product mapping with ${created} new entries.`);
  }

  // Save creation log
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const logEntry = {
    timestamp: new Date().toISOString(),
    dryRun,
    duration: `${duration}s`,
    total: unmatchedWc.length,
    created,
    failed,
    skipped,
    results: results.map(r => ({
      wcId: r.wcId,
      wcName: r.wcName,
      shopifyId: r.shopifyId,
      success: r.success,
      error: r.error,
      qaIssues: r.qaIssues,
    })),
  };

  const log = loadCreationLog();
  log.runs.push(logEntry);
  saveCreationLog(log);

  // Summary
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Products created:   ${created}`);
  console.log(`  Products failed:    ${failed}`);
  console.log(`  Products skipped:   ${skipped}`);
  console.log(`  Duration:           ${duration}s`);
  console.log('══════════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('\n── Failed products ──');
    for (const r of results.filter(r => !r.success && !r.skipped)) {
      console.log(`  ! "${r.wcName}" — ${r.error || r.qaIssues?.join(', ') || 'unknown'}`);
    }
  }

  return { created, failed, skipped, results };
}

// ── Fix draft products (re-upload images, re-run QA, publish) ────────
export async function fixDraftProducts(options = {}) {
  const { limit = 0 } = options;
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Fix Draft Products — Image Re-upload & QA        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Collect draft Shopify IDs from all previous creation log runs
  const creationLog = loadCreationLog();
  const draftEntries = [];

  for (const run of creationLog.runs) {
    for (const r of (run.results || [])) {
      if (r.shopifyId && !r.success) {
        // Deduplicate: keep latest entry per Shopify ID
        const existing = draftEntries.findIndex(d => d.shopifyId === r.shopifyId);
        if (existing >= 0) draftEntries[existing] = r;
        else draftEntries.push(r);
      }
    }
  }

  if (draftEntries.length === 0) {
    console.log('\nNo failed drafts found in creation log. Nothing to fix.');
    return { fixed: 0, failed: 0, skipped: 0 };
  }

  let toProcess = draftEntries;
  console.log(`\nFound ${toProcess.length} draft products to fix.`);
  if (limit > 0) {
    toProcess = toProcess.slice(0, limit);
    console.log(`Processing first ${toProcess.length} (--limit ${limit})`);
  }

  const mapping = loadMapping();
  let fixed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const entry = toProcess[i];
    console.log(`\n[${i + 1}/${toProcess.length}] Fixing Shopify #${entry.shopifyId} "${entry.wcName}"...`);

    try {
      // Fetch current Shopify product state
      const { product } = await getProduct(entry.shopifyId);
      if (!product) {
        console.log('  Product not found on Shopify — may have been deleted. Skipping.');
        skipped++;
        continue;
      }

      if (product.status === 'active' && product.images?.length > 0) {
        console.log('  Already active with images — skipping.');
        skipped++;
        continue;
      }

      const hasImages = product.images && product.images.length > 0;

      // Upload images if missing
      if (!hasImages) {
        console.log('  Missing images — fetching from WooCommerce...');
        let wcProduct;
        try {
          const rawProduct = await getWcProduct(entry.wcId);
          wcProduct = extractFullProductInfo(rawProduct);
        } catch (err) {
          console.log(`  Failed to fetch WC product #${entry.wcId}: ${err.message}`);
          failed++;
          continue;
        }

        if (wcProduct.images && wcProduct.images.length > 0) {
          console.log(`  Uploading ${wcProduct.images.length} images...`);
          const uploaded = await uploadWcImagesToShopify(wcProduct.images, entry.shopifyId);
          console.log(`  Uploaded ${uploaded.length}/${wcProduct.images.length} images`);

          if (uploaded.length === 0) {
            console.log('  Still no images uploaded — keeping as draft.');
            failed++;
            continue;
          }
        } else {
          console.log('  WC product has no images either — skipping.');
          skipped++;
          continue;
        }
      }

      // Re-run variant detection (needs images)
      console.log('  Re-running variant detection...');
      await detectAndCreateVariants({ id: entry.shopifyId });

      // Re-run QA check
      console.log('  Re-running QA check...');
      const qa = await qaCheck(entry.shopifyId);

      if (qa.passed) {
        console.log('  QA passed — publishing!');
        await updateProduct(entry.shopifyId, { status: 'active' });

        // Update mapping: add to mappings, remove from unmatchedWc
        mapping.mappings.push({
          wc_id: entry.wcId,
          wc_name: entry.wcName,
          wc_sku: entry.wcSku || '',
          shopify_id: entry.shopifyId,
          shopify_title: entry.wcName,
          shopify_status: 'active',
          confidence: 100,
          reason: 'Auto-created from WC product (fixed draft)',
          approved: true,
        });
        mapping.unmatchedWc = (mapping.unmatchedWc || []).filter(p => p.id !== entry.wcId);

        console.log(`  Published: "${entry.wcName}" → Shopify #${entry.shopifyId}`);
        fixed++;
      } else {
        console.log(`  QA still failing: ${qa.issues.join(', ')}`);
        failed++;
      }
    } catch (err) {
      console.log(`  Error fixing draft: ${err.message}`);
      failed++;
    }

    await sleep(1000);
  }

  // Save updated mapping
  if (fixed > 0) {
    saveMapping(mapping);
    console.log(`\nUpdated product mapping with ${fixed} fixed entries.`);
  }

  // Log results
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const logEntry = {
    timestamp: new Date().toISOString(),
    mode: 'fix-drafts',
    duration: `${duration}s`,
    total: toProcess.length,
    fixed,
    failed,
    skipped,
  };
  const log = loadCreationLog();
  log.runs.push(logEntry);
  saveCreationLog(log);

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Drafts fixed:    ${fixed}`);
  console.log(`  Drafts failed:   ${failed}`);
  console.log(`  Drafts skipped:  ${skipped}`);
  console.log(`  Duration:        ${duration}s`);
  console.log('══════════════════════════════════════════════════════════');

  return { fixed, failed, skipped };
}

// ── CLI entry point ────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log(`
Wholesaler → Shopify Product Creator

Usage:
  node src/wholesaler-product-creator.js [options]

Options:
  --execute      Create products (live mode, default is dry run)
  --fix-drafts   Fix failed drafts: re-upload images, re-run QA, publish
  --limit N      Only process first N products
  --help         Show this help message

Example:
  node src/wholesaler-product-creator.js                       # Dry run
  node src/wholesaler-product-creator.js --execute             # Create all
  node src/wholesaler-product-creator.js --execute --limit 5   # Create first 5
  node src/wholesaler-product-creator.js --fix-drafts          # Fix all drafts
  node src/wholesaler-product-creator.js --fix-drafts --limit 10
`);
} else if (args.includes('--fix-drafts')) {
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] || '0', 10) : 0;

  fixDraftProducts({ limit }).catch(err => {
    console.error('Fix drafts failed:', err.message);
    process.exit(1);
  });
} else {
  const dryRun = !args.includes('--execute');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] || '0', 10) : 0;

  createUnmatchedProducts({ dryRun, limit }).catch(err => {
    console.error('Product creation failed:', err.message);
    process.exit(1);
  });
}
