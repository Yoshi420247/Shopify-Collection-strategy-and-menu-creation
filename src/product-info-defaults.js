#!/usr/bin/env node
// =============================================================================
// Product Info Defaults — "What's Included" messaging for Bongs & Dab Rigs
// =============================================================================
// Curl-based runner for maximum reliability.
//
// Three operations:
//   1. Update collection descriptions with callout banners
//   2. Bulk-tag products with includes:flower-bowl / includes:quartz-banger
//   3. Add "What's In The Box" section to product descriptions
//
// Usage:
//   node src/product-info-defaults.js              # Dry run (preview changes)
//   node src/product-info-defaults.js --execute    # Apply changes to Shopify
// =============================================================================

import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { config } from './config.js';

const DRY_RUN = !process.argv.includes('--execute');
const STORE = config.shopify.storeUrl;
const TOKEN = config.shopify.accessToken;
const API_VERSION = config.shopify.apiVersion;
const BASE = `https://${STORE}/admin/api/${API_VERSION}`;

// ─── Curl-based HTTP transport ──────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function curlGet(path) {
  const url = `${BASE}/${path}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const out = execSync(
        `curl -s --retry 2 --retry-delay 2 --max-time 30 "${url}" -H "X-Shopify-Access-Token: ${TOKEN}" -H "Content-Type: application/json"`,
        { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
      );
      return JSON.parse(out);
    } catch (err) {
      if (attempt < 4) {
        const wait = Math.pow(2, attempt);
        console.log(`  Retry ${attempt}/4 GET ${path} (waiting ${wait}s)...`);
        execSync(`sleep ${wait}`);
      } else throw err;
    }
  }
}

function curlPut(path, body) {
  const url = `${BASE}/${path}`;
  // Write body to temp file to avoid shell escaping issues and E2BIG
  const tmpFile = `/tmp/shopify_put_${Date.now()}.json`;
  writeFileSync(tmpFile, JSON.stringify(body));
  try {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const out = execSync(
          `curl -s --retry 2 --retry-delay 2 --max-time 30 -X PUT "${url}" -H "X-Shopify-Access-Token: ${TOKEN}" -H "Content-Type: application/json" -d @${tmpFile}`,
          { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
        );
        const parsed = JSON.parse(out);
        if (parsed.errors) {
          throw new Error(`API error: ${JSON.stringify(parsed.errors).substring(0, 300)}`);
        }
        return parsed;
      } catch (err) {
        if (attempt < 4) {
          const wait = Math.pow(2, attempt);
          console.log(`  Retry ${attempt}/4 PUT ${path} (waiting ${wait}s)...`);
          execSync(`sleep ${wait}`);
        } else throw err;
      }
    }
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

// Rate limit: ~2 req/sec
let lastReq = 0;
function rateLimitedGet(path) {
  const now = Date.now();
  if (now - lastReq < 500) {
    execSync(`sleep 0.5`);
  }
  lastReq = Date.now();
  return curlGet(path);
}

function rateLimitedPut(path, body) {
  const now = Date.now();
  if (now - lastReq < 500) {
    execSync(`sleep 0.5`);
  }
  lastReq = Date.now();
  return curlPut(path, body);
}

// ─── Fetch all products from a collection (paginated) ───────────────────────

function getCollectionProducts(collectionId) {
  const products = [];
  let sinceId = 0;
  let hasMore = true;

  while (hasMore) {
    const params = sinceId > 0
      ? `limit=250&since_id=${sinceId}`
      : 'limit=250';
    const data = rateLimitedGet(`collections/${collectionId}/products.json?${params}`);
    const batch = data.products || [];
    products.push(...batch);
    if (batch.length < 250) {
      hasMore = false;
    } else {
      sinceId = batch[batch.length - 1].id;
    }
  }
  return products;
}

// =============================================================================
// COLLECTION IDS
// =============================================================================
const BONGS_COLLECTION_ID = 511492391192;
const DAB_RIGS_COLLECTION_ID = 509575921944;

// =============================================================================
// OPTION 1: Collection Description Callout Banners
// =============================================================================

const BONG_CALLOUT = `<div style="background:linear-gradient(135deg,#0d1117 0%,#161b22 100%);border:1px solid #03a196;border-left:5px solid #03a196;padding:18px 22px;margin:0 0 24px 0;border-radius:6px;display:flex;align-items:center;gap:12px;">
<span style="font-size:28px;line-height:1;">🎁</span>
<div>
<strong style="color:#03a196;font-size:16px;display:block;margin-bottom:4px;">Every Bong Ships With a Glass Flower Bowl Included</strong>
<span style="color:#b0b8c4;font-size:14px;">All bongs in this collection come ready to smoke right out of the box — no extra accessories needed to get started.</span>
</div>
</div>`;

const DAB_RIG_CALLOUT = `<div style="background:linear-gradient(135deg,#0d1117 0%,#161b22 100%);border:1px solid #03a196;border-left:5px solid #03a196;padding:18px 22px;margin:0 0 24px 0;border-radius:6px;display:flex;align-items:center;gap:12px;">
<span style="font-size:28px;line-height:1;">🎁</span>
<div>
<strong style="color:#03a196;font-size:16px;display:block;margin-bottom:4px;">Every Dab Rig Ships With a Quartz Banger Included</strong>
<span style="color:#b0b8c4;font-size:14px;">All dab rigs in this collection come ready to dab right out of the box — just add your concentrate and a torch.</span>
</div>
</div>`;

function updateCollectionDescriptions() {
  console.log('\n' + '='.repeat(70));
  console.log('OPTION 1: Collection Description Callout Banners');
  console.log('='.repeat(70));

  const collections = [
    { id: BONGS_COLLECTION_ID, callout: BONG_CALLOUT, label: 'Bongs & Water Pipes' },
    { id: DAB_RIGS_COLLECTION_ID, callout: DAB_RIG_CALLOUT, label: 'Dab Rigs' },
  ];

  for (const coll of collections) {
    const data = rateLimitedGet(`smart_collections/${coll.id}.json`);
    const current = data.smart_collection.body_html || '';

    if (current.includes('Every Bong Ships With') || current.includes('Every Dab Rig Ships With')) {
      console.log(`  ✓ ${coll.label}: Callout already present — skipping`);
      continue;
    }

    const updated = coll.callout + '\n' + current;

    console.log(`  → ${coll.label}: Adding callout banner to top of collection description`);
    console.log(`    Current length: ${current.length} chars → Updated: ${updated.length} chars`);

    if (!DRY_RUN) {
      rateLimitedPut(`smart_collections/${coll.id}.json`, {
        smart_collection: { id: coll.id, body_html: updated }
      });
      console.log(`  ✅ ${coll.label}: Collection description updated!`);
    } else {
      console.log(`  [DRY RUN] Would update ${coll.label} description`);
    }
  }
}

// =============================================================================
// OPTION 3: Bulk-tag products
// =============================================================================

function bulkTagProducts(products, newTag, label) {
  console.log(`\n  --- ${label} ---`);
  let tagged = 0, skipped = 0;

  for (const product of products) {
    const existingTags = product.tags || '';
    if (existingTags.split(', ').map(t => t.trim()).includes(newTag)) {
      skipped++;
      continue;
    }

    const updatedTags = existingTags ? `${existingTags}, ${newTag}` : newTag;

    if (!DRY_RUN) {
      rateLimitedPut(`products/${product.id}.json`, {
        product: { id: product.id, tags: updatedTags }
      });
    }

    tagged++;
    if (tagged % 25 === 0 || tagged === 1) {
      console.log(`    ${DRY_RUN ? '[DRY RUN] Would tag' : '✓ Tagged'} ${tagged}... (${product.title})`);
    }
  }

  console.log(`  ✅ ${label}: ${tagged} products ${DRY_RUN ? 'would be' : ''} tagged with "${newTag}" (${skipped} already had it)`);
  return tagged;
}

function runBulkTagging(bongs, rigs) {
  console.log('\n' + '='.repeat(70));
  console.log('OPTION 3: Bulk-Tag Products With Includes Tags');
  console.log('='.repeat(70));

  const bongTagged = bulkTagProducts(bongs, 'includes:flower-bowl', 'Bongs → includes:flower-bowl');
  const rigTagged = bulkTagProducts(rigs, 'includes:quartz-banger', 'Dab Rigs → includes:quartz-banger');
  return { bongTagged, rigTagged };
}

// =============================================================================
// OPTION 4: Add "What's In The Box" to Product Descriptions
// =============================================================================

function buildWhatsInTheBox(productTitle, type) {
  const safeTitle = productTitle.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  if (type === 'bong') {
    return `\n<h2>What's In The Box</h2>\n<ul>\n<li>1 × ${safeTitle}</li>\n<li>1 × Glass flower bowl (matching joint size)</li>\n</ul>\n<p><em>Ready to smoke right out of the box — no extra accessories needed.</em></p>`;
  } else {
    return `\n<h2>What's In The Box</h2>\n<ul>\n<li>1 × ${safeTitle}</li>\n<li>1 × Quartz banger (matching joint size and angle)</li>\n</ul>\n<p><em>Ready to dab right out of the box — just add your concentrate and a torch.</em></p>`;
  }
}

