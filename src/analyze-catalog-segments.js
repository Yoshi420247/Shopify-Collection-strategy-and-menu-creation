#!/usr/bin/env node
// Quick product catalog analysis for segmentation strategy
import dotenv from 'dotenv';
import { execSync } from 'child_process';
dotenv.config();

const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const STORE = process.env.SHOPIFY_STORE || 'oil-slick-pad.myshopify.com';
const API = `https://${STORE}/admin/api/2024-01`;

function api(endpoint) {
  const r = execSync(
    `curl -s '${API}${endpoint}' -H 'X-Shopify-Access-Token: ${TOKEN}'`,
    { encoding: 'utf-8', timeout: 30000 }
  );
  return JSON.parse(r);
}

async function main() {
  console.log('Fetching full product catalog...\n');

  const allProducts = [];
  let sinceId = 0;
  for (let page = 0; page < 20; page++) {
    const d = api(`/products.json?limit=250&since_id=${sinceId}&fields=id,title,vendor,product_type,tags,variants,status`);
    const products = d.products || [];
    if (products.length === 0) break;
    allProducts.push(...products);
    sinceId = products[products.length - 1].id;
    process.stdout.write(`  Page ${page + 1}: ${products.length} products (total: ${allProducts.length})\n`);
  }

  // Analyze by vendor
  const vendors = {};
  const types = {};
  const segments = { smokeshop: [], oilSlick: [], uncategorized: [] };

  for (const p of allProducts) {
    const vendor = p.vendor || 'Unknown';
    const type = p.product_type || 'Unknown';
    const price = parseFloat(p.variants?.[0]?.price || '0');
    const tags = (p.tags || '').toLowerCase();
    const title = p.title || '';

    vendors[vendor] = (vendors[vendor] || 0) + 1;
    types[type] = (types[type] || 0) + 1;

    const item = { id: p.id, title, vendor, type, price, tags, variantCount: p.variants?.length || 0 };

    // Segment classification
    const vLow = vendor.toLowerCase();
    if (vLow === 'oil slick' || vLow.includes('oil slick')) {
      segments.oilSlick.push(item);
    } else if (
      vLow === 'what you need' || vLow.includes('yhs') || vLow.includes('cloud') ||
      vLow === 'all in smokeshop' || vLow.includes('arsenal') ||
      vLow.includes('aleaf') || vLow.includes('lookah') || vLow.includes('pulsar') ||
      tags.includes('smoke') || tags.includes('bong') || tags.includes('pipe') ||
      tags.includes('rig') || tags.includes('vape') || tags.includes('grinder') ||
      tags.includes('rolling') || tags.includes('torch') || tags.includes('dab')
    ) {
      segments.smokeshop.push(item);
    } else {
      segments.uncategorized.push(item);
    }
  }

  console.log('\n════════════════════════════════════════════════════');
  console.log('  PRODUCT CATALOG ANALYSIS');
  console.log('════════════════════════════════════════════════════\n');

  console.log(`Total products: ${allProducts.length}\n`);

  console.log('── BY VENDOR ───────────────────────────────────────');
  Object.entries(vendors).sort((a, b) => b[1] - a[1]).forEach(([v, c]) => {
    console.log(`  ${v}: ${c} products`);
  });

  console.log('\n── BY PRODUCT TYPE ─────────────────────────────────');
  Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([t, c]) => {
    console.log(`  ${t}: ${c}`);
  });

  console.log('\n── SEGMENTS ────────────────────────────────────────');
  for (const [seg, items] of Object.entries(segments)) {
    const prices = items.map(i => i.price).filter(p => p > 0);
    const avg = prices.length > 0 ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : '0';
    const min = prices.length > 0 ? Math.min(...prices).toFixed(2) : '0';
    const max = prices.length > 0 ? Math.max(...prices).toFixed(2) : '0';
    console.log(`\n  ${seg.toUpperCase()} (${items.length} products)`);
    console.log(`    Price range: $${min} - $${max} | Avg: $${avg}`);
    const segVendors = {};
    items.forEach(i => { segVendors[i.vendor] = (segVendors[i.vendor] || 0) + 1; });
    Object.entries(segVendors).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([v, c]) => {
      console.log(`    Vendor: ${v} (${c})`);
    });
    // Sample products
    console.log('    Sample products:');
    items.slice(0, 8).forEach(i => {
      console.log(`      $${i.price} | ${i.title}`);
    });
  }

  // Abandoned checkout analysis
  console.log('\n\n════════════════════════════════════════════════════');
  console.log('  ABANDONED CHECKOUT SEGMENTATION');
  console.log('════════════════════════════════════════════════════\n');

  const checkouts = [];
  let cSinceId = 0;
  for (let p = 0; p < 10; p++) {
    const d = api(`/checkouts.json?limit=50&since_id=${cSinceId}`);
    const cs = d.checkouts || [];
    if (cs.length === 0) break;
    checkouts.push(...cs);
    cSinceId = cs[cs.length - 1].id;
  }

  const cartSegments = { smokeshop: [], oilSlick: [], mixed: [], unknown: [] };

  for (const c of checkouts) {
    const email = c.email || '';
    if (email.includes('papersora')) continue; // skip bots

    const items = c.line_items || [];
    const total = parseFloat(c.total_price || '0');
    let hasSmoke = false, hasOil = false;

    for (const li of items) {
      const v = (li.vendor || '').toLowerCase();
      const t = (li.title || '').toLowerCase();
      if (v.includes('oil slick')) hasOil = true;
      else if (v === 'what you need' || v.includes('yhs') || v.includes('cloud') ||
               t.includes('bong') || t.includes('pipe') || t.includes('rig') ||
               t.includes('torch') || t.includes('grinder') || t.includes('dab tool')) {
        hasSmoke = true;
      }
    }

    const seg = hasSmoke && hasOil ? 'mixed' :
                hasSmoke ? 'smokeshop' :
                hasOil ? 'oilSlick' : 'unknown';

    const hrs = (Date.now() - new Date(c.created_at).getTime()) / 3600000;
    cartSegments[seg].push({ email, total, hrs: hrs.toFixed(1), items: items.map(i => i.title).join(', ') });
  }

  for (const [seg, carts] of Object.entries(cartSegments)) {
    if (carts.length === 0) continue;
    const totalVal = carts.reduce((s, c) => s + c.total, 0);
    console.log(`  ${seg.toUpperCase()} CARTS: ${carts.length} | Total value: $${totalVal.toFixed(2)} | Avg: $${(totalVal / carts.length).toFixed(2)}`);
    carts.slice(0, 5).forEach(c => {
      console.log(`    ${c.email} | $${c.total} | ${c.hrs}hrs | ${c.items.substring(0, 60)}`);
    });
    console.log('');
  }
}

main().catch(console.error);
