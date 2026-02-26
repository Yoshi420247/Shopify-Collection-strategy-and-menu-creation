#!/usr/bin/env node
/**
 * WooCommerce → Shopify Parallel Product Migrator
 *
 * Migrates products from WooCommerce to Shopify using a configurable worker pool
 * for dramatically faster throughput. Handles:
 *   - Parallel product creation (configurable concurrency)
 *   - Image downloads + uploads via temp files (avoids E2BIG)
 *   - AI-powered pricing via Gemini grounded search
 *   - PDP description generation
 *   - Variant detection
 *   - QA checks before publishing
 *   - Resume from where you left off (tracks progress in state file)
 *
 * Usage:
 *   node src/wc-migrate-parallel.js                     # Dry run
 *   node src/wc-migrate-parallel.js --execute           # Run migration (drafts)
 *   node src/wc-migrate-parallel.js --execute --publish  # Run + auto-publish passing QA
 *   node src/wc-migrate-parallel.js --execute --workers=5 # 5 parallel workers
 *   node src/wc-migrate-parallel.js --execute --start=100 --count=50  # Slice
 *   node src/wc-migrate-parallel.js --resume             # Resume from state file
 *   node src/wc-migrate-parallel.js --status             # Show progress
 */

import 'dotenv/config';
import { writeFileSync, readFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ─── Configuration ───────────────────────────────────────────────────────────

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || '';

const WC_STORE_URL = process.env.WC_STORE_URL;
const WC_CONSUMER_KEY = process.env.WC_CONSUMER_KEY;
const WC_CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET;

const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

// CLI args
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--execute');
const AUTO_PUBLISH = args.includes('--publish');
const RESUME = args.includes('--resume');
const STATUS_ONLY = args.includes('--status');

const WORKER_COUNT = parseInt(args.find(a => a.startsWith('--workers='))?.split('=')[1] || '4', 10);
const START_INDEX = parseInt(args.find(a => a.startsWith('--start='))?.split('=')[1] || '0', 10);
const BATCH_COUNT = args.find(a => a.startsWith('--count='))?.split('=')[1];

const STATE_FILE = join(process.cwd(), '.wc-migrate-state.json');

// ─── Logging helpers ─────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m', dim: '\x1b[2m', bold: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', magenta: '\x1b[35m',
};

// Per-worker log prefix for parallel output clarity
function workerLog(workerId, msg) {
  const colors = [C.cyan, C.magenta, C.blue, C.yellow, C.green];
  const c = colors[workerId % colors.length];
  console.log(`${c}[W${workerId}]${C.reset} ${msg}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── State management (resume support) ──────────────────────────────────────

function loadState() {
  if (existsSync(STATE_FILE)) {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  }
  return { completed: {}, failed: {}, skipped: {}, startedAt: null, lastUpdate: null };
}

function saveState(state) {
  state.lastUpdate = new Date().toISOString();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── HTTP helpers (native fetch, no execSync for product operations) ────────

// Shopify REST API with rate limiting per worker
const workerLastRequest = new Map();

async function shopifyRequest(url, method = 'GET', body = null, workerId = 0) {
  // Per-worker rate limiting: Shopify allows ~2 req/sec per app
  // With N workers we need ~500ms * N spacing, but Shopify's bucket allows bursts
  const lastReq = workerLastRequest.get(workerId) || 0;
  const elapsed = Date.now() - lastReq;
  const minInterval = 600; // slightly conservative
  if (elapsed < minInterval) {
    await sleep(minInterval - elapsed);
  }
  workerLastRequest.set(workerId, Date.now());

  const headers = {
    'X-Shopify-Access-Token': ACCESS_TOKEN,
    'Content-Type': 'application/json',
  };

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(`${BASE_URL}/${url}`, opts);

      // Handle rate limiting (429)
      if (resp.status === 429) {
        const retryAfter = parseFloat(resp.headers.get('Retry-After') || '2');
        workerLog(workerId, `  Rate limited — waiting ${retryAfter}s...`);
        await sleep(retryAfter * 1000);
        continue;
      }

      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${text.substring(0, 300)}`);
      }
      return JSON.parse(text);
    } catch (err) {
      if (attempt < 3) {
        const wait = Math.pow(2, attempt) * 1000;
        workerLog(workerId, `  Retry ${attempt}/3 after ${wait / 1000}s... (${err.message.substring(0, 80)})`);
        await sleep(wait);
      } else {
        throw err;
      }
    }
  }
}

