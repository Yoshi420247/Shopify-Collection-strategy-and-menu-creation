#!/usr/bin/env node
/**
 * Sold-Out Inventory Sync
 *
 * Cross-references Shopify sold-out products against WooCommerce inventory:
 * - Products in stock on WC but sold out on Shopify -> restocked to WC quantity
 * - Products sold out on both platforms -> set to draft
 * - Products not found on WC -> set to draft
 *
 * Usage: node src/sold-out-inventory-sync.js [--dry-run]
 */

import 'dotenv/config';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_API = process.env.SHOPIFY_API_VERSION || '2024-01';
const SHOPIFY_BASE = `https://${SHOPIFY_STORE}/admin/api/${SHOPIFY_API}`;

const WC_URL = process.env.WC_STORE_URL?.replace(/\/$/, '');
const WC_KEY = process.env.WC_CONSUMER_KEY;
const WC_SECRET = process.env.WC_CONSUMER_SECRET;
const WC_AUTH = Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64');

const DRY_RUN = process.argv.includes('--dry-run');
const RATE_LIMIT_MS = 500;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function shopifyGet(path) {
  const resp = await fetch(`${SHOPIFY_BASE}${path}`, {
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' }
  });
  if (!resp.ok) throw new Error(`Shopify GET ${path}: ${resp.status}`);
  return { data: await resp.json(), headers: resp.headers };
}

async function shopifyPut(path, body) {
  if (DRY_RUN) { console.log(`  [DRY RUN] PUT ${path}`); return {}; }
  await sleep(RATE_LIMIT_MS);
  const resp = await fetch(`${SHOPIFY_BASE}${path}`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error(`Shopify PUT ${path}: ${resp.status}`);
  return resp.json();
}

async function shopifyPost(path, body) {
  if (DRY_RUN) { console.log(`  [DRY RUN] POST ${path}`); return {}; }
  await sleep(RATE_LIMIT_MS);
  const resp = await fetch(`${SHOPIFY_BASE}${path}`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error(`Shopify POST ${path}: ${resp.status}`);
  return resp.json();
}

async function wcSearch(searchTerm) {
  const encoded = encodeURIComponent(searchTerm);
  const url = `${WC_URL}/wp-json/wc/v3/products?search=${encoded}&per_page=10`;
  try {
    const resp = await fetch(url, {
      headers: { 'Authorization': `Basic ${WC_AUTH}`, 'Content-Type': 'application/json' }
    });
    if (!resp.ok) return [];
    return resp.json();
  } catch {
    return [];
  }
}

function normalize(s) {
  return s.toLowerCase()
    .replace(/[\u2033\u2032\u201c\u201d\u2018\u2019\u2013\u2014\u00bc\u00bd\u00be\u00b0\u00a0″'\"–—]/g, ' ')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titlesMatch(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;
  const wa = new Set(na.split(' ')), wb = new Set(nb.split(' '));
  const overlap = [...wa].filter(w => wb.has(w)).length;
  return overlap / Math.max(wa.size, wb.size) > 0.7;
}

async function fetchAllActiveProducts() {
  const products = [];
  let pageInfo = null;

  while (true) {
    const path = pageInfo
      ? `/products.json?limit=250&page_info=${pageInfo}`
      : '/products.json?limit=250&status=active&vendor=What+You+Need';

    const { data, headers } = await shopifyGet(path);
    products.push(...(data.products || []));
    console.log(`  Fetched ${products.length} products...`);

    const link = headers.get('Link') || '';
    const match = link.match(/page_info=([^>&]+).*rel="next"/);
    if (!match || (data.products || []).length < 250) break;
    pageInfo = match[1];
    await sleep(RATE_LIMIT_MS);
  }

  return products;
}

function findSoldOut(products) {
  return products.filter(p => {
    const variants = p.variants || [];
    const tracked = variants.filter(v => v.inventory_management === 'shopify');
    if (tracked.length === 0) return false;
    return tracked.every(v => (v.inventory_quantity || 0) <= 0);
  });
}

async function main() {
  console.log('=== Sold-Out Inventory Sync ===');
  if (DRY_RUN) console.log('[DRY RUN MODE]\n');

  console.log('Fetching active "What You Need" products...');
  const allProducts = await fetchAllActiveProducts();
  console.log(`Total active products: ${allProducts.length}\n`);

  const soldOut = findSoldOut(allProducts);
  console.log(`Sold-out products: ${soldOut.length}\n`);

  if (soldOut.length === 0) {
    console.log('No sold-out products found. All good!');
    return;
  }

  const inStockOnWC = [];
  const soldOutOnWC = [];
  const notFoundOnWC = [];

  console.log('Cross-referencing with WooCommerce...');
  for (const p of soldOut) {
    const searchWords = p.title.replace(/[^\w\s]/g, '').split(/\s+/).slice(0, 5).join(' ');
    const wcResults = await wcSearch(searchWords);
    await sleep(800);

    let matched = null;
    if (Array.isArray(wcResults)) {
      for (const wc of wcResults) {
        if (titlesMatch(p.title, wc.name || '')) {
          matched = wc;
          break;
        }
      }
    }

    if (matched) {
      const info = { shopifyId: p.id, title: p.title, wcStockStatus: matched.stock_status, wcQty: matched.stock_quantity || 0 };
      if (matched.stock_status === 'instock') {
        inStockOnWC.push(info);
        console.log(`  IN STOCK: ${p.title} (WC qty: ${info.wcQty})`);
      } else {
        soldOutOnWC.push(info);
        console.log(`  SOLD OUT: ${p.title}`);
      }
    } else {
      notFoundOnWC.push({ shopifyId: p.id, title: p.title });
      console.log(`  NOT FOUND: ${p.title}`);
    }
  }

  console.log(`\n--- Actions ---`);
  console.log(`Restocking: ${inStockOnWC.length}`);
  console.log(`Setting to draft: ${soldOutOnWC.length + notFoundOnWC.length}\n`);

  // Set sold-out and not-found to draft
  for (const p of [...soldOutOnWC, ...notFoundOnWC]) {
    await shopifyPut(`/products/${p.shopifyId}.json`, { product: { id: p.shopifyId, status: 'draft' } });
    console.log(`  DRAFTED: ${p.title}`);
  }

  // Restock in-stock products
  for (const p of inStockOnWC) {
    const { data } = await shopifyGet(`/products/${p.shopifyId}.json?fields=id,variants`);
    const variants = data.product?.variants || [];

    for (const v of variants) {
      if (!v.inventory_item_id) continue;
      const { data: invData } = await shopifyGet(`/inventory_levels.json?inventory_item_ids=${v.inventory_item_id}`);
      const levels = invData.inventory_levels || [];
      if (levels.length === 0) continue;

      const location = levels[0].location_id;
      const current = levels[0].available || 0;
      const target = variants.length === 1 ? p.wcQty : Math.max(1, Math.floor(p.wcQty / variants.length));
      const adjustment = target - current;

      if (adjustment > 0) {
        await shopifyPost('/inventory_levels/adjust.json', {
          location_id: location, inventory_item_id: v.inventory_item_id, available_adjustment: adjustment
        });
        console.log(`  RESTOCKED: ${p.title} variant '${v.title}': ${current} -> ${target}`);
      }
    }
  }

  console.log('\n=== Sync Complete ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
