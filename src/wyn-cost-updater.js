#!/usr/bin/env node
/**
 * WYN Distribution Cost Updater
 *
 * Examines all "What You Need" vendor products in Shopify.
 * For any product missing a cost per unit:
 *   1. Looks up the retail price on the WYN WooCommerce store
 *   2. Applies the tiered multiplier to derive the Shopify cost per unit
 *   3. Updates the inventory item cost in Shopify
 *
 * Tiered Multiplier Structure (based on WYN retail price):
 *   $0.50–$4.00   → ×2.5
 *   $4.01–$20.00  → ×2.0
 *   $20.01–$40.00 → ×1.8
 *   $40.01–$100.00→ ×1.6
 *   $100.01–$200  → ×1.5
 *   > $200.00     → ×1.4
 *
 * Usage:
 *   node src/wyn-cost-updater.js                # Dry run
 *   node src/wyn-cost-updater.js --execute      # Apply changes
 *   node src/wyn-cost-updater.js --audit        # Full audit only
 */

import 'dotenv/config';
import { execSync } from 'child_process';

// Config from .env
const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL || 'oil-slick-pad.myshopify.com';
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const SHOPIFY_BASE = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}`;

const WC_STORE_URL = process.env.WC_STORE_URL;
const WC_KEY = process.env.WC_CONSUMER_KEY;
const WC_SECRET = process.env.WC_CONSUMER_SECRET;

// ANSI colors
const C = {
  reset: '\x1b[0m', bright: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  cyan: '\x1b[36m', red: '\x1b[31m', magenta: '\x1b[35m',
};
const log = (msg, c = 'reset') => console.log(`${C[c]}${msg}${C.reset}`);
const section = (title) => { console.log('\n' + '═'.repeat(70)); log(`  ${title}`, 'bright'); console.log('═'.repeat(70)); };

// ─── HTTP via curl ────────────────────────────────────────────────────────────
function curlGet(url, headers = {}) {
  const headerArgs = Object.entries(headers).map(([k, v]) => `-H "${k}: ${v}"`).join(' ');
  const cmd = `curl -s --max-time 60 ${headerArgs} "${url}"`;
  const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 });
  return JSON.parse(result);
}

function curlGetWithHeaders(url, headers = {}) {
  const headerArgs = Object.entries(headers).map(([k, v]) => `-H "${k}: ${v}"`).join(' ');
  const cmd = `curl -s --max-time 60 -D /tmp/curl_headers ${headerArgs} "${url}"`;
  const body = execSync(cmd, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 });
  let rawHeaders = '';
  try { rawHeaders = execSync('cat /tmp/curl_headers', { encoding: 'utf-8' }); } catch {}
  return { body: JSON.parse(body), rawHeaders };
}

function curlPut(url, data, headers = {}) {
  const headerArgs = Object.entries(headers).map(([k, v]) => `-H "${k}: ${v}"`).join(' ');
  const jsonStr = JSON.stringify(data).replace(/'/g, "'\\''");
  const cmd = `curl -s --max-time 30 -X PUT ${headerArgs} -H "Content-Type: application/json" -d '${jsonStr}' "${url}"`;
  const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(result);
}

function sleep(ms) {
  execSync(`sleep ${(ms / 1000).toFixed(2)}`);
}

// ─── Shopify API helpers ──────────────────────────────────────────────────────
const shopifyHeaders = { 'X-Shopify-Access-Token': SHOPIFY_TOKEN };

function shopifyGet(endpoint, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `${SHOPIFY_BASE}/${endpoint}${qs ? sep + qs : ''}`;
  sleep(500);
  return curlGet(url, shopifyHeaders);
}

function shopifyPut(endpoint, data) {
  const url = `${SHOPIFY_BASE}/${endpoint}`;
  sleep(500);
  return curlPut(url, data, shopifyHeaders);
}

// ─── Tiered multiplier logic ──────────────────────────────────────────────────
function getMultiplier(wynPrice) {
  if (wynPrice >= 0.50 && wynPrice <= 4.00) return 2.5;
  if (wynPrice >= 4.01 && wynPrice <= 20.00) return 2.0;
  if (wynPrice >= 20.01 && wynPrice <= 40.00) return 1.8;
  if (wynPrice >= 40.01 && wynPrice <= 100.00) return 1.6;
  if (wynPrice >= 100.01 && wynPrice <= 200.00) return 1.5;
  if (wynPrice > 200.00) return 1.4;
  return null;
}

function calculateShopifyCost(wynRetailPrice) {
  const multiplier = getMultiplier(wynRetailPrice);
  if (!multiplier) return null;
  return parseFloat((wynRetailPrice * multiplier).toFixed(2));
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ─── Fetch all "What You Need" products from Shopify (cursor pagination) ──────
function fetchAllWYNProducts() {
  section('FETCHING "WHAT YOU NEED" PRODUCTS FROM SHOPIFY');
  const allProducts = [];
  let url = `${SHOPIFY_BASE}/products.json?vendor=What+You+Need&limit=250`;
  let page = 0;

  while (url) {
    page++;
    sleep(500);
    const headerArgs = `-H "X-Shopify-Access-Token: ${SHOPIFY_TOKEN}"`;
    const cmd = `curl -s --max-time 60 -D /tmp/curl_headers ${headerArgs} "${url}"`;
    const bodyStr = execSync(cmd, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 });
    let rawHeaders = '';
    try { rawHeaders = execSync('cat /tmp/curl_headers', { encoding: 'utf-8' }); } catch {}

    const data = JSON.parse(bodyStr);
    const batch = data.products || [];
    if (batch.length === 0) break;

    allProducts.push(...batch);
    console.log(`  Page ${page}: fetched ${batch.length} (total: ${allProducts.length})`);

    const linkMatch = rawHeaders.match(/<([^>]+)>;\s*rel="next"/);
    url = linkMatch ? linkMatch[1] : null;
  }

  log(`  Found ${allProducts.length} "What You Need" products in Shopify`, 'cyan');
  return allProducts;
}

// ─── Batch fetch inventory items (up to 100 at a time) ───────────────────────
function batchGetInventoryItems(inventoryItemIds) {
  const costMap = new Map(); // inventoryItemId → cost (number)
  const batchSize = 100;

  for (let i = 0; i < inventoryItemIds.length; i += batchSize) {
    const batchIds = inventoryItemIds.slice(i, i + batchSize);
    const idsParam = batchIds.join(',');

    try {
      const data = shopifyGet('inventory_items.json', { ids: idsParam, limit: '100' });
      for (const item of (data.inventory_items || [])) {
        costMap.set(item.id, parseFloat(item.cost) || 0);
      }
    } catch (err) {
      console.log(`  ${C.red}Error fetching batch at offset ${i}: ${err.message}${C.reset}`);
      // Try individual fallback for this batch
      for (const id of batchIds) {
        try {
          const data = shopifyGet(`inventory_items/${id}.json`);
          costMap.set(id, parseFloat(data.inventory_item?.cost) || 0);
        } catch {
          costMap.set(id, 0);
        }
      }
    }

    const total = Math.min(i + batchSize, inventoryItemIds.length);
    console.log(`  Fetched costs for ${total}/${inventoryItemIds.length} inventory items...`);
  }

  return costMap;
}

// ─── Build variant info + check cost status ───────────────────────────────────
function getCostStatus(products) {
  section('CHECKING COST PER UNIT STATUS (BATCH MODE)');

  // Collect all inventory item IDs and build variant entries
  const allVariants = [];
  for (const product of products) {
    for (const variant of product.variants || []) {
      allVariants.push({
        productId: product.id,
        productTitle: product.title,
        variantId: variant.id,
        variantTitle: variant.title,
        sku: variant.sku || '',
        inventoryItemId: variant.inventory_item_id,
        currentPrice: parseFloat(variant.price) || 0,
      });
    }
  }

  log(`  Total variants to check: ${allVariants.length}`, 'cyan');

  // Batch fetch all inventory item costs
  const allInvIds = allVariants.map(v => v.inventoryItemId);
  const costMap = batchGetInventoryItems(allInvIds);

  // Classify
  const withCost = [];
  const missingCost = [];

  for (const entry of allVariants) {
    const cost = costMap.get(entry.inventoryItemId) || 0;
    entry.currentCost = cost;

    if (cost > 0) {
      withCost.push(entry);
    } else {
      missingCost.push(entry);
    }
  }

  log(`\n  Total variants checked: ${allVariants.length}`, 'cyan');
  log(`  With cost set: ${withCost.length}`, 'green');
  log(`  Missing cost: ${missingCost.length}`, missingCost.length > 0 ? 'red' : 'green');

  return { withCost, missingCost, allVariants, costMap };
}

// ─── Fetch all WooCommerce products and build lookup ──────────────────────────
function buildWCLookup() {
  section('FETCHING WYN DISTRIBUTION WOOCOMMERCE PRODUCTS');

  const allProducts = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const qs = new URLSearchParams({
      per_page: '100',
      page: String(page),
      orderby: 'id',
      order: 'asc',
      _fields: 'id,name,sku,price,regular_price,permalink,status',
      consumer_key: WC_KEY,
      consumer_secret: WC_SECRET,
    }).toString();

    const url = `${WC_STORE_URL}/wp-json/wc/v3/products?${qs}`;
    sleep(300);
    const result = curlGetWithHeaders(url);

    const batch = Array.isArray(result.body) ? result.body : [];
    if (batch.length === 0) break;

    allProducts.push(...batch);

    const tpMatch = result.rawHeaders.match(/x-wp-totalpages:\s*(\d+)/i);
    if (tpMatch) totalPages = parseInt(tpMatch[1], 10);

    console.log(`  Page ${page}/${totalPages}: fetched ${batch.length} (total: ${allProducts.length})`);
    page++;
  }

  log(`  Fetched ${allProducts.length} WooCommerce products`, 'cyan');

  // Build lookup maps
  const bySku = new Map();
  const byName = new Map();

  for (const p of allProducts) {
    const price = parseFloat(p.price) || parseFloat(p.regular_price) || 0;
    if (price <= 0) continue;

    const entry = {
      wcId: p.id,
      name: p.name,
      sku: p.sku || '',
      retailPrice: price,
      permalink: p.permalink,
    };

    if (p.sku) {
      bySku.set(p.sku.trim().toLowerCase(), entry);
    }
    const normName = normalizeName(p.name);
    byName.set(normName, entry);
  }

  log(`  SKU lookup entries: ${bySku.size}`, 'blue');
  log(`  Name lookup entries: ${byName.size}`, 'blue');

  return { bySku, byName, raw: allProducts };
}

// ─── Match a Shopify product to a WooCommerce product ─────────────────────────
function findWCMatch(shopifyEntry, wcLookup) {
  const { bySku, byName } = wcLookup;

  // 1. Exact SKU match
  if (shopifyEntry.sku) {
    const skuKey = shopifyEntry.sku.trim().toLowerCase();
    if (bySku.has(skuKey)) return bySku.get(skuKey);
  }

  // 2. Normalized name match
  const normTitle = normalizeName(shopifyEntry.productTitle);
  if (byName.has(normTitle)) return byName.get(normTitle);

  // 3. Partial containment match (names > 8 chars to reduce false positives)
  for (const [wcNormName, wcEntry] of byName.entries()) {
    if (wcNormName.length > 8 && normTitle.includes(wcNormName)) return wcEntry;
    if (normTitle.length > 8 && wcNormName.includes(normTitle)) return wcEntry;
  }

  return null;
}

// ─── Update inventory item cost in Shopify ────────────────────────────────────
function updateCost(inventoryItemId, cost) {
  return shopifyPut(`inventory_items/${inventoryItemId}.json`, {
    inventory_item: { cost: cost.toFixed(2) },
  });
}

// ─── Full audit (uses already-fetched cost data) ──────────────────────────────
function runAudit(allVariants, costMap, wcLookup) {
  section('FULL AUDIT — VERIFYING ALL WYN PRODUCT COSTS');

  const results = { correct: [], incorrect: [], noWcMatch: [], noCost: [] };

  for (const entry of allVariants) {
    const currentCost = costMap.get(entry.inventoryItemId) || 0;

    if (currentCost <= 0) {
      results.noCost.push({
        title: entry.productTitle,
        variant: entry.variantTitle,
        sku: entry.sku || '(no SKU)',
        price: entry.currentPrice,
      });
      continue;
    }

    const wcMatch = findWCMatch({
      productTitle: entry.productTitle,
      sku: entry.sku,
    }, wcLookup);

    if (!wcMatch) {
      results.noWcMatch.push({
        title: entry.productTitle,
        variant: entry.variantTitle,
        sku: entry.sku || '(no SKU)',
        currentCost,
        price: entry.currentPrice,
      });
      continue;
    }

    const expectedCost = calculateShopifyCost(wcMatch.retailPrice);
    if (!expectedCost) {
      results.noWcMatch.push({
        title: entry.productTitle,
        variant: entry.variantTitle,
        sku: entry.sku || '(no SKU)',
        currentCost,
        wynPrice: wcMatch.retailPrice,
      });
      continue;
    }

    if (Math.abs(currentCost - expectedCost) <= 0.01) {
      results.correct.push({
        title: entry.productTitle,
        variant: entry.variantTitle,
        sku: entry.sku || '(no SKU)',
        currentCost,
        expectedCost,
        wynPrice: wcMatch.retailPrice,
        multiplier: getMultiplier(wcMatch.retailPrice),
      });
    } else {
      results.incorrect.push({
        title: entry.productTitle,
        variant: entry.variantTitle,
        sku: entry.sku || '(no SKU)',
        currentCost,
        expectedCost,
        wynPrice: wcMatch.retailPrice,
        multiplier: getMultiplier(wcMatch.retailPrice),
      });
    }
  }

  // Print audit report
  section('AUDIT REPORT');
  log(`Total variants audited: ${allVariants.length}`, 'cyan');
  log(`  Correctly priced: ${results.correct.length}`, 'green');
  log(`  Incorrectly priced: ${results.incorrect.length}`, results.incorrect.length > 0 ? 'red' : 'green');
  log(`  No WC match found: ${results.noWcMatch.length}`, 'yellow');
  log(`  Still missing cost: ${results.noCost.length}`, results.noCost.length > 0 ? 'red' : 'green');

  if (results.incorrect.length > 0) {
    console.log('\n  INCORRECTLY PRICED ITEMS:');
    for (const item of results.incorrect) {
      console.log(`    ${item.title} [${item.variant}] (SKU: ${item.sku})`);
      console.log(`      WYN Price: $${item.wynPrice} × ${item.multiplier} = $${item.expectedCost} (expected)`);
      console.log(`      Current Shopify cost: $${item.currentCost} ${C.red}← MISMATCH${C.reset}`);
    }
  }

  if (results.correct.length > 0) {
    console.log('\n  CORRECTLY PRICED ITEMS (sample):');
    for (const item of results.correct.slice(0, 15)) {
      console.log(`    ${C.green}✓${C.reset} ${item.title} [${item.variant}] — WYN $${item.wynPrice} × ${item.multiplier} = $${item.expectedCost} (cost: $${item.currentCost})`);
    }
    if (results.correct.length > 15) {
      console.log(`    ... and ${results.correct.length - 15} more correctly priced items`);
    }
  }

  if (results.noCost.length > 0 && results.noCost.length <= 50) {
    console.log('\n  STILL MISSING COST:');
    for (const item of results.noCost) {
      console.log(`    ${C.red}✗${C.reset} ${item.title} [${item.variant}] (SKU: ${item.sku}) — price: $${item.price}`);
    }
  } else if (results.noCost.length > 50) {
    console.log(`\n  STILL MISSING COST: ${results.noCost.length} items (showing first 50)`);
    for (const item of results.noCost.slice(0, 50)) {
      console.log(`    ${C.red}✗${C.reset} ${item.title} [${item.variant}] (SKU: ${item.sku}) — price: $${item.price}`);
    }
  }

  if (results.noWcMatch.length > 0 && results.noWcMatch.length <= 30) {
    console.log('\n  NO WC MATCH (cannot verify):');
    for (const item of results.noWcMatch) {
      console.log(`    ${C.yellow}?${C.reset} ${item.title} [${item.variant}] (SKU: ${item.sku}) — current cost: $${item.currentCost}`);
    }
  } else if (results.noWcMatch.length > 30) {
    console.log(`\n  NO WC MATCH: ${results.noWcMatch.length} items (showing first 30)`);
    for (const item of results.noWcMatch.slice(0, 30)) {
      console.log(`    ${C.yellow}?${C.reset} ${item.title} [${item.variant}] (SKU: ${item.sku}) — current cost: $${item.currentCost}`);
    }
  }

  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const auditOnly = args.includes('--audit');

  console.log('\n' + '═'.repeat(70));
  log('  WYN DISTRIBUTION COST UPDATER', 'bright');
  log(`  Shopify Store: ${SHOPIFY_STORE}`, 'cyan');
  log(`  WYN WooCommerce: ${WC_STORE_URL}`, 'cyan');
  log(`  Mode: ${auditOnly ? 'AUDIT ONLY' : execute ? 'EXECUTING CHANGES' : 'DRY RUN (use --execute to apply)'}`, execute ? 'green' : 'yellow');
  console.log('═'.repeat(70));

  try {
    // Step 1: Fetch all WYN products from Shopify
    const shopifyProducts = fetchAllWYNProducts();

    if (shopifyProducts.length === 0) {
      log('\nNo "What You Need" vendor products found in Shopify!', 'red');
      process.exit(1);
    }

    // Step 2: Build WooCommerce lookup
    const wcLookup = buildWCLookup();

    // Step 3: Batch-check cost status for all variants
    const { missingCost, withCost, allVariants, costMap } = getCostStatus(shopifyProducts);

    if (!auditOnly) {
      if (missingCost.length === 0) {
        log('\nAll "What You Need" products already have a cost per unit set!', 'green');
      } else {
        // Step 4: Match missing-cost products to WC and calculate costs
        section('MATCHING & CALCULATING COSTS');

        let updated = 0;
        let noMatch = 0;
        let errors = 0;

        for (const entry of missingCost) {
          const wcMatch = findWCMatch(entry, wcLookup);

          if (!wcMatch) {
            noMatch++;
            log(`  ✗ No WC match: ${entry.productTitle} (SKU: ${entry.sku})`, 'yellow');
            continue;
          }

          const wynPrice = wcMatch.retailPrice;
          const multiplier = getMultiplier(wynPrice);

          if (!multiplier) {
            noMatch++;
            log(`  ✗ WYN price $${wynPrice} out of range: ${entry.productTitle}`, 'yellow');
            continue;
          }

          const newCost = calculateShopifyCost(wynPrice);

          console.log(`\n  ${entry.productTitle} [${entry.variantTitle}]`);
          console.log(`    SKU: ${entry.sku || '(none)'} | Shopify Price: $${entry.currentPrice}`);
          console.log(`    WYN Retail: $${wynPrice} | Multiplier: ×${multiplier}`);
          console.log(`    ${C.green}Calculated Shopify Cost: $${newCost}${C.reset}`);
          console.log(`    Matched WC product: ${wcMatch.name}`);

          if (execute) {
            try {
              updateCost(entry.inventoryItemId, newCost);
              log(`    ✓ Cost updated to $${newCost}`, 'green');
              updated++;

              // Update the cost map for the audit
              costMap.set(entry.inventoryItemId, newCost);
            } catch (err) {
              log(`    ✗ Error updating: ${err.message}`, 'red');
              errors++;
            }
          } else {
            log(`    Would update cost to $${newCost}`, 'yellow');
            updated++;
          }
        }

        section('UPDATE SUMMARY');
        log(`Products with cost already set: ${withCost.length}`, 'blue');
        log(`Products missing cost: ${missingCost.length}`, 'cyan');
        log(`Successfully ${execute ? 'updated' : 'would update'}: ${updated}`, 'green');
        log(`No WC match found: ${noMatch}`, 'yellow');
        if (errors > 0) log(`Errors: ${errors}`, 'red');
      }
    }

    // Step 5: Run full audit using already-fetched data
    // If we executed updates, re-fetch costs for accurate audit
    if (execute && missingCost.length > 0) {
      section('RE-FETCHING COSTS FOR POST-UPDATE AUDIT');
      const updatedCostMap = batchGetInventoryItems(allVariants.map(v => v.inventoryItemId));
      runAudit(allVariants, updatedCostMap, wcLookup);
    } else {
      runAudit(allVariants, costMap, wcLookup);
    }

    section('COMPLETE');
    if (!execute && !auditOnly) {
      log('\nThis was a DRY RUN. To apply changes:', 'yellow');
      console.log('  node src/wyn-cost-updater.js --execute');
    }

  } catch (error) {
    log(`\nFatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();
