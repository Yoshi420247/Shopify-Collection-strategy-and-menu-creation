import 'dotenv/config';
import { execSync } from 'child_process';
import fs from 'fs';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = '2024-01';
const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

function curlGet(url) {
  try {
    return JSON.parse(execSync(
      `curl -s --max-time 30 "${url}" -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}"`,
      { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 }
    ));
  } catch { return null; }
}

function curlPut(url, body) {
  const esc = JSON.stringify(body).replace(/'/g, "'\\''");
  try {
    return JSON.parse(execSync(
      `curl -s --max-time 30 -X PUT "${url}" -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" -H "Content-Type: application/json" -d '${esc}'`,
      { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
    ));
  } catch { return null; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('Fetching all Shopify products to enable inventory tracking...\n');
  
  const allProducts = [];
  let url = `${BASE_URL}/products.json?limit=250&fields=id,title,variants,vendor`;
  let page = 0;
  
  while (url) {
    page++;
    const hdrFile = `/tmp/et_hdr_${page}.txt`;
    const bodyFile = `/tmp/et_body_${page}.json`;
    try {
      execSync(`curl -s --max-time 60 -D "${hdrFile}" -o "${bodyFile}" "${url}" -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}"`, 
        { encoding: 'utf8', maxBuffer: 10*1024*1024 });
    } catch { break; }
    
    let data;
    try { data = JSON.parse(fs.readFileSync(bodyFile, 'utf8')); } catch { break; }
    const batch = data.products || [];
    if (batch.length === 0) break;
    allProducts.push(...batch);
    process.stdout.write(`  Page ${page}: ${allProducts.length} total\r`);
    
    let headers = '';
    try { headers = fs.readFileSync(hdrFile, 'utf8'); } catch {}
    const linkMatch = headers.match(/<([^>]+)>;\s*rel="next"/);
    url = linkMatch ? linkMatch[1] : null;
    try { fs.unlinkSync(hdrFile); fs.unlinkSync(bodyFile); } catch {}
  }
  
  console.log(`\nFetched ${allProducts.length} products\n`);
  
  // Find all variants that need tracking enabled
  const wynProducts = allProducts.filter(p => p.vendor === 'What You Need');
  console.log(`"What You Need" products: ${wynProducts.length}`);
  
  const needsTracking = [];
  for (const p of wynProducts) {
    for (const v of (p.variants || [])) {
      if (v.inventory_management !== 'shopify') {
        needsTracking.push({ productTitle: p.title, variantId: v.id, variantTitle: v.title });
      }
    }
  }
  
  console.log(`Variants needing tracking enabled: ${needsTracking.length}\n`);
  
  if (needsTracking.length === 0) {
    console.log('All variants already have tracking enabled!');
    return;
  }
  
  let enabled = 0, failed = 0;
  for (let i = 0; i < needsTracking.length; i++) {
    const v = needsTracking[i];
    const result = curlPut(`${BASE_URL}/variants/${v.variantId}.json`, {
      variant: { id: v.variantId, inventory_management: 'shopify' }
    });
    
    if (result && result.variant) {
      enabled++;
    } else {
      failed++;
      console.log(`  ✘ Failed: "${v.productTitle}" [${v.variantTitle}]`);
    }
    
    if ((i + 1) % 50 === 0 || i === needsTracking.length - 1) {
      console.log(`  Progress: ${i + 1}/${needsTracking.length} (${enabled} enabled, ${failed} failed)`);
    }
    
    await sleep(520);
  }
  
  console.log(`\nDone! Enabled tracking on ${enabled} variants. Failed: ${failed}`);
}

main().catch(e => { console.error(e); process.exit(1); });