const SKIP_PRODUCTS = new Set([
  'Reverse Tweezer',
  'Rio Replacement Glass – Teal',
  'Rio Replacement Glass - Teal',
]);

function hasWhatsInTheBox(body) {
  if (!body) return false;
  const lower = body.toLowerCase();
  return lower.includes("what's in the box") ||
         lower.includes("what&#39;s in the box") ||
         lower.includes("what&rsquo;s in the box") ||
         lower.includes("whats in the box") ||
         lower.includes("what's included") ||
         lower.includes("what&#x27;s in the box");
}

function addWhatsInTheBox(products, type, label) {
  console.log(`\n  --- ${label} ---`);
  let updated = 0, skippedExisting = 0, skippedNonDevice = 0;

  for (const product of products) {
    if (SKIP_PRODUCTS.has(product.title)) {
      skippedNonDevice++;
      continue;
    }

    const tl = product.title.toLowerCase();
    if (type === 'rig' && (tl.includes('electric') || tl.includes('lookah') || tl.includes('puffco') || tl.includes('e-rig') || tl.includes('replacement glass'))) {
      skippedNonDevice++;
      console.log(`    ⏭  Skip non-standard: ${product.title}`);
      continue;
    }

    const body = product.body_html || '';

    if (hasWhatsInTheBox(body)) {
      skippedExisting++;
      continue;
    }

    const section = buildWhatsInTheBox(product.title, type === 'rig' ? 'rig' : 'bong');
    const updatedBody = body + section;

    if (!DRY_RUN) {
      rateLimitedPut(`products/${product.id}.json`, {
        product: { id: product.id, body_html: updatedBody }
      });
    }

    updated++;
    if (updated % 25 === 0 || updated === 1) {
      console.log(`    ${DRY_RUN ? '[DRY RUN] Would update' : '✓ Updated'} ${updated}... (${product.title})`);
    }
  }

  console.log(`  ✅ ${label}: ${updated} products ${DRY_RUN ? 'would get' : 'got'} "What's In The Box" (${skippedExisting} already had it, ${skippedNonDevice} non-device skipped)`);
  return updated;
}

