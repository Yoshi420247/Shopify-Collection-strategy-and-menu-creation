#!/usr/bin/env node
/**
 * fix-wholesale-prices.js
 *
 * Finds Shopify products (vendor = "What You Need") whose retail price
 * matches the WyndDistribution wholesale price and corrects them using
 * the standard pricing formula:
 *
 *   WYN wholesale → tiered cost multiplier → formula retail markup
 *
 * Usage:
 *   node src/fix-wholesale-prices.js              # dry run (preview only)
 *   node src/fix-wholesale-prices.js --execute    # actually update prices
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';

const EXECUTE = process.argv.includes('--execute');
const STORE = process.env.SHOPIFY_STORE_URL || 'oil-slick-pad.myshopify.com';
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const BASE_URL = `https://${STORE}/admin/api/2024-01`;
const WC_BASE = process.env.WC_STORE_URL || 'https://wyndistribution.com';

if (!TOKEN) { console.error('Missing SHOPIFY_ACCESS_TOKEN'); process.exit(1); }

// ── Pricing logic (mirrors pricing-engine.js) ──────────────────────────────

const COST_TIERS = [
  { min: 0.50, max: 4.00, multiplier: 2.5 },
  { min: 4.01, max: 20.00, multiplier: 2.0 },
  { min: 20.01, max: 40.00, multiplier: 1.8 },
  { min: 40.01, max: 100.00, multiplier: 1.6 },
  { min: 100.01, max: 200.00, multiplier: 1.5 },
  { min: 200.01, max: Infinity, multiplier: 1.4 },
];

function calculateCost(wynPrice) {
  const price = parseFloat(wynPrice);
  if (!price || price <= 0) return 0;
  for (const tier of COST_TIERS) {
    if (price >= tier.min && price <= tier.max) {
      return Math.round(price * tier.multiplier * 100) / 100;
    }
  }
  return Math.round(price * 1.4 * 100) / 100;
}

function formulaRetailPrice(cost) {
  let price;
  if (cost <= 5)        price = cost * 3.0;
  else if (cost <= 15)  price = cost * 2.5;
  else if (cost <= 40)  price = cost * 2.0;
  else if (cost <= 100) price = cost * 1.8;
  else                  price = cost * 1.6;

  // Psychological pricing
  if (price < 10)       price = Math.ceil(price) - 0.01;
  else if (price < 50)  price = Math.ceil(price / 5) * 5 - 0.01;
  else if (price < 100) price = Math.ceil(price / 10) * 10 - 0.05;
  else                  price = Math.ceil(price / 10) * 10;

  return Math.round(price * 100) / 100;
}

// ── HTTP helpers (curl-based) ──────────────────────────────────────────────

const shopifyHeaders = `"X-Shopify-Access-Token: ${TOKEN}" "Content-Type: application/json"`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function curlGet(url, headers) {
  const hdrFile = `/tmp/hdr_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`;
  const bodyFile = `/tmp/bdy_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`;
  try {
    const hdrFlags = headers ? headers.split('" "').map(h => `-H "${h.replace(/^"|"$/g, '')}"`).join(' ') : '';
    execSync(`curl -s -D "${hdrFile}" -o "${bodyFile}" ${hdrFlags} "${url}"`, { stdio: 'pipe' });
    const body = readFileSync(bodyFile, 'utf8');
    const hdrs = readFileSync(hdrFile, 'utf8');
    let nextUrl = null;
    for (const line of hdrs.split('\n')) {
      if (line.toLowerCase().startsWith('link:')) {
        const parts = line.split(',');
        for (const part of parts) {
          if (part.includes('rel="next"')) {
            nextUrl = part.split('<')[1].split('>')[0];
          }
        }
      }
    }
    return { data: JSON.parse(body), nextUrl };
  } catch (e) {
    return { data: null, nextUrl: null };
  } finally {
    try { unlinkSync(hdrFile); } catch {}
    try { unlinkSync(bodyFile); } catch {}
  }
}

function curlPut(url, body, headers) {
  const bodyFile = `/tmp/put_${Date.now()}.json`;
  writeFileSync(bodyFile, JSON.stringify(body));
  try {
    const hdrFlags = headers.split('" "').map(h => `-H "${h.replace(/^"|"$/g, '')}"`).join(' ');
    const out = execSync(`curl -s -X PUT ${hdrFlags} -d @"${bodyFile}" "${url}"`, { encoding: 'utf8' });
    return JSON.parse(out);
  } catch (e) {
    return null;
  } finally {
    try { unlinkSync(bodyFile); } catch {}
  }
}

// ── Normalize for matching ─────────────────────────────────────────────────

function normalize(s) {
  return s.toLowerCase()
    .replace(/[\u2033\u201d\u201c]/g, '"')
    .replace(/[\u2032\u2019\u2018]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00a0|\u200b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  FIX WHOLESALE PRICES  ${EXECUTE ? '🔴 LIVE MODE' : '🟡 DRY RUN'}`);
  console.log(`${'═'.repeat(70)}\n`);

  // 1. Fetch all WC products with prices
  console.log('Step 1: Fetching WyndDistribution products...');
  const wcProducts = {};
  let page = 1;
  while (true) {
    const { data } = curlGet(`${WC_BASE}/wp-json/wc/v3/products?per_page=100&page=${page}`, null);
    if (!data || !Array.isArray(data) || data.length === 0) break;
    for (const p of data) {
      const price = parseFloat(p.price || p.regular_price || '0');
      if (price > 0) wcProducts[normalize(p.name)] = price;
    }
    if (data.length < 100) break;
    page++;
    await sleep(300);
  }
  console.log(`  ${Object.keys(wcProducts).length} WC products with prices\n`);

  // 2. Fetch all Shopify WYN products
  console.log('Step 2: Fetching Shopify "What You Need" products...');
  const shopifyProducts = [];
  let url = `${BASE_URL}/products.json?vendor=What+You+Need&limit=250&fields=id,title,variants,status`;
  while (url) {
    const { data, nextUrl } = curlGet(url, shopifyHeaders);
    if (data?.products) shopifyProducts.push(...data.products);
    url = nextUrl;
    if (url) await sleep(500);
  }
  console.log(`  ${shopifyProducts.length} Shopify WYN products\n`);

  // 3. Identify products at wholesale price
  console.log('Step 3: Identifying products at wholesale pricing...');
  const toFix = [];

  for (const sp of shopifyProducts) {
    const spNorm = normalize(sp.title);
    const shopifyPrice = parseFloat(sp.variants[0].price);
    if (shopifyPrice <= 0) continue;

    // Find WC match
    let wcPrice = null;
    if (wcProducts[spNorm] !== undefined) {
      wcPrice = wcProducts[spNorm];
    } else {
      for (const [wcName, price] of Object.entries(wcProducts)) {
        if (spNorm.includes(wcName) || wcName.includes(spNorm)) {
          wcPrice = price;
          break;
        }
      }
    }

    if (wcPrice === null || wcPrice <= 0) continue;

    // Check if Shopify price matches wholesale (within 5%)
    const ratio = shopifyPrice / wcPrice;
    if (ratio >= 0.95 && ratio <= 1.05) {
      const newCost = calculateCost(wcPrice);
      const newRetail = formulaRetailPrice(newCost);
      toFix.push({
        id: sp.id,
        title: sp.title,
        status: sp.status,
        variantId: sp.variants[0].id,
        inventoryItemId: sp.variants[0].inventory_item_id,
        currentPrice: shopifyPrice,
        wcPrice,
        newCost,
        newRetail,
      });
    }
  }

  console.log(`  Found ${toFix.length} products at wholesale pricing\n`);

  // 4. Preview/apply fixes
  console.log(`Step 4: ${EXECUTE ? 'Applying' : 'Previewing'} price corrections...\n`);
  console.log(`${'Title'.padEnd(55)} ${'Current'.padStart(9)} ${'WC'.padStart(9)} ${'New Retail'.padStart(10)}`);
  console.log(`${'-'.repeat(55)} ${'-'.repeat(9)} ${'-'.repeat(9)} ${'-'.repeat(10)}`);

  let updated = 0;
  let failed = 0;

  for (const item of toFix) {
    const shortTitle = item.title.length > 53 ? item.title.slice(0, 50) + '...' : item.title;
    console.log(`${shortTitle.padEnd(55)} $${item.currentPrice.toFixed(2).padStart(8)} $${item.wcPrice.toFixed(2).padStart(8)} $${item.newRetail.toFixed(2).padStart(9)}`);

    if (EXECUTE) {
      // Update variant price
      const variantResult = curlPut(
        `${BASE_URL}/variants/${item.variantId}.json`,
        { variant: { id: item.variantId, price: item.newRetail.toFixed(2) } },
        shopifyHeaders
      );

      if (variantResult?.variant) {
        updated++;
        console.log(`  \x1b[32m✔ Price updated to $${item.newRetail.toFixed(2)}\x1b[0m`);
      } else {
        failed++;
        console.log(`  \x1b[31m✘ Failed to update price\x1b[0m`);
      }

      // Also set the inventory item cost
      curlPut(
        `${BASE_URL}/inventory_items/${item.inventoryItemId}.json`,
        { inventory_item: { cost: item.newCost.toFixed(2) } },
        shopifyHeaders
      );

      await sleep(550); // Rate limiting
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(70)}`);
  if (EXECUTE) {
    console.log(`  DONE: ${updated} prices updated, ${failed} failures`);
  } else {
    console.log(`  DRY RUN: ${toFix.length} products would be updated`);
    console.log(`  Run with --execute to apply changes`);
  }
  console.log(`${'═'.repeat(70)}\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
