#!/usr/bin/env node
/**
 * fix-remaining-prices.js
 *
 * Fixes three remaining pricing issues across all WYN products:
 *   1. $0 priced variants on active products
 *   2. Below-wholesale display-box items (title contains "bx", "carton", etc.)
 *   3. Per-unit glass/accessory items with margin < 1.5× wholesale
 *
 * Usage:
 *   node src/fix-remaining-prices.js              # dry run
 *   node src/fix-remaining-prices.js --execute     # live
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

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── HTTP helpers ──────────────────────────────────────────────────────

const shopifyHeaders = `"X-Shopify-Access-Token: ${TOKEN}" "Content-Type: application/json"`;

function curlGet(url, headers) {
  const hf = `/tmp/h_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`;
  const bf = `/tmp/b_${Date.now()}_${Math.random().toString(36).slice(2)}.txt`;
  try {
    const hdrFlags = headers ? headers.split('" "').map(h => `-H "${h.replace(/^"|"$/g, '')}"`).join(' ') : '';
    execSync(`curl -s -D "${hf}" -o "${bf}" ${hdrFlags} "${url}"`, { stdio: 'pipe' });
    const body = readFileSync(bf, 'utf8');
    const hdrs = readFileSync(hf, 'utf8');
    let nextUrl = null;
    for (const line of hdrs.split('\n')) {
      if (line.toLowerCase().startsWith('link:')) {
        for (const part of line.split(',')) {
          if (part.includes('rel="next"')) nextUrl = part.split('<')[1].split('>')[0];
        }
      }
    }
    return { data: JSON.parse(body), nextUrl };
  } catch { return { data: null, nextUrl: null }; }
  finally { try { unlinkSync(hf); } catch {} try { unlinkSync(bf); } catch {} }
}

function curlPut(url, body) {
  const f = `/tmp/p_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
  writeFileSync(f, JSON.stringify(body));
  try {
    const hf = shopifyHeaders.split('" "').map(h => `-H "${h.replace(/^"|"$/g, '')}"`).join(' ');
    const out = execSync(`curl -s -X PUT ${hf} -d @"${f}" "${url}"`, { encoding: 'utf8' });
    return JSON.parse(out);
  } catch { return null; }
  finally { try { unlinkSync(f); } catch {} }
}

function norm(s) {
  return s.toLowerCase().replace(/[\u2033\u201d\u201c]/g, '"').replace(/[\u2032\u2019\u2018]/g, "'")
    .replace(/[\u2013\u2014]/g, '-').replace(/\u00a0|\u200b/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractInches(t) {
  const n = t.replace(/[\u2033\u201d\u201c\u201e\u201f]/g, '"').replace(/[\u2032\u2019\u2018\u201a\u201b]/g, "'");
  const m = n.match(/(\d+(?:\.\d+)?)\s*(?:"|''+|inch|in\b)/i);
  return m ? parseFloat(m[1]) : 0;
}

// ── Pricing logic ────────────────────────────────────────────────────

function isDisplayBox(title) {
  const t = title.toLowerCase();
  return /\d+\s*bx\b/.test(t) || t.includes('carton') || t.includes('display')
    || t.includes('tower') || /\d+\s*pack\s*(carton|box)/i.test(t)
    || t.includes('promo display') || t.includes('count tower');
}

function isBulkPack(title) {
  const t = title.toLowerCase();
  return /\d+ct\s*(jar|display|box)/i.test(t) || /\d+\s*pack\s*w\//i.test(t)
    || t.includes('100 pack') || t.includes('40ct jar') || t.includes('20ct display');
}

function isCustom(title) {
  return title.toLowerCase().startsWith('custom ');
}

function isArtGlass(title) {
  const t = title.toLowerCase();
  return t.includes('amani') || t.includes('bowman') || t.includes('kid dino')
    || t.includes('cove glass') || t.includes('swan ') || t.includes('creep glass')
    || t.includes('kerby') || t.includes('phd glass');
}

function getTargetPrice(title, wcPrice, currentPrice) {
  const t = title.toLowerCase()
    .replace(/[\u2033\u201d\u201c]/g, '"').replace(/[\u2032\u2019\u2018]/g, "'")
    .replace(/[\u2013\u2014]/g, '-');
  const inches = extractInches(t);

  // Skip custom items — pricing is intentional
  if (isCustom(title)) return null;

  // Skip art glass — pricing is intentional
  if (isArtGlass(title)) return null;

  // ── $0 products → calculate proper retail ──
  // ── Display boxes (title has "bx", "carton", "tower") ──
  if (isDisplayBox(title)) {
    // Display boxes: WC = wholesale case price, retail = ~1.6-2× wholesale
    if (wcPrice <= 20) return Math.ceil(wcPrice * 2) - 0.01;        // $20 WC → $39.99
    if (wcPrice <= 40) return Math.ceil(wcPrice * 1.7 / 5) * 5 - 0.01;  // $30 WC → $49.99
    if (wcPrice <= 60) return Math.ceil(wcPrice * 1.6 / 5) * 5 - 0.01;
    return Math.ceil(wcPrice * 1.5 / 10) * 10 - 0.05;
  }

  // ── Rolling papers/cones — single packs ──
  // These have WC price = display box, Shopify = per unit. Mostly correctly priced.
  // Only flag if $0 or clearly wrong.
  if (t.includes('rolling paper') || t.includes('cones') || t.includes('papers')
    || t.includes('wraps') || t.includes('tips') || t.includes('filter')) {
    if (currentPrice === 0) {
      // Guess single-unit retail from WC display price
      // Assume WC is a 24-pack display, single unit = WC/24 * 3 (retail markup)
      const perUnit = (wcPrice / 24) * 3;
      if (perUnit < 3) return 2.99;
      if (perUnit < 6) return 4.99;
      if (perUnit < 10) return 7.99;
      return Math.ceil(perUnit) - 0.01;
    }
    // For rolling papers with existing price, don't reprice — margins on commodity items are intentionally thin
    return null;
  }

  // ── Lookah products ──
  if (t.includes('lookah ant')) return 44.99;
  if (t.includes('lookah seahorse')) return currentPrice > 10 ? null : 24.99;  // keep existing if reasonable

  // ── Glass beakers/bongs ──
  if (t.includes('beaker') || t.includes('bong') || t.includes('straight') || t.includes('bubbler')
    || t.includes('recycler') || t.includes('rig') || t.includes('water pipe')) {
    if (inches >= 25) return 199.99;
    if (inches >= 18) return 129.99;
    if (inches >= 16) return 109.99;
    if (inches >= 14) return 99.99;
    if (inches >= 12) return 79.99;
    if (inches >= 10) return 59.99;
    if (inches >= 8) return 49.99;
    if (inches >= 7) return 44.99;
    if (inches >= 6) return 39.99;
    if (inches >= 4) return 29.99;
    return 39.99;
  }

  // ── Hand pipes ──
  if (t.includes('hand pipe') || t.includes('pipe') || t.includes('sherlock') || t.includes('steamroller')) {
    if (t.includes('made in usa') || t.includes('element')) {
      if (wcPrice <= 10) return 24.99;
      if (wcPrice <= 20) return 34.99;
      return 49.99;
    }
    if (wcPrice <= 5) return 14.99;
    if (wcPrice <= 10) return 24.99;
    if (wcPrice <= 20) return 34.99;
    return 44.99;
  }

  // ── Bowls ──
  if (t.includes('bowl') || t.includes('flower bowl')) {
    if (wcPrice <= 3) return 12.99;
    if (wcPrice <= 7) return 19.99;
    if (wcPrice <= 10) return 24.99;
    return 29.99;
  }

  // ── Grinders ──
  if (t.includes('grinder')) {
    if (wcPrice <= 5) return 14.99;
    if (wcPrice <= 10) return 24.99;
    return 34.99;
  }

  // ── Carb caps ──
  if (t.includes('carb cap')) {
    if (wcPrice <= 3) return 9.99;
    if (wcPrice <= 7) return 14.99;
    if (wcPrice <= 12) return 24.99;
    return 29.99;
  }

  // ── Chillums ──
  if (t.includes('chillum')) {
    if (wcPrice <= 3) return 9.99;
    if (wcPrice <= 5) return 14.99;
    return 19.99;
  }

  // ── Dab tools ──
  if (t.includes('dab tool') || t.includes('sceptor') || t.includes('dabber')) {
    if (wcPrice <= 10) return 19.99;
    if (wcPrice <= 25) return 39.99;
    return 59.99;
  }

  // ── Vape / battery ──
  if (t.includes('battery') || t.includes('vaporizer') || t.includes('vape')) {
    if (wcPrice <= 20) return 29.99;
    if (wcPrice <= 40) return 59.99;
    return 79.99;
  }

  // ── Rolling trays ──
  if (t.includes('tray')) {
    if (wcPrice <= 5) return 12.99;
    if (wcPrice <= 10) return 19.99;
    return 29.99;
  }

  // ── Generic fallback: 2.5× wholesale minimum ──
  const minRetail = wcPrice * 2.5;
  if (minRetail < 10) return Math.ceil(minRetail) - 0.01;
  if (minRetail < 50) return Math.ceil(minRetail / 5) * 5 - 0.01;
  if (minRetail < 100) return Math.ceil(minRetail / 10) * 10 - 0.05;
  return Math.ceil(minRetail / 10) * 10;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  COMPREHENSIVE PRICE FIX  ${EXECUTE ? '🔴 LIVE' : '🟡 DRY RUN'}`);
  console.log(`${'═'.repeat(70)}\n`);

  // 1. Fetch WC prices
  console.log('Step 1: Fetching WC prices...', '\n');
  const wcPrices = {};
  let page = 1;
  while (true) {
    const { data } = curlGet(`${WC_BASE}/wp-json/wc/v3/products?per_page=100&page=${page}`, null);
    if (!data || !Array.isArray(data) || data.length === 0) break;
    for (const p of data) {
      const price = parseFloat(p.price || p.regular_price || '0');
      if (price > 0) wcPrices[norm(p.name)] = price;
    }
    if (data.length < 100) break;
    page++;
    await sleep(300);
  }
  console.log(`  ${Object.keys(wcPrices).length} WC products\n`);

  // 2. Fetch all Shopify products
  console.log('Step 2: Fetching Shopify products...');
  const shopifyProducts = [];
  let url = `${BASE_URL}/products.json?vendor=What+You+Need&limit=250&fields=id,title,variants,status`;
  while (url) {
    const { data, nextUrl } = curlGet(url, shopifyHeaders);
    if (data?.products) shopifyProducts.push(...data.products);
    url = nextUrl;
    if (url) await sleep(500);
  }
  console.log(`  ${shopifyProducts.length} products\n`);

  // 3. Find all issues
  console.log('Step 3: Scanning for pricing issues...');
  const fixes = [];  // { productId, title, variantId, currentPrice, targetPrice, reason }

  for (const sp of shopifyProducts) {
    const spNorm = norm(sp.title);

    // Find WC match
    let wcPrice = null;
    if (wcPrices[spNorm] !== undefined) wcPrice = wcPrices[spNorm];
    else {
      for (const [wn, wp] of Object.entries(wcPrices)) {
        if (spNorm.includes(wn) || wn.includes(spNorm)) { wcPrice = wp; break; }
      }
    }
    if (wcPrice === null || wcPrice <= 0) continue;

    for (const v of sp.variants) {
      const vp = parseFloat(v.price);
      let reason = null;

      if (vp === 0) {
        reason = '$0 price';
      } else if (wcPrice > 0 && !isCustom(sp.title) && !isBulkPack(sp.title)) {
        const ratio = vp / wcPrice;
        if (ratio <= 1.1) {
          reason = 'at wholesale';
        } else if (ratio < 1.5 && !isArtGlass(sp.title)) {
          // Check if it's a rolling paper single pack (correctly priced)
          const t = sp.title.toLowerCase();
          const isSinglePack = (t.includes('paper') || t.includes('cone') || t.includes('wrap') || t.includes('tip') || t.includes('filter'))
            && !isDisplayBox(sp.title);
          if (!isSinglePack) {
            reason = 'low margin';
          }
        }
      }

      if (!reason) continue;

      const target = getTargetPrice(sp.title, wcPrice, vp);
      if (target === null) continue;
      if (Math.abs(target - vp) < 1.00) continue;  // skip if change < $1

      fixes.push({
        productId: sp.id,
        title: sp.title,
        variantId: v.id,
        currentPrice: vp,
        wcPrice,
        targetPrice: target,
        reason,
        status: sp.status,
      });
    }
  }

  // Deduplicate products for summary
  const productSet = new Set(fixes.map(f => f.productId));
  console.log(`  Found ${fixes.length} variants across ${productSet.size} products needing price fixes\n`);

  // 4. Apply
  console.log(`Step 4: ${EXECUTE ? 'Applying' : 'Previewing'} fixes...\n`);

  let updated = 0, failed = 0, skipped = 0;
  let currentProduct = '';

  for (const fix of fixes) {
    if (fix.title !== currentProduct) {
      currentProduct = fix.title;
      const short = fix.title.length > 55 ? fix.title.slice(0, 52) + '...' : fix.title;
      console.log(`\n${short} [${fix.status}]`);
      console.log(`  WC: $${fix.wcPrice.toFixed(2)} | Reason: ${fix.reason}`);
    }

    console.log(`  V${fix.variantId}: $${fix.currentPrice.toFixed(2)} → $${fix.targetPrice.toFixed(2)}`);

    if (EXECUTE) {
      const result = curlPut(
        `${BASE_URL}/variants/${fix.variantId}.json`,
        { variant: { id: fix.variantId, price: fix.targetPrice.toFixed(2) } }
      );
      if (result?.variant) {
        updated++;
        console.log(`    \x1b[32m✔\x1b[0m`);
      } else {
        failed++;
        console.log(`    \x1b[31m✘\x1b[0m`);
      }
      await sleep(350);
    }
  }

  console.log(`\n${'═'.repeat(70)}`);
  if (EXECUTE) {
    console.log(`  DONE: ${updated} updated, ${failed} failed, ${productSet.size} products`);
  } else {
    console.log(`  DRY RUN: ${fixes.length} variants across ${productSet.size} products`);
    console.log(`  Run with --execute to apply`);
  }
  console.log(`${'═'.repeat(70)}\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