function runWhatsInTheBox(bongs, rigs) {
  console.log('\n' + '='.repeat(70));
  console.log("OPTION 4: Add \"What's In The Box\" to Product Descriptions");
  console.log('='.repeat(70));

  const bongUpdated = addWhatsInTheBox(bongs, 'bong', 'Bongs — What\'s In The Box');
  const rigUpdated = addWhatsInTheBox(rigs, 'rig', 'Dab Rigs — What\'s In The Box');
  return { bongUpdated, rigUpdated };
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  Product Info Defaults — "What\'s Included" Messaging                ║');
  console.log('║  Oil Slick Pad · curl-based runner                                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`\nMode: ${DRY_RUN ? '🔍 DRY RUN (preview only)' : '🚀 EXECUTE (live changes)'}`);
  console.log(`Store: ${STORE}`);

  console.log('\nFetching products from collections...');
  const bongs = getCollectionProducts(BONGS_COLLECTION_ID);
  console.log(`  Bongs & Water Pipes: ${bongs.length} products`);

  const rigs = getCollectionProducts(DAB_RIGS_COLLECTION_ID);
  console.log(`  Dab Rigs: ${rigs.length} products`);

  // Run all three operations
  updateCollectionDescriptions();
  const tagResults = runBulkTagging(bongs, rigs);
  const witbResults = runWhatsInTheBox(bongs, rigs);

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Collection callout banners:  2 collections`);
  console.log(`  Tagged includes:flower-bowl:  ${tagResults.bongTagged} bongs`);
  console.log(`  Tagged includes:quartz-banger: ${tagResults.rigTagged} dab rigs`);
  console.log(`  "What's In The Box" added:    ${witbResults.bongUpdated} bongs + ${witbResults.rigUpdated} rigs`);

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — no changes were made to your store.');
    console.log('   Run with --execute to apply:');
    console.log('   node src/product-info-defaults.js --execute');
  } else {
    console.log('\n✅ All changes applied successfully to your live store!');
  }
}

main();