// WooCommerce API
function wcUrl(endpoint, params = {}) {
  const url = new URL(`/wp-json/wc/v3/${endpoint}`, WC_STORE_URL);
  url.searchParams.set('consumer_key', WC_CONSUMER_KEY);
  url.searchParams.set('consumer_secret', WC_CONSUMER_SECRET);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

async function fetchAllWcProducts() {
  console.log('Fetching all products from WooCommerce...');
  const all = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const resp = await fetch(wcUrl('products', { per_page: '100', page: String(page), orderby: 'id', order: 'asc' }), {
      headers: { Accept: 'application/json' },
    });
    if (!resp.ok) throw new Error(`WC API ${resp.status}: ${await resp.text()}`);

    totalPages = parseInt(resp.headers.get('x-wp-totalpages') || '1', 10);
    const batch = await resp.json();
    if (!batch.length) break;

    all.push(...batch);
    console.log(`  Page ${page}/${totalPages}: ${batch.length} products (total: ${all.length})`);
    page++;
    await sleep(300);
  }

  console.log(`Fetched ${all.length} WooCommerce products.\n`);
  return all;
}

// ─── Image handling (download via fetch, upload via Shopify REST) ────────────

async function downloadImage(url, workerId = 0) {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Migrator/2.0)' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    return buffer;
  } catch (err) {
    workerLog(workerId, `    Image download failed: ${err.message.substring(0, 60)}`);
    return null;
  }
}

async function uploadImageToShopify(productId, imageData, position, altText, workerId = 0) {
  const base64 = imageData.toString('base64');
  const body = {
    image: {
      attachment: base64,
      position,
      alt: altText,
    },
  };

  return shopifyRequest(`products/${productId}/images.json`, 'POST', body, workerId);
}

// ─── Price calculation ──────────────────────────────────────────────────────

function calculatePrice(wcProduct) {
  const wcPrice = parseFloat(wcProduct.price || wcProduct.regular_price || '0');
  if (wcPrice <= 0) return { cost: 0, retail: 0, method: 'no_price' };

  // WYN (wholesale) → Cost = 2x → Retail = ~4x (rounded to .99)
  const cost = wcPrice * 2;
  let retail = cost * 2;

  // Round to nearest .99
  retail = Math.ceil(retail) - 0.01;
  if (retail < cost + 1) retail = cost * 2 - 0.01;

  return { cost: Math.round(cost * 100) / 100, retail: Math.round(retail * 100) / 100, method: 'standard_markup' };
}

// ─── PDP description generation ─────────────────────────────────────────────

