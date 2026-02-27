#!/usr/bin/env node
/**
 * fix-all-prices-researched.js
 *
 * Corrects ALL variants on products where ANY variant is priced at or near
 * the WyndDistribution wholesale cost.  Prices are set using competitor-
 * researched retail values rather than a blanket formula.
 *
 * Usage:
 *   node src/fix-all-prices-researched.js              # dry run
 *   node src/fix-all-prices-researched.js --execute     # live
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

// ── Competitor-researched retail pricing ─────────────────────────────────
//
// Prices below were determined by searching actual online smoke shops,
// Amazon, manufacturer MSRP, and retail aggregators (Feb 2026).
//
// Glass beakers/bongs — most brick-and-mortar smoke shops price 10" basic
// beakers at $39–$59, 12" at $59–$89, 14"+ at $89–$150, premium 16"+ 7mm
// thick at $90–$150.  eBay budget tier is $15–$30 but those are low-quality.
//
// Flower bowls — basic 14mm bowls $8–$15, color/horn $12–$20, sculpted/
// heady bowls $25–$50+, artist bowls $80–$200+.
//
// Rolling papers/cones display boxes — priced per display, not per individual
// pack.  RAW 24-pack displays ~$35–$45 retail, Zig Zag 24-packs ~$40–$65.
//
// Sources: SMOKEA, Smoke Cartel, KING's Pipe, Phoenix Star Glass,
// DankGeek, Grasscity, Element Vape, Midwest Goods, MJ Wholesale,
// 420 Science, American Rolling Club, StonedGenie, Blazy Susan official.
// ────────────────────────────────────────────────────────────────────────

function getResearchedPrice(title, wcPrice) {
  // Normalize all quote types for consistent matching
  const t = title.toLowerCase()
    .replace(/[\u2033\u201d\u201c\u201e\u201f]/g, '"')
    .replace(/[\u2032\u2019\u2018\u201a\u201b]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00bc/g, '1/4').replace(/\u00bd/g, '1/2').replace(/\u00be/g, '3/4');

  // ── Lookah Ant 710 Battery — MSRP $70, typical retail $37–$45 ──
  if (t.includes('lookah ant')) return 44.99;

  // ── Robotjamin / Smyle Labs cart battery — limited edition, typical MSRP $60–$80 ──
  if (t.includes('robotjamin') || t.includes('smyle labs')) return 69.99;

  // ── Sesh Sceptor Dab Tool — mid-tier accessory ──
  if (t.includes('sesh sceptor') || t.includes('sesh scepter')) return 39.99;

  // ── Bowman Mechbird Sculpture — one-of-a-kind art piece ──
  // $3000 wholesale is likely the artist's gallery price; keep near that
  if (t.includes('bowman') && t.includes('mechbird')) return 3499.99;

  // ── Rolling paper / cone DISPLAY BOXES ──
  // These are wholesale case quantities sold as display boxes to shops
  if (t.includes('blazy susan pink cones')) return 9.99;     // single 20ct tube, MSRP $9.99
  if (t.includes('blazy susan purize'))     return 14.99;    // 10ct filter box
  if (t.includes('blazy susan') && t.includes('pre rolled')) return 9.99;
  if (t.includes('raw black classic rolls') && t.includes('12bx')) return 39.99;
  if (t.includes('raw classic') && t.includes('connoisseur')) return 49.99;  // 24-pack display
  if (t.includes('raw classic') && t.includes('rolling papers')) return 39.99;  // 24-pack display
  if (t.includes('raw organic') && t.includes('32bx'))       return 59.99;
  if (t.includes('raw') && t.includes('king size'))           return 44.99;
  if (t.includes('ocb premium slim'))                         return 56.99;  // 24-pack display
  if (t.includes('ocb') && t.includes('organic') && t.includes('hemp')) return 56.99;
  if (t.includes('ocb') && t.includes('papers'))              return 56.99;
  if (t.includes('zig zag') && t.includes('french orange'))   return 54.99;  // 24-pack display
  if (t.includes('zig zag') && t.includes('unbleached cones carton')) return 44.99;
  if (t.includes('zig zag') && t.includes('paper cones king')) return 5.99;  // single cone pack
  if (t.includes('zig zag') && t.includes('tips') && t.includes('50 pack')) return 29.99;
  if (t.includes('zig zag') && t.includes('promo display'))  return 99.99;
  if (t.includes('zig zag') && t.includes('original white')) return 99.99;

  // ── Glass Beaker Bongs / Water Pipes ──
  // Size-based pricing from competitor research
  if (isBeakerOrBong(t)) {
    const inches = extractInches(t);
    const is7mm = t.includes('7mm') || t.includes('7 mm');
    const is9mm = t.includes('9mm');
    const isThick = is7mm || is9mm;
    const isEncore = t.includes('encore');
    const isDecal = t.includes('decal');
    const hasPerc = t.includes('matrix') || t.includes('perc') || t.includes('showerhead') || t.includes('inline');

    if (inches >= 25) return 199.99;
    if (inches >= 18) {
      if (isThick) return 129.99;
      return 119.99;
    }
    if (inches >= 17) return hasPerc ? 149.99 : 129.99;
    if (inches >= 16) {
      if (isThick) return 109.99;
      if (t.includes('nicky davis') || t.includes('ghost gang')) return 129.99;
      return 99.99;
    }
    if (inches >= 15) {
      if (hasPerc) return 119.99;
      if (isEncore) return 129.99;
      return 109.99;
    }
    if (inches >= 13) {
      if (isThick) return 89.99;
      if (hasPerc) return 99.99;
      return 79.99;
    }
    if (inches >= 12) {
      if (isThick) return 79.99;
      if (t.includes('decal') || t.includes('showerhead')) return 79.99;
      return 69.99;
    }
    if (inches >= 11) return hasPerc ? 89.99 : 79.99;
    if (inches >= 10) {
      if (isEncore) return 69.99;
      if (t.includes('sculpted') || t.includes('piggy')) return 69.99;
      if (t.includes('west coast') || t.includes('fume')) return 69.99;
      if (isDecal || t.includes('encalmo') || t.includes('fruit') || t.includes('labubu') || t.includes('trippy') || t.includes('donut')) return 49.99;
      if (t.includes('iridescent') || t.includes('color top')) return 54.99;
      if (t.includes('watercolor')) return 69.99;
      if (t.includes('glitter')) return 54.99;
      if (t.includes('heart tree')) return 54.99;
      return 49.99;
    }
    // Smaller pieces
    if (inches >= 6) return 49.99;
    return 39.99;
  }

  // ── 14mm / 18mm Flower Bowls ──
  if (isBowl(t)) {
    if (t.includes('18mm') && (t.includes('u&m') || t.includes('made in usa'))) {
      // USA-made 18mm artisan bowls
      if (t.includes('fume')) return 24.99;
      return 22.99;
    }
    if (t.includes('sketch') || t.includes('burn'))       return 29.99;
    if (t.includes('sculpted') || t.includes('cat') || t.includes('grenade')) return 29.99;
    if (t.includes('pretty patties') || t.includes('rainbow stripe') || t.includes('candy')) return 24.99;
    if (t.includes('sandblasted'))                         return 24.99;
    if (t.includes('heavy hitter'))                        return 14.99;
    if (t.includes('color') && (t.includes('horn') || t.includes('lip'))) return 14.99;
    if (t.includes('thick oval'))                          return 14.99;
    if (t.includes('clear horn'))                          return 12.99;
    return 14.99;
  }

  // ── Grinders ──
  if (t.includes('grinder')) {
    if (t.includes('hemp leaf') || t.includes('zinc'))     return 12.99;
    if (t.includes('boobies') || t.includes('mushroom'))   return 24.99;
    return 19.99;
  }

  // ── Cookies branded items ──
  if (t.includes('cookies bite bubbler'))                  return 79.99;

  // ── Fallback: use formula ──
  return formulaPrice(wcPrice);
}

// ── Helper functions ────────────────────────────────────────────────────

function isBeakerOrBong(t) {
  return t.includes('beaker') || t.includes('bong') || t.includes('straight')
    || t.includes('bubbler') || t.includes('water pipe') || t.includes('matrix')
    || t.includes('perc') || t.includes('cone perc') || t.includes('inline')
    || t.includes('capsule') || t.includes('shotgun');
}

function isBowl(t) {
  return (t.includes('bowl') || t.includes('flower bowl')) && !t.includes('beaker');
}

function extractInches(t) {
  // Normalize all quote types first, then match
  const norm = t
    .replace(/[\u2033\u201d\u201c\u201e\u201f]/g, '"')   // smart/curly → ASCII "
    .replace(/[\u2032\u2019\u2018\u201a\u201b]/g, "'");   // smart/curly → ASCII '
  const m = norm.match(/(\d+(?:\.\d+)?)\s*(?:"|''+|inch|in\b)/i);
  return m ? parseFloat(m[1]) : 0;
}

function formulaPrice(wcPrice) {
  // Fallback formula: WYN → 2× cost → formula retail
  const price = parseFloat(wcPrice) || 0;
  if (price <= 0) return 0;
  const TIERS = [[0.5,4,2.5],[4.01,20,2],[20.01,40,1.8],[40.01,100,1.6],[100.01,200,1.5],[200.01,Infinity,1.4]];
  let cost = price * 1.4;
  for (const [mn,mx,m] of TIERS) { if (price >= mn && price <= mx) { cost = price * m; break; } }
  let retail;
  if (cost<=5) retail=cost*3; else if (cost<=15) retail=cost*2.5;
  else if (cost<=40) retail=cost*2; else if (cost<=100) retail=cost*1.8;
  else retail=cost*1.6;
  if (retail<10) retail=Math.ceil(retail)-0.01;
  else if (retail<50) retail=Math.ceil(retail/5)*5-0.01;
  else if (retail<100) retail=Math.ceil(retail/10)*10-0.05;
  else retail=Math.ceil(retail/10)*10;
  return Math.round(retail*100)/100;
}

// ── HTTP helpers (curl-based) ──────────────────────────────────────────

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
        for (const part of line.split(',')) {
          if (part.includes('rel="next"')) {
            nextUrl = part.split('<')[1].split('>')[0];
          }
        }
      }
    }
    return { data: JSON.parse(body), nextUrl };
  } catch { return { data: null, nextUrl: null }; }
  finally {
    try { unlinkSync(hdrFile); } catch {}
    try { unlinkSync(bodyFile); } catch {}
  }
}

const shopifyHeaders = `"X-Shopify-Access-Token: ${TOKEN}" "Content-Type: application/json"`;

function curlPut(url, body) {
  const f = `/tmp/put_${Date.now()}_${Math.random().toString(36).slice(2)}.json`;
  writeFileSync(f, JSON.stringify(body));
  try {
    const hdrFlags = shopifyHeaders.split('" "').map(h => `-H "${h.replace(/^"|"$/g, '')}"`).join(' ');
    const out = execSync(`curl -s -X PUT ${hdrFlags} -d @"${f}" "${url}"`, { encoding: 'utf8' });
    return JSON.parse(out);
  } catch { return null; }
  finally { try { unlinkSync(f); } catch {} }
}

function normalize(s) {
  return s.toLowerCase()
    .replace(/[\u2033\u201d\u201c]/g, '"')
    .replace(/[\u2032\u2019\u2018]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00a0|\u200b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  FIX ALL VARIANT PRICES (Competitor-Researched)`);
  console.log(`  ${EXECUTE ? '🔴 LIVE MODE' : '🟡 DRY RUN'}`);
  console.log(`${'═'.repeat(70)}\n`);

  // 1. Fetch WC wholesale prices
  console.log('Step 1: Fetching WyndDistribution wholesale prices...');
  const wcPrices = {};
  let page = 1;
  while (true) {
    const { data } = curlGet(`${WC_BASE}/wp-json/wc/v3/products?per_page=100&page=${page}`, null);
    if (!data || !Array.isArray(data) || data.length === 0) break;
    for (const p of data) {
      const price = parseFloat(p.price || p.regular_price || '0');
      if (price > 0) wcPrices[normalize(p.name)] = price;
    }
    if (data.length < 100) break;
    page++;
    await sleep(300);
  }
  console.log(`  ${Object.keys(wcPrices).length} WC products\n`);

  // 2. Fetch ALL Shopify WYN products (with full variant data)
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

  // 3. Find products where ANY variant is at/near wholesale
  console.log('Step 3: Identifying products with wholesale-priced variants...');
  const toFix = [];

  for (const sp of shopifyProducts) {
    const spNorm = normalize(sp.title);

    // Find WC match
    let wcPrice = null;
    if (wcPrices[spNorm] !== undefined) {
      wcPrice = wcPrices[spNorm];
    } else {
      for (const [wcName, price] of Object.entries(wcPrices)) {
        if (spNorm.includes(wcName) || wcName.includes(spNorm)) {
          wcPrice = price;
          break;
        }
      }
    }
    if (wcPrice === null || wcPrice <= 0) continue;

    // Check if ANY variant is at/near wholesale price
    const badVariants = sp.variants.filter(v => {
      const vPrice = parseFloat(v.price);
      if (vPrice <= 0) return false;
      const ratio = vPrice / wcPrice;
      return ratio >= 0.9 && ratio <= 1.1;  // within 10% of wholesale
    });

    if (badVariants.length > 0) {
      const researchedPrice = getResearchedPrice(sp.title, wcPrice);
      toFix.push({
        id: sp.id,
        title: sp.title,
        status: sp.status,
        wcPrice,
        researchedPrice,
        variants: sp.variants,
        badVariantCount: badVariants.length,
        totalVariantCount: sp.variants.length,
      });
    }
  }

  console.log(`  Found ${toFix.length} products with ${toFix.reduce((s,p) => s + p.badVariantCount, 0)} wholesale-priced variants\n`);

  // 4. Apply fixes
  console.log(`Step 4: ${EXECUTE ? 'Applying' : 'Previewing'} competitor-researched prices...\n`);

  let totalUpdated = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const product of toFix) {
    const shortTitle = product.title.length > 50 ? product.title.slice(0, 47) + '...' : product.title;
    console.log(`\n${shortTitle}`);
    console.log(`  WC wholesale: $${product.wcPrice.toFixed(2)} → Researched retail: $${product.researchedPrice.toFixed(2)}`);
    console.log(`  Variants: ${product.totalVariantCount} total, ${product.badVariantCount} at wholesale`);

    for (const variant of product.variants) {
      const vPrice = parseFloat(variant.price);
      const target = product.researchedPrice;
      const ratio = product.wcPrice > 0 ? vPrice / product.wcPrice : 999;
      const isAtWholesale = ratio >= 0.9 && ratio <= 1.1;
      const isOverPricedByFormula = vPrice > target * 2.5;  // formula set it way too high

      if (!isAtWholesale && !isOverPricedByFormula) {
        console.log(`    Variant ${variant.id}: $${vPrice.toFixed(2)} ✓ (ok)`);
        totalSkipped++;
        continue;
      }

      const reason = isAtWholesale ? 'wholesale' : 'over-priced';
      console.log(`    Variant ${variant.id}: $${vPrice.toFixed(2)} → $${target.toFixed(2)} (${reason})`);

      if (EXECUTE) {
        const result = curlPut(
          `${BASE_URL}/variants/${variant.id}.json`,
          { variant: { id: variant.id, price: target.toFixed(2) } }
        );

        if (result?.variant) {
          totalUpdated++;
          console.log(`      \x1b[32m✔ Updated\x1b[0m`);
        } else {
          totalFailed++;
          console.log(`      \x1b[31m✘ Failed\x1b[0m`);
        }
        await sleep(350);
      }
    }
  }

  // Summary
  console.log(`\n${'═'.repeat(70)}`);
  if (EXECUTE) {
    console.log(`  DONE`);
    console.log(`    Variants updated:  ${totalUpdated}`);
    console.log(`    Variants failed:   ${totalFailed}`);
    console.log(`    Variants skipped:  ${totalSkipped} (already correct)`);
    console.log(`    Products touched:  ${toFix.length}`);
  } else {
    console.log(`  DRY RUN COMPLETE`);
    const totalBad = toFix.reduce((s,p) => s + p.badVariantCount, 0);
    console.log(`    Products to fix:    ${toFix.length}`);
    console.log(`    Variants to update: ${totalBad}`);
    console.log(`    Run with --execute to apply changes`);
  }
  console.log(`${'═'.repeat(70)}\n`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
