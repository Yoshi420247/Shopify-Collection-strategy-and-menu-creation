#!/usr/bin/env node
/**
 * WYN Cost Fixer — fixes variants that have a cost set but at the wrong multiplier.
 *
 * These are items where the Shopify cost was set to the raw WYN price instead
 * of WYN price × tiered multiplier.
 *
 * Usage:
 *   node src/wyn-fix-incorrect-costs.js           # Dry run
 *   node src/wyn-fix-incorrect-costs.js --execute  # Apply fixes
 */

import 'dotenv/config';
import { execSync } from 'child_process';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const SHOPIFY_BASE = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API_VERSION}`;
const WC_STORE_URL = process.env.WC_STORE_URL;
const WC_KEY = process.env.WC_CONSUMER_KEY;
const WC_SECRET = process.env.WC_CONSUMER_SECRET;

const C = {
  reset: '\x1b[0m', bright: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  cyan: '\x1b[36m', red: '\x1b[31m',
};
const log = (msg, c = 'reset') => console.log(`${C[c]}${msg}${C.reset}`);
const section = (title) => { console.log('\n' + '═'.repeat(70)); log(`  ${title}`, 'bright'); console.log('═'.repeat(70)); };

function curlGet(url, headers = {}, retries = 3) {
  const headerArgs = Object.entries(headers).map(([k, v]) => `-H "${k}: ${v}"`).join(' ');
  const cmd = `curl -s --retry 3 --retry-delay 2 --max-time 60 ${headerArgs} "${url}"`;
  for (let i = 1; i <= retries; i++) {
    try {
      return JSON.parse(execSync(cmd, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 }));
    } catch (err) {
      if (i < retries) { console.log(`  Retry ${i}/${retries}...`); sleep(2000 * i); }
      else throw err;
    }
  }
}

function curlGetWithHeaders(url, headers = {}, retries = 3) {
  const headerArgs = Object.entries(headers).map(([k, v]) => `-H "${k}: ${v}"`).join(' ');
  const cmd = `curl -s --retry 3 --retry-delay 2 --max-time 60 -D /tmp/curl_headers ${headerArgs} "${url}"`;
  for (let i = 1; i <= retries; i++) {
    try {
      const body = execSync(cmd, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 });
      let rawHeaders = '';
      try { rawHeaders = execSync('cat /tmp/curl_headers', { encoding: 'utf-8' }); } catch {}
      return { body: JSON.parse(body), rawHeaders };
    } catch (err) {
      if (i < retries) { console.log(`  Retry ${i}/${retries}...`); sleep(2000 * i); }
      else throw err;
    }
  }
}

function curlPut(url, data, headers = {}, retries = 3) {
  const headerArgs = Object.entries(headers).map(([k, v]) => `-H "${k}: ${v}"`).join(' ');
  const jsonStr = JSON.stringify(data).replace(/'/g, "'\\''");
  const cmd = `curl -s --retry 3 --retry-delay 2 --max-time 30 -X PUT ${headerArgs} -H "Content-Type: application/json" -d '${jsonStr}' "${url}"`;
  for (let i = 1; i <= retries; i++) {
    try {
      return JSON.parse(execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }));
    } catch (err) {
      if (i < retries) { console.log(`  Retry ${i}/${retries}...`); sleep(2000 * i); }
      else throw err;
    }
  }
}

function sleep(ms) { execSync(`sleep ${(ms / 1000).toFixed(2)}`); }

const shopifyHeaders = { 'X-Shopify-Access-Token': SHOPIFY_TOKEN };
function shopifyGet(endpoint, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${SHOPIFY_BASE}/${endpoint}${qs ? (endpoint.includes('?') ? '&' : '?') + qs : ''}`;
  sleep(500);
  return curlGet(url, shopifyHeaders);
}

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
  const m = getMultiplier(wynRetailPrice);
  return m ? parseFloat((wynRetailPrice * m).toFixed(2)) : null;
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function findWCMatch(entry, wcLookup) {
  const { bySku, byName } = wcLookup;
  if (entry.sku) {
    const k = entry.sku.trim().toLowerCase();
    if (bySku.has(k)) return bySku.get(k);
  }
  const n = normalizeName(entry.productTitle);
  if (byName.has(n)) return byName.get(n);
  for (const [wcN, wcE] of byName.entries()) {
    if (wcN.length > 8 && n.includes(wcN)) return wcE;
    if (n.length > 8 && wcN.includes(n)) return wcE;
  }
  return null;
}