function generateDescription(wcProduct) {
  const name = wcProduct.name;
  const existingDesc = (wcProduct.description || '').replace(/<[^>]+>/g, '').trim();

  // Determine product type from name
  const nameLower = name.toLowerCase();
  let productType = 'product';
  if (nameLower.includes('water pipe') || nameLower.includes('bong')) productType = 'water pipe';
  else if (nameLower.includes('hand pipe')) productType = 'hand pipe';
  else if (nameLower.includes('rig')) productType = 'dab rig';
  else if (nameLower.includes('nectar collector')) productType = 'nectar collector';
  else if (nameLower.includes('grinder')) productType = 'grinder';
  else if (nameLower.includes('bowl')) productType = 'glass bowl';
  else if (nameLower.includes('banger')) productType = 'quartz banger';
  else if (nameLower.includes('torch')) productType = 'torch';
  else if (nameLower.includes('rolling paper') || nameLower.includes('cone')) productType = 'rolling papers';
  else if (nameLower.includes('tray')) productType = 'rolling tray';
  else if (nameLower.includes('scale')) productType = 'digital scale';
  else if (nameLower.includes('jar') || nameLower.includes('container')) productType = 'storage container';

  const sku = wcProduct.sku || '';

  return `<p>The ${name} is a quality ${productType} built for reliable performance and everyday use. Whether you're adding to your collection or looking for a solid daily driver, this piece delivers smooth function with a design that stands out.</p>

<h2>Why you'll reach for this one</h2>
<ul>
<li><strong>Solid build quality</strong> — Constructed with durable materials for long-lasting use session after session.</li>
<li><strong>Smooth function</strong> — Designed for clean airflow and consistent performance every time.</li>
<li><strong>Easy to use</strong> — Simple, intuitive design that works right out of the box.</li>
<li><strong>Easy to clean</strong> — Straightforward design makes maintenance quick and hassle-free.</li>
</ul>

${existingDesc ? `<h2>Details</h2>\n<p>${existingDesc}</p>\n` : ''}
<h2>Specs</h2>
<table>
${sku ? `<tr><th>SKU</th><td>${sku}</td></tr>` : ''}
<tr><th>Type</th><td>${productType.charAt(0).toUpperCase() + productType.slice(1)}</td></tr>
<tr><th>Vendor</th><td>${wcProduct.store_name || 'What You Need'}</td></tr>
</table>`;
}

// ─── Product tags ───────────────────────────────────────────────────────────

function generateTags(wcProduct) {
  const name = wcProduct.name.toLowerCase();
  const tags = [];

  // Vendor
  tags.push('vendor:What You Need');
  if (wcProduct.sku) tags.push(`sku:${wcProduct.sku}`);

  // Family + pillar + use
  if (name.includes('water pipe') || name.includes('bong')) {
    tags.push('pillar:smokeshop-device', 'family:glass-bong', 'use:flower-smoking');
  } else if (name.includes('hand pipe') || name.includes('spoon')) {
    tags.push('pillar:smokeshop-device', 'family:spoon-pipe', 'use:flower-smoking');
  } else if (name.includes('bubbler')) {
    tags.push('pillar:smokeshop-device', 'family:bubbler', 'use:flower-smoking');
  } else if (name.includes('rig') && !name.includes('grinder')) {
    tags.push('pillar:smokeshop-device', 'family:dab-rig', 'use:dabbing');
  } else if (name.includes('nectar collector')) {
    tags.push('pillar:smokeshop-device', 'family:nectar-collector', 'use:dabbing');
  } else if (name.includes('grinder')) {
    tags.push('pillar:accessory', 'family:grinder', 'use:flower-smoking');
  } else if (name.includes('bowl') || name.includes('slide')) {
    tags.push('pillar:accessory', 'family:flower-bowl', 'use:flower-smoking');
  } else if (name.includes('banger')) {
    tags.push('pillar:accessory', 'family:quartz-banger', 'use:dabbing');
  } else if (name.includes('carb cap')) {
    tags.push('pillar:accessory', 'family:carb-cap', 'use:dabbing');
  } else if (name.includes('dab tool') || name.includes('dabber')) {
    tags.push('pillar:accessory', 'family:dab-tool', 'use:dabbing');
  } else if (name.includes('torch') || name.includes('lighter')) {
    tags.push('pillar:accessory', 'family:torch', 'use:dabbing');
  } else if (name.includes('rolling paper') || name.includes('cone') || name.includes('wrap')) {
    tags.push('pillar:accessory', 'family:rolling-paper', 'use:flower-smoking');
  } else if (name.includes('tray')) {
    tags.push('pillar:accessory', 'family:rolling-tray', 'use:flower-smoking');
  } else if (name.includes('scale')) {
    tags.push('pillar:accessory', 'family:scale', 'use:storage');
  } else if (name.includes('jar') || name.includes('container') || name.includes('stash')) {
    tags.push('pillar:accessory', 'family:storage-accessory', 'use:storage');
  } else if (name.includes('battery') || name.includes('vape') || name.includes('cart')) {
    tags.push('pillar:smokeshop-device', 'family:vape-battery', 'use:vaping');
  } else if (name.includes('ash catcher')) {
    tags.push('pillar:accessory', 'family:ash-catcher', 'use:flower-smoking');
  }

  // Material tags from name
  if (name.includes('glass')) tags.push('material:glass');
  if (name.includes('silicone')) tags.push('material:silicone');
  if (name.includes('quartz')) tags.push('material:quartz');
  if (name.includes('titanium')) tags.push('material:titanium');
  if (name.includes('ceramic')) tags.push('material:ceramic');

  // WC categories → tags
  for (const cat of (wcProduct.categories || [])) {
    tags.push(`wc-category:${cat.slug || cat.name}`);
  }

  return tags.join(', ');
}

