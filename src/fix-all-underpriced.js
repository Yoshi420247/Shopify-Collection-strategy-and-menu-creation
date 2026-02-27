#!/usr/bin/env node
/**
 * fix-all-underpriced.js
 *
 * Comprehensive price fix for ALL WYN products below proper retail markup.
 * Uses competitor-researched pricing for specific product categories.
 *
 * Fixes:
 *   - Products below 2.5× wholesale (standard smoke shop markup)
 *   - Products at or near wholesale pricing
 *   - $0 priced variants on active products
 *
 * Excludes:
 *   - Custom items (WC price is for custom lot)
 *   - Art glass (intentional artist pricing)
 *   - Bulk/display items (WC price is case price, Shopify sells singles)
 *   - Rolling papers/cones (WC price is display box, Shopify sells singles)
 *
 * Usage:
 *   node src/fix-all-underpriced.js              # dry run
 *   node src/fix-all-underpriced.js --execute     # live
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

// ── Category detection ──────────────────────────────────────────────

function isBulkItem(title) {
  const t = title.toLowerCase();
  return /\d+\s*ct\s*(jar|display|box)/i.test(t) || /\d+\s*bx\b/.test(t)
    || /\d+\s*pack\s*(w\/|carton|box|display)/i.test(t) || t.includes('100 pack')
    || t.includes('carton') || t.includes('promo display') || t.includes('count tower')
    || /box of \d+/i.test(t) || /\d+\/box\b/i.test(t)
    || /\d+\s*pack display/i.test(t) || /\d+\s*display box/i.test(t)
    || /\d+\s*\/\s*\d+\s*display/i.test(t) || t.includes('display box')
    || t.includes('blank box for jar') || /\d+\s*pack\s+clip/i.test(t)
    || /\d+\s*pack\s*–?\s*\d/i.test(t);
}

function isRollingPaper(title) {
  const t = title.toLowerCase();
  // Rolling papers, cones, wraps, tips from known brands
  if ((t.includes('paper') || t.includes('cone') || t.includes('wrap')
    || t.includes('tip') || t.includes('filter') || t.includes('roller')
    || t.includes('hemp wick') || t.includes('hempwick') || t.includes('booklet'))
    && (t.includes('raw ') || t.includes('zig zag') || t.includes('blazy')
    || t.includes('ocb ') || t.includes('vibes ') || t.includes('hornet')
    || t.includes('elements '))) return true;
  // Vibes/brand display boxes of papers
  if ((t.includes('vibes') || t.includes('raw')) && t.includes('display')) return true;
  // The Cali by Vibes boxes
  if (t.includes('the cali by vibes')) return true;
  return false;
}

function isCustom(title) {
  return title.toLowerCase().startsWith('custom ');
}

function isArtGlass(title) {
  const t = title.toLowerCase();
  return t.includes('amani') || t.includes('bowman') || t.includes('kid dino')
    || t.includes('cove glass') || t.includes('swan ') || t.includes('creep glass')
    || t.includes('kerby') || t.includes('phd glass') || t.includes('710 sci glass')
    || t.includes('miyagi paint');
}

// ── Competitor-researched pricing ───────────────────────────────────

function getResearchedPrice(title, wcPrice) {
  const t = title.toLowerCase()
    .replace(/[\u2033\u201d\u201c]/g, '"').replace(/[\u2032\u2019\u2018]/g, "'")
    .replace(/[\u2013\u2014]/g, '-');
  const inches = extractInches(t);

  // ── Glass cleaners ──
  if (t.includes('glass cleaner') || t.includes('grunge off')) {
    if (wcPrice <= 11) return 24.99;   // Grunge Off 16oz: retail $19.99-$24.99
    if (wcPrice <= 15) return 24.99;   // Blazy Susan 16oz: retail $14.99-$24.99
    return 29.99;
  }

  // ── Hemp wick ──
  if (t.includes('hempwick') || t.includes('hemp wick')) {
    if (t.includes('250') || t.includes('ball')) return 29.99;  // RAW 250ft ball: retail $24.99-$29.99
    if (wcPrice <= 10) return 14.99;
    return 24.99;
  }

  // ── Lookah products (researched MSRP/retail) ──
  if (t.includes('lookah ant')) return 44.99;         // MSRP $70, typical retail $37-$45
  if (t.includes('lookah snail')) return 24.99;       // Retail $14.99-$19.99, need margin
  if (t.includes('lookah guitar')) return 24.99;      // Retail $19.99-$29.99
  if (t.includes('lookah egg') && !t.includes('dragon')) return 24.99;  // Retail $19.99-$28.99
  if (t.includes('lookah cat')) return 29.99;         // Retail $17.99-$39.99
  if (t.includes('lookah seahorse pro plus')) return 39.99;  // Retail $32.99-$39.99
  if (t.includes('lookah seahorse') && t.includes('coil')) {
    if (t.includes('5-pack') || t.includes('5 pack')) return 29.99;  // MSRP ~$30
    if (t.includes('4-pack') || t.includes('4 pack')) return 29.99;  // Retail $24.99-$39.99
    return 24.99;  // 3-pack, retail $22.99-$39.99
  }
  if (t.includes('lookah unicorn mini')) return 59.99;  // Retail $42.99-$69.99
  if (t.includes('lookah mini dragon')) return 69.99;   // Official $79.99
  if (t.includes('lookah dragon egg')) return 69.99;    // Retail $59.99-$72.99

  // ── Extre / Novelty batteries ──
  if (t.includes('skateboard') && t.includes('battery')) return 24.99;  // Retail $11.99-$24.99
  if (t.includes('squirt gun') && t.includes('battery')) return 29.99;
  if (t.includes('raygun') && t.includes('penjamin')) return 39.99;
  if (t.includes('penjamin') && t.includes('battery')) return 29.99;
  if (t.includes('lip balm') && t.includes('battery')) return 29.99;

  // ── Nectar clips ──
  if (t.includes('nectar clip')) {
    if (t.includes('40 pack') || t.includes('40pack')) return null;  // bulk item, skip
    return 9.99;
  }

  // ── Maven torches ──
  if (t.includes('maven')) {
    if (t.includes('display') || t.includes('pack')) return null;  // bulk display
    return 29.99;
  }

  // ── Zig Zag accessories (not papers) ──
  if (t.includes('zig zag') && t.includes('ashtray')) return 24.99;

  // ── Vibes rolling trays ──
  if (t.includes('vibes') && t.includes('rolling tray')) {
    if (t.includes('small')) return 19.99;
    if (t.includes('medium')) return 24.99;
    if (t.includes('large')) return 29.99;
    return 19.99;
  }
  if (t.includes('vibes') && t.includes('tray')) {
    return 19.99;
  }

  // ── Sesh Sceptor dab tools (retail ~$50) ──
  if (t.includes('sesh sceptor')) {
    if (t.includes('v2')) return 59.99;
    return 49.99;
  }

  // ── Fyre torches ──
  if (t.includes('fyre') && t.includes('gas pump')) return 44.99;  // Retail $34.99-$39.99

  // ── Linda Biggs steamroller ──
  if (t.includes('linda biggs') && t.includes('steamroller')) return 34.99;

  // ── Monark ash catchers (retail $39.99-$49.99) ──
  if (t.includes('monark') && t.includes('ash catcher')) return 49.99;

  // ── Glass flower bowls (by wholesale tier) ──
  if (t.includes('bowl') || t.includes('flower bowl')) {
    if (wcPrice <= 3) return 12.99;     // Basic bowls: retail $8.99-$14.99
    if (wcPrice <= 6) return 17.99;     // Color/fume bowls: retail $12.99-$19.99
    if (wcPrice <= 10) return 24.99;    // Premium bowls: retail $19.99-$29.99
    if (wcPrice <= 15) return 34.99;    // Thick/horn bowls: retail $24.99-$39.99
    return 39.99;
  }

  // ── Glass beakers/bongs (by size) ──
  if (t.includes('beaker') || t.includes('bong') || t.includes('straight tube')) {
    if (t.includes('made in usa') || t.includes('venetian') || t.includes('fume')) {
      // USA-made glass commands premium
      if (inches >= 18) return 169.99;
      if (inches >= 14) return 119.99;
      if (inches >= 10) return 79.99;
      if (inches >= 8) return 59.99;
      return 49.99;
    }
    if (inches >= 25) return 199.99;
    if (inches >= 18) return 129.99;
    if (inches >= 16) return 109.99;
    if (inches >= 14) return 99.99;
    if (inches >= 12) return 79.99;
    if (inches >= 10) return 59.99;
    if (inches >= 8) return 49.99;
    return 39.99;
  }

  // ── Glass rigs/recyclers ──
  if (t.includes('recycler') || t.includes('rig') || t.includes('fab')) {
    if (t.includes('encore') || t.includes('monark')) {
      // Premium brand rigs
      if (inches >= 9) return 149.99;
      if (inches >= 7) return 119.99;
      return 89.99;
    }
    if (t.includes('black sheep')) return 119.99;
    if (t.includes('sketch & burn') || t.includes('sketch &')) return 109.99;
    if (t.includes('linda biggs')) return 99.99;
    if (inches >= 9) return 129.99;
    if (inches >= 7) return 99.99;
    if (inches >= 6) return 79.99;
    return 69.99;
  }

  // ── Glass bubblers ──
  if (t.includes('bubbler') || t.includes('hammer bubbler')) {
    if (t.includes('made in usa') || t.includes('oregon made')) {
      if (inches >= 9) return 109.99;
      if (inches >= 7) return 89.99;
      return 69.99;
    }
    if (inches >= 9) return 79.99;
    if (inches >= 7) return 59.99;
    if (inches >= 6) return 44.99;
    return 39.99;
  }

  // ── Hand pipes ──
  if (t.includes('hand pipe') || t.includes('pipe') || t.includes('sherlock') || t.includes('steamroller')) {
    if (t.includes('peaselburg') || t.includes('mille')) {
      // Peaselburg worked glass - artisan premium
      return wcPrice <= 20 ? 49.99 : 59.99;
    }
    if (t.includes('made in usa') || t.includes('element') || t.includes('phil cobalt')) {
      // USA-made pipes command premium
      if (wcPrice <= 10) return 29.99;
      if (wcPrice <= 15) return 34.99;
      if (wcPrice <= 25) return 49.99;
      return 59.99;
    }
    if (t.includes('sculpted') || t.includes('capybara') || t.includes('popsicle')) {
      // Novelty/sculpted glass
      if (wcPrice <= 10) return 24.99;
      if (wcPrice <= 15) return 34.99;
      return 44.99;
    }
    // Standard glass pipes
    if (wcPrice <= 5) return 14.99;
    if (wcPrice <= 7.50) return 19.99;
    if (wcPrice <= 10) return 24.99;
    if (wcPrice <= 15) return 34.99;
    if (wcPrice <= 20) return 44.99;
    return 49.99;
  }

  // ── Chillums ──
  if (t.includes('chillum') || t.includes('pendant')) {
    if (t.includes('peaselburg') || t.includes('rick & morty') || t.includes('made in usa')) {
      if (wcPrice <= 10) return 24.99;
      return 34.99;
    }
    // OG Chillum at $60 wholesale is likely the display/bulk pack
    if (wcPrice >= 50) return 149.99;
    if (wcPrice <= 3) return 9.99;
    if (wcPrice <= 5) return 14.99;
    return 19.99;
  }

  // ── Grinders ──
  if (t.includes('grinder')) {
    if (t.includes('xl') || inches >= 4) return 44.99;  // 4" XL retail $24.99-$44.99
    if (wcPrice <= 5) return 14.99;
    if (wcPrice <= 10) return 24.99;
    return 34.99;
  }

  // ── Dab tools ──
  if (t.includes('dab tool') || t.includes('dabber')) {
    if (t.includes('epoxy') || t.includes('sword')) return 34.99;
    if (wcPrice <= 10) return 19.99;
    if (wcPrice <= 25) return 39.99;
    return 59.99;
  }

  // ── Carb caps ──
  if (t.includes('carb cap')) {
    if (wcPrice <= 3) return 9.99;
    if (wcPrice <= 7) return 14.99;
    if (wcPrice <= 12) return 24.99;
    return 29.99;
  }

  // ── Pendants ──
  if (t.includes('pendant') || t.includes('spiral pendant')) {
    if (wcPrice <= 15) return 29.99;
    if (wcPrice <= 30) return 59.99;
    return 79.99;
  }

  // ── Vape/battery ──
  if (t.includes('battery') || t.includes('vaporizer') || t.includes('vape') || t.includes('510')) {
    if (wcPrice <= 15) return 29.99;
    if (wcPrice <= 25) return 44.99;
    if (wcPrice <= 40) return 59.99;
    return 79.99;
  }

  // ── Aleaf torches ──
  if (t.includes('torch') || t.includes('blow torch')) {
    if (wcPrice <= 15) return 34.99;
    if (wcPrice <= 25) return 44.99;
    return 59.99;
  }

  // ── Glass jars ──
  if (t.includes('glass jar') || t.includes('oz glass jar')) {
    if (wcPrice <= 20) return 29.99;
    if (wcPrice <= 48) return 89.99;
    return 119.99;
  }

  // ── Bangers / quartz ──
  if (t.includes('banger') || t.includes('slurper')) {
    if (wcPrice <= 10) return 24.99;
    if (wcPrice <= 15) return 34.99;
    if (wcPrice <= 25) return 59.99;
    return 79.99;
  }

  // ── Ash catchers ──
  if (t.includes('ash catcher')) {
    if (wcPrice <= 15) return 39.99;
    if (wcPrice <= 20) return 49.99;
    return 59.99;
  }

  // ── Nectar collector ──
  if (t.includes('nectar')) {
    if (wcPrice <= 15) return 29.99;
    if (wcPrice <= 25) return 44.99;
    return 59.99;
  }

  // ── Generic fallback: 2.5× wholesale with psychological pricing ──
  const minRetail = wcPrice * 2.5;
  if (minRetail < 10) return Math.ceil(minRetail) - 0.01;
  if (minRetail < 50) return Math.ceil(minRetail / 5) * 5 - 0.01;
  if (minRetail < 100) return Math.ceil(minRetail / 10) * 10 - 0.05;
  return Math.ceil(minRetail / 10) * 10;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  COMPREHENSIVE UNDERPRICED FIX  ${EXECUTE ? '🔴 LIVE' : '🟡 DRY RUN'}`);
  console.log(`${'═'.repeat(70)}\n`);

  // 1. Fetch WC prices
  console.log('Step 1: Fetching WC prices...');
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

  // 3. Find all underpriced products
  console.log('Step 3: Scanning for underpriced products...');
  const fixes = [];

  for (const sp of shopifyProducts) {
    // Only fix active products
    if (sp.status !== 'active') continue;

    // Skip excluded categories
    if (isCustom(sp.title)) continue;
    if (isArtGlass(sp.title)) continue;
    if (isBulkItem(sp.title)) continue;
    if (isRollingPaper(sp.title)) continue;

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
      const ratio = wcPrice > 0 ? vp / wcPrice : 999;

      // Only fix if below 2.5x wholesale (standard smoke shop markup)
      // or if $0 priced
      if (vp === 0 || ratio < 2.5) {
        const target = getResearchedPrice(sp.title, wcPrice);
        if (target === null) continue;

        // Skip if already priced at or above target
        if (vp >= target - 1) continue;

        // Skip tiny changes (less than $5 difference)
        if (Math.abs(target - vp) < 5) continue;

        fixes.push({
          productId: sp.id,
          title: sp.title,
          variantId: v.id,
          variantTitle: v.title || 'Default',
          currentPrice: vp,
          wcPrice,
          targetPrice: target,
          ratio: ratio.toFixed(2),
          status: sp.status,
        });
      }
    }
  }

  // Deduplicate products for summary
  const productSet = new Set(fixes.map(f => f.productId));
  console.log(`  Found ${fixes.length} variants across ${productSet.size} products needing price fixes\n`);

  // 4. Apply
  console.log(`Step 4: ${EXECUTE ? 'Applying' : 'Previewing'} fixes...\n`);

  let updated = 0, failed = 0;
  let currentProduct = '';

  // Sort by product title for readable output
  fixes.sort((a, b) => a.title.localeCompare(b.title));

  for (const fix of fixes) {
    if (fix.title !== currentProduct) {
      currentProduct = fix.title;
      const short = fix.title.length > 60 ? fix.title.slice(0, 57) + '...' : fix.title;
      console.log(`\n${short}`);
      console.log(`  WC: $${fix.wcPrice.toFixed(2)} | Current ratio: ${fix.ratio}x`);
    }

    console.log(`  ${fix.variantTitle.slice(0,25).padEnd(25)} $${fix.currentPrice.toFixed(2).padStart(8)} → $${fix.targetPrice.toFixed(2).padStart(8)}`);

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
