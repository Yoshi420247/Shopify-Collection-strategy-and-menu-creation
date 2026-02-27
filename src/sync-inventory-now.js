#!/usr/bin/env node
/**
 * WyndDistribution → Shopify Exact Inventory Sync (curl-based)
 *
 * Mirrors stock quantities from wyndistribution.com to Shopify using curl
 * for all HTTP requests (bypasses Node.js DNS limitations in some environments).
 *
 * Usage:
 *   node src/sync-inventory-now.js                    # Dry run
 *   node src/sync-inventory-now.js --execute          # Live sync
 *   node src/sync-inventory-now.js --execute --verbose # Live with full output
 */
import 'dotenv/config';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const WC_STORE_URL = process.env.WC_STORE_URL || 'https://wyndistribution.com';
const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;
const SYNC_LOG_FILE = path.join(process.cwd(), 'wholesaler-sync-log.json');
const MAPPING_FILE = path.join(process.cwd(), 'product-mapping.json');

const colors = {
  reset: '\x1b[0m', bright: '\x1b[1m', green: '\x1b[32m',
  yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m',
  red: '\x1b[31m', magenta: '\x1b[35m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── curl-based HTTP ───────────────────────────────────────────────────
function curlGet(url, headers = {}) {
  let cmd = `curl -s --max-time 30 "${url}"`;
  for (const [k, v] of Object.entries(headers)) {
    cmd += ` -H "${k}: ${v}"`;
  }
  try {
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (e) {
    console.error(`  curl GET error: ${e.message?.substring(0, 200)}`);
    return null;
  }
}

function curlPost(url, body, headers = {}) {
  const escapedBody = JSON.stringify(body).replace(/'/g, "'\\''");
  let cmd = `curl -s --max-time 30 -X POST "${url}" -H "Content-Type: application/json"`;
  for (const [k, v] of Object.entries(headers)) {
    cmd += ` -H "${k}: ${v}"`;
  }
  cmd += ` -d '${escapedBody}'`;
  try {
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (e) {
    console.error(`  curl POST error: ${e.message?.substring(0, 200)}`);
    return null;
  }
}

function curlPut(url, body, headers = {}) {
  const escapedBody = JSON.stringify(body).replace(/'/g, "'\\''");
  let cmd = `curl -s --max-time 30 -X PUT "${url}" -H "Content-Type: application/json"`;
  for (const [k, v] of Object.entries(headers)) {
    cmd += ` -H "${k}: ${v}"`;
  }
  cmd += ` -d '${escapedBody}'`;
  try {
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (e) {
    console.error(`  curl PUT error: ${e.message?.substring(0, 200)}`);
    return null;
  }
}

const shopifyHeaders = { 'X-Shopify-Access-Token': ACCESS_TOKEN };

// ── Fetch all WC products (paginated) ─────────────────────────────────
function fetchAllWcProducts() {
  log('Fetching all products from WyndDistribution...', 'cyan');
  const allProducts = [];
  let page = 1;

  while (true) {
    const url = `${WC_STORE_URL}/wp-json/wc/v3/products?per_page=100&page=${page}&orderby=id&order=asc`;
    const data = curlGet(url);

    if (!data || !Array.isArray(data) || data.length === 0) break;

    allProducts.push(...data);
    process.stdout.write(`  Page ${page}: +${data.length} (total: ${allProducts.length})\r`);

    if (data.length < 100) break;
    page++;
  }

  console.log(`  Fetched ${allProducts.length} WC products across ${page} pages        `);
  return allProducts;
}

// ── Fetch all Shopify products (paginated via Link header) ────────────
function fetchAllShopifyProducts() {
  log('Fetching all Shopify products...', 'cyan');
  const allProducts = [];
  let url = `${BASE_URL}/products.json?limit=250&fields=id,title,status,variants,vendor`;
  let page = 0;

  while (url) {
    page++;
    // Save headers and body separately to handle HTTP/2 double-header responses
    const headerFile = `/tmp/shopify_headers_${page}.txt`;
    const bodyFile = `/tmp/shopify_body_${page}.json`;
    let cmd = `curl -s --max-time 60 -D "${headerFile}" -o "${bodyFile}" "${url}" -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" -H "Content-Type: application/json"`;
    try {
      execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    } catch (e) {
      console.error(`  Shopify fetch error: ${e.message?.substring(0, 200)}`);
      break;
    }

    let data;
    try {
      const body = fs.readFileSync(bodyFile, 'utf8');
      data = JSON.parse(body);
    } catch {
      console.error('  Failed to parse Shopify response');
      break;
    }

    const batch = data.products || [];
    if (batch.length === 0) break;

    allProducts.push(...batch);
    process.stdout.write(`  Page ${page}: +${batch.length} (total: ${allProducts.length})\r`);

    // Follow cursor-based pagination via Link header
    let headers = '';
    try { headers = fs.readFileSync(headerFile, 'utf8'); } catch {}
    const linkMatch = headers.match(/<([^>]+)>;\s*rel="next"/);
    url = linkMatch ? linkMatch[1] : null;

    // Cleanup temp files
    try { fs.unlinkSync(headerFile); fs.unlinkSync(bodyFile); } catch {}
  }

  console.log(`  Fetched ${allProducts.length} Shopify products across ${page} pages    `);
  return allProducts;
}

// ── Text normalization (same as product-matcher.js) ───────────────────
function normalize(title) {
  let s = title.toLowerCase().trim();
  s = s.replace(/(\d+)\s*["″'']/g, '$1 inch');
  s = s.replace(/(\d+)\s*in\b\.?/g, '$1 inch');
  s = s.replace(/(\d+)\s*mm\b/g, '$1 mm');
  s = s.replace(/(\d+)\s*cm\b/g, '$1 cm');
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function tokenize(norm) { return norm.split(' ').filter(t => t.length > 0); }
function extractNumbers(tokens) { return tokens.filter(t => /^\d+(\.\d+)?$/.test(t)).sort(); }
function extractMeasurements(tokens) {
  const units = new Set(['inch','mm','cm','ml','oz','ft','pc','pcs','pack','piece','pieces','set']);
  const m = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    if (/^\d+(\.\d+)?$/.test(tokens[i]) && units.has(tokens[i + 1])) m.push(`${tokens[i]} ${tokens[i + 1]}`);
  }
  return m.sort();
}

// ── Product matching ──────────────────────────────────────────────────
function matchProducts(wcProducts, shopifyProducts) {
  log('\nMatching WC products → Shopify products (strict text-based)...', 'cyan');

  // Build Shopify lookup tables
  const shopifyByNorm = new Map();
  const shopifyBySorted = new Map();
  for (let i = 0; i < shopifyProducts.length; i++) {
    const norm = normalize(shopifyProducts[i].title);
    if (!shopifyByNorm.has(norm)) shopifyByNorm.set(norm, i);
    const sorted = tokenize(norm).sort().join(' ');
    if (!shopifyBySorted.has(sorted)) shopifyBySorted.set(sorted, i);
  }

  const matches = [];
  const matchedShopify = new Set();
  let exact = 0, reorder = 0, close = 0;

  const productTypeWords = new Set([
    'pipe','bong','bowl','grinder','rig','dab','nectar','collector',
    'bubbler','chillum','steamroller','sherlock','spoon','hammer',
    'recycler','beaker','straight','tube','percolator','perc',
    'downstem','slide','nail','banger','carb','cap','torch',
    'lighter','tray','rolling','paper','papers','cone','cones',
    'tip','tips','filter','wrap','wraps','blunt','cigar',
    'vape','vaporizer','cartridge','battery','pen','mod',
    'hookah','hose','charcoal','shisha','tobacco',
    'scale','jar','stash','container','bag','pouch',
    'ashtray','cleaner','brush','screen','screens',
    'silicone','glass','metal','ceramic','wood','wooden','acrylic',
    'kit','set','combo','bundle','adapter','clip','holder',
  ]);

  for (let wi = 0; wi < wcProducts.length; wi++) {
    const wcName = wcProducts[wi].name;
    const normWc = normalize(wcName);

    // Level 1: Exact normalized
    const eIdx = shopifyByNorm.get(normWc);
    if (eIdx !== undefined && !matchedShopify.has(eIdx)) {
      matches.push({ wc_idx: wi, sp_idx: eIdx, confidence: 100 });
      matchedShopify.add(eIdx);
      exact++;
      continue;
    }

    // Level 2: Sorted tokens
    const sortedWc = tokenize(normWc).sort().join(' ');
    const rIdx = shopifyBySorted.get(sortedWc);
    if (rIdx !== undefined && !matchedShopify.has(rIdx)) {
      matches.push({ wc_idx: wi, sp_idx: rIdx, confidence: 98 });
      matchedShopify.add(rIdx);
      reorder++;
      continue;
    }

    // Level 3: Close text match with guards
    const tokWc = tokenize(normWc);
    const numWc = extractNumbers(tokWc);
    const measWc = extractMeasurements(tokWc);
    let best = null;

    for (let si = 0; si < shopifyProducts.length; si++) {
      if (matchedShopify.has(si)) continue;
      const normSp = normalize(shopifyProducts[si].title);
      const tokSp = tokenize(normSp);

      if (extractNumbers(tokSp).join(',') !== numWc.join(',')) continue;
      if (extractMeasurements(tokSp).join(',') !== measWc.join(',')) continue;

      const setWc = new Set(tokWc);
      const setSp = new Set(tokSp);
      const inter = new Set([...setWc].filter(t => setSp.has(t)));
      const union = new Set([...setWc, ...setSp]);
      const jaccard = inter.size / union.size;

      const missingFromSp = [...setWc].filter(t => !setSp.has(t));
      const missingFromWc = [...setSp].filter(t => !setWc.has(t));
      if (missingFromSp.length + missingFromWc.length > 2 || jaccard < 0.80) continue;

      let blocked = false;
      for (const m of [...missingFromSp, ...missingFromWc]) {
        if (productTypeWords.has(m)) { blocked = true; break; }
      }
      if (blocked) continue;

      const conf = jaccard >= 0.95 ? 98 : jaccard >= 0.90 ? 97 : jaccard >= 0.85 ? 96 : 95;
      if (!best || conf > best.confidence) best = { sp_idx: si, confidence: conf };
    }

    if (best) {
      matches.push({ wc_idx: wi, sp_idx: best.sp_idx, confidence: best.confidence });
      matchedShopify.add(best.sp_idx);
      close++;
    }
  }

  log(`  Exact: ${exact} | Reordered: ${reorder} | Close: ${close} | Total: ${matches.length}`, 'green');
  log(`  Unmatched WC: ${wcProducts.length - matches.length} | Unmatched Shopify: ${shopifyProducts.length - matchedShopify.size}`, 'yellow');

  return matches;
}

// ── Main sync ─────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  const verbose = args.includes('--verbose');
  const startTime = Date.now();

  console.log('\n' + '═'.repeat(66));
  log('  WyndDistribution → Shopify EXACT Inventory Sync', 'bright');
  log(`  Shopify: ${STORE_URL}`, 'cyan');
  log(`  WC Source: ${WC_STORE_URL}`, 'cyan');
  log(`  Mode: ${dryRun ? 'DRY RUN (use --execute to apply)' : 'LIVE — UPDATING SHOPIFY INVENTORY'}`, dryRun ? 'yellow' : 'green');
  console.log('═'.repeat(66) + '\n');

  // Step 1: Get Shopify inventory location
  log('Getting Shopify inventory location...', 'cyan');
  const locData = curlGet(`${BASE_URL}/locations.json`, shopifyHeaders);
  if (!locData || !locData.locations || locData.locations.length === 0) {
    log('ERROR: Could not fetch Shopify locations', 'red');
    process.exit(1);
  }
  const location = locData.locations.find(l => l.active) || locData.locations[0];
  const locationId = location.id;
  log(`  Location: ${location.name} (ID: ${locationId})\n`, 'green');

  // Step 2: Fetch all WC products
  const wcProducts = fetchAllWcProducts();
  if (wcProducts.length === 0) {
    log('ERROR: No WC products fetched', 'red');
    process.exit(1);
  }

  // Step 3: Fetch all Shopify products
  const shopifyProducts = fetchAllShopifyProducts();
  if (shopifyProducts.length === 0) {
    log('ERROR: No Shopify products fetched', 'red');
    process.exit(1);
  }

  // Step 4: Match products
  const matches = matchProducts(wcProducts, shopifyProducts);

  // Save the mapping for future use
  const mappingData = {
    mappings: matches.map(m => ({
      wc_id: wcProducts[m.wc_idx].id,
      wc_name: wcProducts[m.wc_idx].name,
      wc_sku: wcProducts[m.wc_idx].sku || '',
      shopify_id: shopifyProducts[m.sp_idx].id,
      shopify_title: shopifyProducts[m.sp_idx].title,
      shopify_status: shopifyProducts[m.sp_idx].status,
      confidence: m.confidence,
      approved: true,
    })),
    unmatchedWc: wcProducts.filter((_, i) => !matches.some(m => m.wc_idx === i)).map(p => ({ id: p.id, name: p.name })),
    unmatchedShopify: shopifyProducts.filter((_, i) => !matches.some(m => m.sp_idx === i)).map(p => ({ id: p.id, title: p.title })),
    lastUpdated: new Date().toISOString(),
  };
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(mappingData, null, 2));
  log(`\nMapping saved: ${MAPPING_FILE} (${matches.length} pairs)\n`, 'green');

  // Step 5: Determine inventory changes needed
  log('Comparing stock levels...', 'cyan');

  const inventoryActions = [];
  const statusActions = [];
  let alreadyInSync = 0;
  let errors = 0;

  for (const match of matches) {
    const wc = wcProducts[match.wc_idx];
    const sp = shopifyProducts[match.sp_idx];

    // Determine target quantity from WC
    let targetQty;
    if (wc.stock_quantity !== null && wc.stock_quantity !== undefined) {
      targetQty = Math.max(0, wc.stock_quantity);
    } else {
      targetQty = wc.stock_status === 'instock' ? 10 : 0;
    }

    const currentStatus = sp.status;
    const variants = sp.variants || [];
    let needsInventoryUpdate = false;

    for (const variant of variants) {
      const currentQty = variant.inventory_quantity ?? 0;
      if (currentQty !== targetQty) {
        needsInventoryUpdate = true;
        inventoryActions.push({
          shopify_id: sp.id,
          shopify_title: sp.title,
          variant_id: variant.id,
          variant_title: variant.title,
          inventory_item_id: variant.inventory_item_id,
          wc_name: wc.name,
          wc_qty: wc.stock_quantity,
          current_qty: currentQty,
          target_qty: targetQty,
        });
      }
    }

    // Status change
    const isOutOfStock = targetQty === 0;
    if (isOutOfStock && currentStatus === 'active') {
      statusActions.push({
        type: 'draft', shopify_id: sp.id, shopify_title: sp.title,
        reason: `Out of stock (WC qty: ${wc.stock_quantity ?? wc.stock_status})`,
      });
    } else if (!isOutOfStock && currentStatus === 'draft') {
      statusActions.push({
        type: 'activate', shopify_id: sp.id, shopify_title: sp.title,
        reason: `Back in stock (WC qty: ${targetQty})`,
      });
    }

    if (!needsInventoryUpdate) alreadyInSync++;
  }

  const draftActions = statusActions.filter(a => a.type === 'draft');
  const activateActions = statusActions.filter(a => a.type === 'activate');

  console.log('\n' + '═'.repeat(66));
  log(`  Inventory updates needed:         ${inventoryActions.length} variant(s)`, inventoryActions.length > 0 ? 'yellow' : 'green');
  log(`  Products to DRAFT (out of stock): ${draftActions.length}`, draftActions.length > 0 ? 'red' : 'green');
  log(`  Products to ACTIVATE (restocked): ${activateActions.length}`, activateActions.length > 0 ? 'green' : 'green');
  log(`  Already in sync:                  ${alreadyInSync}`, 'green');
  console.log('═'.repeat(66) + '\n');

  // Show sample of changes
  if (inventoryActions.length > 0) {
    log('── Inventory Quantity Changes ──', 'bright');
    const shown = verbose ? inventoryActions : inventoryActions.slice(0, 30);
    for (const a of shown) {
      const vLabel = a.variant_title !== 'Default Title' ? ` [${a.variant_title}]` : '';
      const arrow = a.current_qty > a.target_qty ? '↓' : '↑';
      console.log(`  ${String(a.current_qty).padStart(4)} → ${String(a.target_qty).padStart(4)} ${arrow}  "${a.shopify_title}"${vLabel}`);
    }
    if (!verbose && inventoryActions.length > 30) {
      log(`  ... and ${inventoryActions.length - 30} more (use --verbose to see all)`, 'yellow');
    }
    console.log('');
  }

  if (draftActions.length > 0) {
    log('── Products to DRAFT ──', 'red');
    for (const a of draftActions.slice(0, 20)) console.log(`  ✗ "${a.shopify_title}" — ${a.reason}`);
    if (draftActions.length > 20) log(`  ... and ${draftActions.length - 20} more`, 'yellow');
    console.log('');
  }

  if (activateActions.length > 0) {
    log('── Products to ACTIVATE ──', 'green');
    for (const a of activateActions.slice(0, 20)) console.log(`  ✓ "${a.shopify_title}" — ${a.reason}`);
    if (activateActions.length > 20) log(`  ... and ${activateActions.length - 20} more`, 'yellow');
    console.log('');
  }

  // Step 6: Execute changes
  let invUpdated = 0, invFailed = 0, drafted = 0, activated = 0, statusFailed = 0;

  if (!dryRun) {
    // 6a. Update inventory quantities
    if (inventoryActions.length > 0) {
      log(`Updating ${inventoryActions.length} inventory levels...\n`, 'bright');

      for (let i = 0; i < inventoryActions.length; i++) {
        const a = inventoryActions[i];
        const vLabel = a.variant_title !== 'Default Title' ? ` [${a.variant_title}]` : '';

        let result = curlPost(
          `${BASE_URL}/inventory_levels/set.json`,
          { location_id: locationId, inventory_item_id: a.inventory_item_id, available: a.target_qty },
          shopifyHeaders
        );

        // If tracking is not enabled, enable it and retry
        if (result && result.errors && JSON.stringify(result.errors).includes('tracking')) {
          // Enable inventory tracking on this variant
          const trackResult = curlPut(
            `${BASE_URL}/variants/${a.variant_id}.json`,
            { variant: { id: a.variant_id, inventory_management: 'shopify' } },
            shopifyHeaders
          );
          if (trackResult && trackResult.variant) {
            await sleep(550);
            // Retry the inventory level set
            result = curlPost(
              `${BASE_URL}/inventory_levels/set.json`,
              { location_id: locationId, inventory_item_id: a.inventory_item_id, available: a.target_qty },
              shopifyHeaders
            );
          }
        }

        if (result && result.inventory_level) {
          invUpdated++;
          if (verbose || i < 10 || i % 100 === 0) {
            log(`  [${i + 1}/${inventoryActions.length}] ✔ ${a.current_qty} → ${a.target_qty}  "${a.shopify_title}"${vLabel}`, 'green');
          }
        } else {
          invFailed++;
          log(`  [${i + 1}/${inventoryActions.length}] ✘ FAILED: "${a.shopify_title}"${vLabel}`, 'red');
          if (result && result.errors) console.log(`    ${JSON.stringify(result.errors)}`);
        }

        // Print progress every 50 items
        if (!verbose && i > 0 && i % 50 === 0) {
          log(`  ... ${i}/${inventoryActions.length} done (${invUpdated} ok, ${invFailed} failed)`, 'cyan');
        }

        await sleep(550);
      }
      console.log('');
    }

    // 6b. Update product statuses
    if (statusActions.length > 0) {
      log(`Updating ${statusActions.length} product statuses...\n`, 'bright');

      for (const a of statusActions) {
        const newStatus = a.type === 'draft' ? 'draft' : 'active';
        const result = curlPut(
          `${BASE_URL}/products/${a.shopify_id}.json`,
          { product: { status: newStatus } },
          shopifyHeaders
        );

        if (result && result.product) {
          if (a.type === 'draft') { drafted++; log(`  ✔ Drafted: "${a.shopify_title}"`, 'yellow'); }
          else { activated++; log(`  ✔ Activated: "${a.shopify_title}"`, 'green'); }
        } else {
          statusFailed++;
          log(`  ✘ Failed: "${a.shopify_title}"`, 'red');
        }

        await sleep(600);
      }
      console.log('');
    }
  } else {
    log('DRY RUN complete — no changes made. Run with --execute to apply.\n', 'yellow');
  }

  // Step 7: Save sync log
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const logEntry = {
    timestamp: new Date().toISOString(),
    dryRun,
    duration: `${duration}s`,
    productsMatched: matches.length,
    inventoryUpdated: dryRun ? inventoryActions.length : invUpdated,
    inventoryFailed: invFailed,
    drafted: dryRun ? draftActions.length : drafted,
    activated: dryRun ? activateActions.length : activated,
    statusFailed,
    alreadyInSync,
  };

  let syncLog = { runs: [] };
  if (fs.existsSync(SYNC_LOG_FILE)) {
    try { syncLog = JSON.parse(fs.readFileSync(SYNC_LOG_FILE, 'utf8')); } catch {}
  }
  syncLog.runs.push(logEntry);
  if (syncLog.runs.length > 90) syncLog.runs = syncLog.runs.slice(-90);
  fs.writeFileSync(SYNC_LOG_FILE, JSON.stringify(syncLog, null, 2));

  console.log('═'.repeat(66));
  log(`  Sync completed in ${duration}s`, 'bright');
  if (!dryRun) {
    log(`  Inventory updated: ${invUpdated} | Failed: ${invFailed}`, invFailed > 0 ? 'red' : 'green');
    log(`  Drafted: ${drafted} | Activated: ${activated}`, 'cyan');
  } else {
    log(`  Would update: ${inventoryActions.length} inventory | ${draftActions.length} draft | ${activateActions.length} activate`, 'yellow');
  }
  log(`  Already in sync: ${alreadyInSync}`, 'green');
  console.log('═'.repeat(66));
}

main().catch(err => {
  log(`\nFatal error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