function main() {
  const execute = process.argv.includes('--execute');

  section('WYN COST FIXER — CORRECTING INCORRECTLY MULTIPLIED COSTS');
  log(`  Mode: ${execute ? 'EXECUTING' : 'DRY RUN'}`, execute ? 'green' : 'yellow');

  // 1. Fetch Shopify products
  section('FETCHING SHOPIFY PRODUCTS');
  const allProducts = [];
  let url = `${SHOPIFY_BASE}/products.json?vendor=What+You+Need&limit=250`;
  let page = 0;
  while (url) {
    page++; sleep(500);
    const cmd = `curl -s --max-time 60 -D /tmp/curl_headers -H "X-Shopify-Access-Token: ${SHOPIFY_TOKEN}" "${url}"`;
    const bodyStr = execSync(cmd, { encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 });
    let hdr = ''; try { hdr = execSync('cat /tmp/curl_headers', { encoding: 'utf-8' }); } catch {}
    const data = JSON.parse(bodyStr);
    const batch = data.products || [];
    if (batch.length === 0) break;
    allProducts.push(...batch);
    console.log(`  Page ${page}: ${batch.length} (total: ${allProducts.length})`);
    const m = hdr.match(/<([^>]+)>;\s*rel="next"/);
    url = m ? m[1] : null;
  }
  log(`  ${allProducts.length} products`, 'cyan');

  // 2. Fetch WC products
  section('FETCHING WC PRODUCTS');
  const wcProducts = [];
  let wcPage = 1, wcTotal = 1;
  while (wcPage <= wcTotal) {
    const qs = new URLSearchParams({
      per_page: '100', page: String(wcPage), orderby: 'id', order: 'asc',
      _fields: 'id,name,sku,price,regular_price,permalink,status',
      consumer_key: WC_KEY, consumer_secret: WC_SECRET,
    }).toString();
    sleep(300);
    const r = curlGetWithHeaders(`${WC_STORE_URL}/wp-json/wc/v3/products?${qs}`);
    const batch = Array.isArray(r.body) ? r.body : [];
    if (!batch.length) break;
    wcProducts.push(...batch);
    const tp = r.rawHeaders.match(/x-wp-totalpages:\s*(\d+)/i);
    if (tp) wcTotal = parseInt(tp[1], 10);
    console.log(`  Page ${wcPage}/${wcTotal}: ${batch.length} (total: ${wcProducts.length})`);
    wcPage++;
  }

  const bySku = new Map(), byName = new Map();
  for (const p of wcProducts) {
    const price = parseFloat(p.price) || parseFloat(p.regular_price) || 0;
    if (price <= 0) continue;
    const entry = { wcId: p.id, name: p.name, sku: p.sku || '', retailPrice: price };
    if (p.sku) bySku.set(p.sku.trim().toLowerCase(), entry);
    byName.set(normalizeName(p.name), entry);
  }
  const wcLookup = { bySku, byName };

  // 3. Batch fetch all inventory items
  section('BATCH FETCHING INVENTORY COSTS');
  const allVariants = [];
  for (const p of allProducts) {
    for (const v of p.variants || []) {
      allVariants.push({
        productId: p.id, productTitle: p.title,
        variantId: v.id, variantTitle: v.title,
        sku: v.sku || '', inventoryItemId: v.inventory_item_id,
        currentPrice: parseFloat(v.price) || 0,
      });
    }
  }

  const costMap = new Map();
  for (let i = 0; i < allVariants.length; i += 100) {
    const ids = allVariants.slice(i, i + 100).map(v => v.inventoryItemId).join(',');
    try {
      const data = shopifyGet('inventory_items.json', { ids, limit: '100' });
      for (const item of (data.inventory_items || [])) {
        costMap.set(item.id, parseFloat(item.cost) || 0);
      }
    } catch (err) {
      log(`  Error batch ${i}: ${err.message}`, 'red');
    }
    console.log(`  ${Math.min(i + 100, allVariants.length)}/${allVariants.length}`);
  }

  // 4. Find incorrectly priced items and fix them
  section('FINDING & FIXING INCORRECTLY PRICED VARIANTS');
  let fixed = 0, correct = 0, noMatch = 0, noCost = 0, errors = 0;

  for (const entry of allVariants) {
    const currentCost = costMap.get(entry.inventoryItemId) || 0;
    if (currentCost <= 0) { noCost++; continue; }

    const wcMatch = findWCMatch(entry, wcLookup);
    if (!wcMatch) { noMatch++; continue; }

    const expectedCost = calculateShopifyCost(wcMatch.retailPrice);
    if (!expectedCost) { noMatch++; continue; }

    if (Math.abs(currentCost - expectedCost) <= 0.01) {
      correct++;
      continue;
    }

    // This item needs fixing
    console.log(`\n  ${entry.productTitle} [${entry.variantTitle}]`);
    console.log(`    SKU: ${entry.sku} | WYN: $${wcMatch.retailPrice} × ${getMultiplier(wcMatch.retailPrice)}`);
    console.log(`    Current cost: $${currentCost} → Correct cost: $${expectedCost}`);

    if (execute) {
      try {
        sleep(500);
        curlPut(`${SHOPIFY_BASE}/inventory_items/${entry.inventoryItemId}.json`,
          { inventory_item: { cost: expectedCost.toFixed(2) } }, shopifyHeaders);
        log(`    ✓ Fixed to $${expectedCost}`, 'green');
        fixed++;
      } catch (err) {
        log(`    ✗ Error: ${err.message}`, 'red');
        errors++;
      }
    } else {
      log(`    Would fix to $${expectedCost}`, 'yellow');
      fixed++;
    }
  }

  section('FIX SUMMARY');
  log(`Total variants: ${allVariants.length}`, 'cyan');
  log(`Already correct: ${correct}`, 'green');
  log(`${execute ? 'Fixed' : 'Would fix'}: ${fixed}`, fixed > 0 ? 'green' : 'cyan');
  log(`No WC match: ${noMatch}`, 'yellow');
  log(`No cost set: ${noCost}`, 'blue');
  if (errors > 0) log(`Errors: ${errors}`, 'red');

  if (!execute && fixed > 0) {
    log('\nDRY RUN. To apply: node src/wyn-fix-incorrect-costs.js --execute', 'yellow');
  }
}

main();