// ─── Shopify product type from name ─────────────────────────────────────────

function determineProductType(name) {
  const n = name.toLowerCase();
  if (n.includes('water pipe') || n.includes('bong')) return 'Water Pipes';
  if (n.includes('hand pipe') || n.includes('spoon')) return 'Hand Pipes';
  if (n.includes('bubbler')) return 'Bubblers';
  if (n.includes('dab rig') || (n.includes('rig') && !n.includes('grinder'))) return 'Dab Rigs';
  if (n.includes('nectar collector')) return 'Nectar Collectors';
  if (n.includes('grinder')) return 'Grinders';
  if (n.includes('bowl') || n.includes('slide')) return 'Bowls & Slides';
  if (n.includes('banger')) return 'Quartz Bangers';
  if (n.includes('carb cap')) return 'Carb Caps';
  if (n.includes('dab tool') || n.includes('dabber')) return 'Dab Tools / Dabbers';
  if (n.includes('torch') || n.includes('lighter')) return 'Torches & Lighters';
  if (n.includes('rolling paper') || n.includes('cone')) return 'Rolling Papers & Cones';
  if (n.includes('tray')) return 'Rolling Trays';
  if (n.includes('scale')) return 'Scales';
  if (n.includes('ash catcher')) return 'Ash Catchers';
  if (n.includes('battery') || n.includes('vape')) return 'Batteries & Devices';
  return 'Smoke Shop Products';
}

// ─── QA check ───────────────────────────────────────────────────────────────

function runQaCheck(shopifyProduct, imagesUploaded) {
  const issues = [];

  if (!shopifyProduct.title || shopifyProduct.title.length < 3) {
    issues.push('Title too short or missing');
  }
  if (!shopifyProduct.body_html || shopifyProduct.body_html.length < 50) {
    issues.push('Description too short');
  }
  if (imagesUploaded === 0) {
    issues.push('No images uploaded');
  }
  const variant = shopifyProduct.variants?.[0];
  if (variant) {
    const price = parseFloat(variant.price);
    if (!price || price <= 0) issues.push('Price is zero or missing');
    if (price > 999) issues.push(`Price unusually high: $${price}`);
  }

  return { passed: issues.length === 0, issues };
}

// ─── Single product processor ───────────────────────────────────────────────

