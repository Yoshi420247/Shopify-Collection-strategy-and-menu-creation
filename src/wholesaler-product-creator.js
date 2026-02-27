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
const EXPECTED_VENDOR = 'What You Need';

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

// ── Already-created index ─────────────────────────────────────────────
// Builds a set of WC IDs that already have a Shopify product created
// (from the creation log). This prevents duplicate creation AND avoids
// re-running expensive AI pricing on products that are just drafts
// waiting for fix-drafts to upload their images.
function buildAlreadyCreatedIndex() {
  const log = loadCreationLog();
  const index = new Map(); // wcId → { shopifyId, success }
  for (const run of log.runs) {
    for (const r of (run.results || [])) {
      if (r.shopifyId && r.wcId) {
        index.set(r.wcId, { shopifyId: r.shopifyId, success: r.success });
      }
    }
  }
  return index;
}

// ── Image handling ─────────────────────────────────────────────────────
// Uses Shopify's src URL feature — Shopify fetches the image directly from WC's CDN.
// This avoids the E2BIG error caused by passing multi-MB base64 strings through the API.
async function uploadWcImagesToShopify(wcImages, shopifyProductId) {
  const uploaded = [];
  for (let i = 0; i < wcImages.length; i++) {
    const img = wcImages[i];
    const imgSrc = typeof img === 'string' ? img : img.src;
    const imgAlt = typeof img === 'string' ? '' : (img.alt || '');

    console.log(`    Uploading image ${i + 1}/${wcImages.length} (via URL)...`);

    try {
      const result = await createProductImage(shopifyProductId, {
        src: imgSrc,
        position: i + 1,
        alt: imgAlt,
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

    // Safety: never create a product with retail ≤ wholesale
    if (wynPrice > 0 && pricing.retailPrice > 0 && pricing.retailPrice <= wynPrice * 1.5) {
      console.log(`  │    ⚠ Retail $${pricing.retailPrice} too close to wholesale $${wynPrice} — recalculating`);
      const safeCost = wynPrice * 2;
      pricing.retailPrice = safeCost * 2;
      pricing.retailPrice = Math.ceil(pricing.retailPrice) - 0.01;
      pricing.cost = safeCost;
      pricing.source += '_price_guard';
    }

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

// ── Main: create all unmatched products (parallel worker pool) ───────
export async function createUnmatchedProducts(options = {}) {
  const { dryRun = false, limit = 0, concurrency = 5 } = options;
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Wholesaler → Shopify Product Creator              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will create products)'}`);
  console.log(`Concurrency: ${concurrency} workers`);
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

  // Filter out WC products that already have a Shopify product from a previous run.
  // These should go through --fix-drafts instead of being re-created (which would
  // duplicate the product AND re-run expensive AI price analysis).
  const alreadyCreated = buildAlreadyCreatedIndex();
  const preFilterCount = unmatchedWc.length;
  unmatchedWc = unmatchedWc.filter(wc => !alreadyCreated.has(wc.id));
  if (preFilterCount !== unmatchedWc.length) {
    const skippedCount = preFilterCount - unmatchedWc.length;
    console.log(`Skipping ${skippedCount} products that already have Shopify listings (use --fix-drafts to repair them)\n`);
  }

  if (limit > 0) {
    unmatchedWc = unmatchedWc.slice(0, limit);
    console.log(`Processing first ${unmatchedWc.length} products (--limit ${limit})\n`);
  }

  // Shared state across workers (atomic index for lock-free dispatch)
  const total = unmatchedWc.length;
  const results = new Array(total);
  let nextIndex = 0;
  let created = 0;
  let failed = 0;
  let skipped = 0;

  async function worker(workerId) {
    while (nextIndex < total) {
      const i = nextIndex++;
      if (i >= total) break; // another worker grabbed the last item
      const wcStub = unmatchedWc[i];

      console.log(`\n[${i + 1}/${total}] [W${workerId}] Processing WC #${wcStub.id} "${wcStub.name}"...`);

      // Fetch full product details from WooCommerce
      let wcProduct;
      try {
        const rawProduct = await getWcProduct(wcStub.id);
        wcProduct = extractFullProductInfo(rawProduct);
      } catch (err) {
        console.log(`  [W${workerId}] Skipping — failed to fetch WC product: ${err.message}`);
        results[i] = { wcId: wcStub.id, wcName: wcStub.name, skipped: true, error: err.message };
        skipped++;
        continue;
      }

      const result = await createSingleProduct(wcProduct, { dryRun, workerId });
      results[i] = result;

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

      // Periodic mapping save every 25 products (crash recovery)
      if (!dryRun && (created + failed) % 25 === 0 && created > 0) {
        saveMapping(mapping);
        console.log(`  [checkpoint] Saved mapping (${created} created so far)`);
      }
    }
  }

  // Launch parallel workers
  const workers = Math.min(concurrency, total);
  console.log(`Launching ${workers} parallel workers...\n`);
  await Promise.all(
    Array.from({ length: workers }, (_, i) => worker(i + 1))
  );

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
    concurrency: workers,
    duration: `${duration}s`,
    total: unmatchedWc.length,
    created,
    failed,
    skipped,
    results: results.filter(Boolean).map(r => ({
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
  console.log(`  Workers used:       ${workers}`);
  console.log(`  Duration:           ${duration}s`);
  console.log('══════════════════════════════════════════════════════════');

  if (failed > 0) {
    console.log('\n── Failed products ──');
    for (const r of results.filter(r => r && !r.success && !r.skipped)) {
      console.log(`  ! "${r.wcName}" — ${r.error || r.qaIssues?.join(', ') || 'unknown'}`);
    }
  }

  return { created, failed, skipped, results: results.filter(Boolean) };
}

// ── Fix draft products (parallel worker pool) ───────────────────────
export async function fixDraftProducts(options = {}) {
  const { limit = 0, concurrency = 5 } = options;
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║       Fix Draft Products — Image Re-upload & QA        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Concurrency: ${concurrency} workers`);

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
  const total = toProcess.length;
  let nextIndex = 0;
  let fixed = 0;
  let failed = 0;
  let skipped = 0;

  async function worker(workerId) {
    while (nextIndex < total) {
      const i = nextIndex++;
      if (i >= total) break;
      const entry = toProcess[i];

      console.log(`\n[${i + 1}/${total}] [W${workerId}] Fixing Shopify #${entry.shopifyId} "${entry.wcName}"...`);

      try {
        // Fetch current Shopify product state
        const { product } = await getProduct(entry.shopifyId);
        if (!product) {
          console.log(`  [W${workerId}] Product not found on Shopify — may have been deleted. Skipping.`);
          skipped++;
          continue;
        }

        // Vendor guard — only touch "What You Need" products
        if (product.vendor !== EXPECTED_VENDOR) {
          console.log(`  [W${workerId}] Wrong vendor "${product.vendor}" (expected "${EXPECTED_VENDOR}") — skipping.`);
          skipped++;
          continue;
        }

        if (product.status === 'active' && product.images?.length > 0) {
          console.log(`  [W${workerId}] Already active with images — skipping.`);
          skipped++;
          continue;
        }

        const hasImages = product.images && product.images.length > 0;

        // Upload images if missing
        if (!hasImages) {
          console.log(`  [W${workerId}] Missing images — fetching from WooCommerce...`);
          let wcProduct;
          try {
            const rawProduct = await getWcProduct(entry.wcId);
            wcProduct = extractFullProductInfo(rawProduct);
          } catch (err) {
            console.log(`  [W${workerId}] Failed to fetch WC product #${entry.wcId}: ${err.message}`);
            failed++;
            continue;
          }

          if (wcProduct.images && wcProduct.images.length > 0) {
            console.log(`  [W${workerId}] Uploading ${wcProduct.images.length} images...`);
            const uploaded = await uploadWcImagesToShopify(wcProduct.images, entry.shopifyId);
            console.log(`  [W${workerId}] Uploaded ${uploaded.length}/${wcProduct.images.length} images`);

            if (uploaded.length === 0) {
              console.log(`  [W${workerId}] Still no images uploaded — keeping as draft.`);
              failed++;
              continue;
            }
          } else {
            console.log(`  [W${workerId}] WC product has no images either — skipping.`);
            skipped++;
            continue;
          }
        }

        // Re-run variant detection (needs images)
        console.log(`  [W${workerId}] Re-running variant detection...`);
        await detectAndCreateVariants({ id: entry.shopifyId });

        // Re-run QA check
        console.log(`  [W${workerId}] Re-running QA check...`);
        const qa = await qaCheck(entry.shopifyId);

        if (qa.passed) {
          console.log(`  [W${workerId}] QA passed — publishing!`);
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

          console.log(`  [W${workerId}] Published: "${entry.wcName}" → Shopify #${entry.shopifyId}`);
          fixed++;
        } else {
          console.log(`  [W${workerId}] QA still failing: ${qa.issues.join(', ')}`);
          failed++;
        }
      } catch (err) {
        console.log(`  [W${workerId}] Error fixing draft: ${err.message}`);
        failed++;
      }

      // Periodic mapping save every 25 products (crash recovery)
      if ((fixed + failed) % 25 === 0 && fixed > 0) {
        saveMapping(mapping);
        console.log(`  [checkpoint] Saved mapping (${fixed} fixed so far)`);
      }
    }
  }

  // Launch parallel workers
  const workers = Math.min(concurrency, total);
  console.log(`Launching ${workers} parallel workers...\n`);
  await Promise.all(
    Array.from({ length: workers }, (_, i) => worker(i + 1))
  );

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
    concurrency: workers,
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
  console.log(`  Workers used:    ${workers}`);
  console.log(`  Duration:        ${duration}s`);
  console.log('══════════════════════════════════════════════════════════');

  return { fixed, failed, skipped };
}

// ── CLI helpers ────────────────────────────────────────────────────────
function parseIntArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? parseInt(args[idx + 1] || '0', 10) : 0;
}

// ── CLI entry point ────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--help')) {
  console.log(`
Wholesaler → Shopify Product Creator

Usage:
  node src/wholesaler-product-creator.js [options]

Options:
  --execute         Create products (live mode, default is dry run)
  --fix-drafts      Fix failed drafts: re-upload images, re-run QA, publish
  --limit N         Only process first N products
  --concurrency N   Number of parallel workers (default: 5)
  --help            Show this help message

Example:
  node src/wholesaler-product-creator.js                                # Dry run
  node src/wholesaler-product-creator.js --execute                      # Create all
  node src/wholesaler-product-creator.js --execute --concurrency 10     # 10 workers
  node src/wholesaler-product-creator.js --execute --limit 5            # Create first 5
  node src/wholesaler-product-creator.js --fix-drafts                   # Fix all drafts
  node src/wholesaler-product-creator.js --fix-drafts --concurrency 8   # 8 workers
`);
} else if (args.includes('--fix-drafts')) {
  const limit = parseIntArg('--limit');
  const concurrency = parseIntArg('--concurrency') || 5;

  fixDraftProducts({ limit, concurrency }).catch(err => {
    console.error('Fix drafts failed:', err.message);
    process.exit(1);
  });
} else {
  const dryRun = !args.includes('--execute');
  const limit = parseIntArg('--limit');
  const concurrency = parseIntArg('--concurrency') || 5;

  createUnmatchedProducts({ dryRun, limit, concurrency }).catch(err => {
    console.error('Product creation failed:', err.message);
    process.exit(1);
  });
}