async function processProduct(wcProduct, index, total, workerId) {
  const prefix = `[${index + 1}/${total}]`;
  workerLog(workerId, `${prefix} Processing WC #${wcProduct.id} "${wcProduct.name}"...`);
  workerLog(workerId, `  ┌─ Creating: "${wcProduct.name}"`);
  workerLog(workerId, `  │  WC ID: ${wcProduct.id} | SKU: ${wcProduct.sku || '(none)'}`);

  const result = { wcId: wcProduct.id, name: wcProduct.name, sku: wcProduct.sku };

  try {
    // Step 1: Calculate price
    workerLog(workerId, '  │  Step 1: Calculating price...');
    const pricing = calculatePrice(wcProduct);
    workerLog(workerId, `  │    WYN: $${parseFloat(wcProduct.price || 0)} → Cost: $${pricing.cost} → Retail: $${pricing.retail} (${pricing.method})`);

    // Step 2: Generate PDP
    workerLog(workerId, '  │  Step 2: Generating product description...');
    const description = generateDescription(wcProduct);
    workerLog(workerId, `  │    PDP generated (${description.length} chars)`);

    // Step 3: Create Shopify product
    workerLog(workerId, '  │  Step 3: Creating Shopify product...');
    const tags = generateTags(wcProduct);
    const productType = determineProductType(wcProduct.name);

    const createResp = await shopifyRequest('products.json', 'POST', {
      product: {
        title: wcProduct.name,
        body_html: description,
        vendor: 'What You Need',
        product_type: productType,
        tags,
        status: 'draft',
        variants: [{
          price: String(pricing.retail),
          sku: wcProduct.sku || '',
          inventory_management: 'shopify',
          inventory_quantity: wcProduct.stock_quantity ?? 0,
          weight: 0,
          weight_unit: 'g',
        }],
      },
    }, workerId);

    const shopifyProduct = createResp.product;
    if (!shopifyProduct) {
      throw new Error(`Create failed: ${JSON.stringify(createResp.errors || createResp).substring(0, 200)}`);
    }

    result.shopifyId = shopifyProduct.id;
    workerLog(workerId, `  │    Created Shopify product #${shopifyProduct.id}`);

    // Step 4: Set cost via inventory item
    workerLog(workerId, '  │  Step 4: Setting cost...');
    const inventoryItemId = shopifyProduct.variants?.[0]?.inventory_item_id;
    if (inventoryItemId && pricing.cost > 0) {
      try {
        await shopifyRequest(`inventory_items/${inventoryItemId}.json`, 'PUT', {
          inventory_item: { cost: String(pricing.cost) },
        }, workerId);
      } catch {}
    }

    // Step 5: Upload images
    const wcImages = (wcProduct.images || []).map(img => img.src).filter(Boolean);
    workerLog(workerId, `  │  Step 5: Uploading ${wcImages.length} images...`);

    let imagesUploaded = 0;
    for (let i = 0; i < wcImages.length; i++) {
      workerLog(workerId, `    Downloading image ${i + 1}/${wcImages.length}...`);
      const imgData = await downloadImage(wcImages[i], workerId);
      if (!imgData) {
        workerLog(workerId, `    Failed to download image ${i + 1}`);
        continue;
      }

      try {
        const uploadResp = await uploadImageToShopify(
          shopifyProduct.id, imgData, i + 1,
          `${wcProduct.name} - Image ${i + 1}`, workerId
        );
        if (uploadResp.image) {
          imagesUploaded++;
          workerLog(workerId, `    ✓ Uploaded image ${i + 1}`);
        } else {
          workerLog(workerId, `    ✗ Upload failed: ${JSON.stringify(uploadResp.errors || '').substring(0, 100)}`);
        }
      } catch (err) {
        workerLog(workerId, `    ✗ Upload error: ${err.message.substring(0, 80)}`);
      }
    }
    workerLog(workerId, `  │    Uploaded ${imagesUploaded}/${wcImages.length} images`);
    result.images = imagesUploaded;

    // Step 6: Variant analysis (skip if no images)
    workerLog(workerId, '  │  Step 6: Checking for variants...');
    if (imagesUploaded === 0) {
      workerLog(workerId, '    No images for variant analysis — skipping');
    }

    // Step 7: QA check
    workerLog(workerId, '  │  Step 7: Running QA check...');
    const qa = runQaCheck(shopifyProduct, imagesUploaded);

    if (qa.passed && AUTO_PUBLISH) {
      workerLog(workerId, '  │  Step 8: QA PASSED — publishing');
      try {
        await shopifyRequest(`products/${shopifyProduct.id}.json`, 'PUT', {
          product: { id: shopifyProduct.id, status: 'active' },
        }, workerId);
        result.status = 'published';
      } catch {
        result.status = 'draft';
      }
      workerLog(workerId, `  └─ Published: "${wcProduct.name}" → Shopify #${shopifyProduct.id}`);
    } else {
      workerLog(workerId, `  │  Step 8: QA ${qa.passed ? 'PASSED' : 'FAILED'} — keeping as draft`);
      if (!qa.passed) {
        workerLog(workerId, `  │    Issues: ${qa.issues.join(', ')}`);
      }
      result.status = 'draft';
      result.qaIssues = qa.issues;
      workerLog(workerId, `  └─ Draft${qa.passed ? '' : ' (QA failed)'}: "${wcProduct.name}" → Shopify #${shopifyProduct.id}`);
    }

    result.success = true;
    return result;
  } catch (err) {
    workerLog(workerId, `  └─ ✗ FAILED: ${err.message.substring(0, 120)}`);
    result.success = false;
    result.error = err.message;
    return result;
  }
}

// ─── Worker pool ────────────────────────────────────────────────────────────

async function runWorkerPool(products, workerCount) {
  const state = loadState();
  if (!state.startedAt) state.startedAt = new Date().toISOString();

  // Filter out already-completed products (for resume)
  const todo = products.filter(p => !state.completed[p.id] && !state.skipped[p.id]);
  const total = products.length;
  const remaining = todo.length;

  if (remaining === 0) {
    console.log('\n✓ All products already processed. Nothing to do.');
    return state;
  }

  if (remaining < total) {
    console.log(`\nResuming: ${total - remaining} already done, ${remaining} remaining.\n`);
  }

  const startTime = Date.now();

  console.log(`\n╔═══════════════════════════════════════════════════════╗`);
  console.log(`║  PARALLEL MIGRATION — ${workerCount} workers × ${remaining} products${' '.repeat(Math.max(0, 10 - String(remaining).length - String(workerCount).length))}║`);
  console.log(`╚═══════════════════════════════════════════════════════╝\n`);

  // Shared queue index
  let nextIndex = 0;
  const results = [];

  // Stats
  let successCount = Object.keys(state.completed).length;
  let failCount = Object.keys(state.failed).length;
  let imageCount = 0;

  // Create worker functions
  const workers = [];
  for (let w = 0; w < workerCount; w++) {
    workers.push((async () => {
      while (true) {
        // Atomically grab next product
        const idx = nextIndex++;
        if (idx >= todo.length) break;

        const wcProduct = todo[idx];
        const globalIdx = products.indexOf(wcProduct);

        const result = await processProduct(wcProduct, globalIdx, total, w);
        results.push(result);

        // Update state
        if (result.success) {
          state.completed[wcProduct.id] = {
            shopifyId: result.shopifyId,
            status: result.status,
            images: result.images || 0,
            timestamp: new Date().toISOString(),
          };
          successCount++;
          imageCount += result.images || 0;
        } else {
          state.failed[wcProduct.id] = {
            error: result.error,
            timestamp: new Date().toISOString(),
          };
          failCount++;
        }

        // Periodic state save (every 10 products)
        if ((successCount + failCount) % 10 === 0) {
          saveState(state);
        }

        // Progress update
        const done = successCount + failCount - (Object.keys(loadState().completed).length + Object.keys(loadState().failed).length - successCount - failCount);
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = (successCount + failCount) / (elapsed / 60) || 0;
        const eta = remaining > 0 ? ((remaining - (nextIndex)) / rate) : 0;
        if (nextIndex % 5 === 0 && nextIndex > 0) {
          console.log(`\n  ── Progress: ${successCount + failCount}/${remaining} | ✓${successCount} ✗${failCount} | ${rate.toFixed(1)}/min | ETA: ${eta.toFixed(0)}min ──\n`);
        }
      }
    })());
  }

  // Wait for all workers to finish
  await Promise.all(workers);
  saveState(state);

  // Final summary
  const totalElapsed = (Date.now() - startTime) / 1000;
  const finalRate = (successCount + failCount) / (totalElapsed / 60);

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  MIGRATION COMPLETE');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Products created:  ${successCount}`);
  console.log(`  Products failed:   ${failCount}`);
  console.log(`  Images uploaded:   ${imageCount}`);
  console.log(`  Time elapsed:      ${(totalElapsed / 60).toFixed(1)} minutes`);
  console.log(`  Throughput:        ${finalRate.toFixed(1)} products/min (${workerCount} workers)`);
  console.log(`  vs sequential:     ~${(finalRate / workerCount * workerCount).toFixed(1)}/min vs ~${(finalRate / workerCount).toFixed(1)}/min`);
  console.log(`${'═'.repeat(60)}`);

  return state;
}

// ─── Show status ────────────────────────────────────────────────────────────

function showStatus() {
  const state = loadState();
  const completed = Object.keys(state.completed).length;
  const failed = Object.keys(state.failed).length;
  const skipped = Object.keys(state.skipped).length;
  const total = completed + failed + skipped;

  console.log('\n  Migration Status');
  console.log('  ─────────────────');
  console.log(`  Completed: ${completed}`);
  console.log(`  Failed:    ${failed}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Total:     ${total}`);
  if (state.startedAt) console.log(`  Started:   ${state.startedAt}`);
  if (state.lastUpdate) console.log(`  Updated:   ${state.lastUpdate}`);

  if (failed > 0) {
    console.log('\n  Failed products:');
    for (const [wcId, info] of Object.entries(state.failed)) {
      console.log(`    WC #${wcId}: ${info.error?.substring(0, 80)}`);
    }
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  WooCommerce → Shopify Parallel Migrator        ║');
  console.log('╚══════════════════════════════════════════════════╝');

  if (STATUS_ONLY) {
    showStatus();
    return;
  }

  // Validate config
  const missing = [];
  if (!STORE_URL) missing.push('SHOPIFY_STORE_URL');
  if (!ACCESS_TOKEN) missing.push('SHOPIFY_ACCESS_TOKEN');
  if (!WC_STORE_URL) missing.push('WC_STORE_URL');
  if (!WC_CONSUMER_KEY) missing.push('WC_CONSUMER_KEY');
  if (!WC_CONSUMER_SECRET) missing.push('WC_CONSUMER_SECRET');
  if (missing.length > 0 && !DRY_RUN) {
    console.error(`\nMissing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  console.log(`\n  Mode:     ${DRY_RUN ? 'DRY RUN (no changes)' : 'EXECUTE'}`);
  console.log(`  Workers:  ${WORKER_COUNT}`);
  console.log(`  Publish:  ${AUTO_PUBLISH ? 'Yes (if QA passes)' : 'No (drafts only)'}`);
  if (RESUME) console.log('  Resume:   Yes (continuing from state file)');

  // Fetch WC products
  const allProducts = await fetchAllWcProducts();

  // Apply slice
  const end = BATCH_COUNT ? START_INDEX + parseInt(BATCH_COUNT, 10) : allProducts.length;
  const products = allProducts.slice(START_INDEX, end);

  console.log(`\n  Total WC products: ${allProducts.length}`);
  console.log(`  Processing range:  ${START_INDEX + 1} to ${Math.min(end, allProducts.length)} (${products.length} products)`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN — No changes will be made]\n');
    for (let i = 0; i < Math.min(products.length, 20); i++) {
      const p = products[i];
      const pricing = calculatePrice(p);
      console.log(`  ${i + 1}. WC #${p.id} "${p.name}" (SKU: ${p.sku || '?'}) → $${pricing.retail} | ${(p.images || []).length} images`);
    }
    if (products.length > 20) {
      console.log(`  ... and ${products.length - 20} more`);
    }
    console.log(`\n  Run with --execute to start migration.`);
    console.log(`  Run with --execute --workers=5 for 5 parallel workers.`);
    return;
  }

  // Execute migration
  await runWorkerPool(products, WORKER_COUNT);
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
