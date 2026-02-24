#!/usr/bin/env node
/**
 * Fix Product Tags
 *
 * Fixes the root cause of empty collections: products tagged with the catch-all
 * `family:extraction-supply` instead of their correct specific family tags.
 *
 * Changes:
 * - 11 silicone pad/mat products: ADD family:silicone-pad, material:silicone
 * - 14 glass jar products: ADD family:glass-jar (+ material:glass where missing)
 * - 1 joint tube product: ADD family:joint-tube, REMOVE family:rolling-paper
 * - 6 nonstick paper products: ADD family:parchment-sheet, material:parchment
 * - 1 syringe: REMOVE family:rolling-paper, ADD family:extraction-supply
 * - 1 carb cap: REMOVE family:rolling-tray (wrong tag)
 */
import 'dotenv/config';
import { execSync } from 'child_process';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const GRAPHQL_URL = `https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`;

const DRY_RUN = !process.argv.includes('--execute');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function gql(query) {
  const body = JSON.stringify({ query });
  const escaped = body.replace(/'/g, "'\\''");
  const cmd = `curl -s --max-time 60 -X POST "${GRAPHQL_URL}" ` +
    `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" ` +
    `-H "Content-Type: application/json" ` +
    `-d '${escaped}'`;
  return JSON.parse(execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }));
}

async function addTags(productId, tags) {
  const tagStr = tags.map(t => `"${t}"`).join(', ');
  const mutation = `mutation { tagsAdd(id: "${productId}", tags: [${tagStr}]) { userErrors { field message } } }`;
  const r = gql(mutation);
  const errors = r.data?.tagsAdd?.userErrors;
  if (errors && errors.length > 0) {
    console.log(`    ❌ Error adding tags: ${JSON.stringify(errors)}`);
    return false;
  }
  return true;
}

async function removeTags(productId, tags) {
  const tagStr = tags.map(t => `"${t}"`).join(', ');
  const mutation = `mutation { tagsRemove(id: "${productId}", tags: [${tagStr}]) { userErrors { field message } } }`;
  const r = gql(mutation);
  const errors = r.data?.tagsRemove?.userErrors;
  if (errors && errors.length > 0) {
    console.log(`    ❌ Error removing tags: ${JSON.stringify(errors)}`);
    return false;
  }
  return true;
}

async function main() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  PRODUCT TAG FIX — ${DRY_RUN ? 'DRY RUN' : 'EXECUTING LIVE'}`);
  console.log(`${'═'.repeat(60)}\n`);

  if (DRY_RUN) {
    console.log('  Add --execute flag to apply changes.\n');
  }

  // Fetch all products from Oil Slick + related vendors
  let allProducts = [];
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const r = gql(`{ products(first: 50, query: "vendor:'Oil Slick' OR vendor:'Hand Made Apparel' OR vendor:'Grassroots California'"${after}) { edges { node { id title tags vendor productType } cursor } pageInfo { hasNextPage } } }`);
    if (!r.data) break;
    allProducts.push(...r.data.products.edges.map(e => e.node));
    if (!r.data.products.pageInfo.hasNextPage) break;
    cursor = r.data.products.edges[r.data.products.edges.length - 1].cursor;
  }

  // Also grab What You Need products with extraction-supply
  const r2 = gql(`{ products(first: 50, query: "vendor:'What You Need' tag:'family:extraction-supply'") { edges { node { id title tags vendor productType } } } }`);
  allProducts.push(...r2.data.products.edges.map(e => e.node));

  console.log(`  Products to audit: ${allProducts.length}\n`);

  let fixCount = 0;
  let errorCount = 0;

  for (const p of allProducts) {
    const title = p.title.toLowerCase();
    const type = (p.productType || '').toLowerCase();
    const has = (tag) => p.tags.includes(tag);

    let toAdd = [];
    let toRemove = [];

    // ── Silicone Pads & Mats ──
    if (p.vendor === 'Oil Slick' && (
      type.includes('silicone pad') || type.includes('mood mat') ||
      title.includes('slick® pad') || title.includes('slick® slab') ||
      title.includes('slick® duo') || title.includes('canvas') ||
      title.includes('pack-it') || title.includes('shield')
    )) {
      if (!has('family:silicone-pad')) toAdd.push('family:silicone-pad');
      if (!has('material:silicone')) toAdd.push('material:silicone');
    }

    // ── Glass Jars (Oil Slick) ──
    if (p.vendor === 'Oil Slick' && (
      type.includes('glass jar') ||
      (title.includes('jar') && (title.includes('glass') || title.includes('ml') || title.includes('oz')))
    )) {
      if (!has('family:glass-jar')) toAdd.push('family:glass-jar');
      if (!has('material:glass') && (title.includes('glass') || type.includes('glass'))) {
        toAdd.push('material:glass');
      }
    }

    // ── Joint Tubes ──
    if (title.includes('tube') && (title.includes('opaque') || title.includes('child-resistant')) &&
        !title.includes('jar')) {
      if (!has('family:joint-tube')) toAdd.push('family:joint-tube');
      if (has('family:rolling-paper')) toRemove.push('family:rolling-paper');
    }

    // ── Nonstick Papers → parchment-sheet ──
    if (p.vendor === 'Oil Slick' && (
      type.includes('nonstick paper') ||
      (title.includes('paper') && (title.includes('non-stick') || title.includes('nonstick') || title.includes('precut'))) ||
      (title.includes('wrap') && (title.includes('parchment') || title.includes('foil')))
    )) {
      if (!has('family:parchment-sheet') && !has('family:fep-sheet') && !has('family:ptfe-sheet')) {
        toAdd.push('family:parchment-sheet');
      }
      if (!has('material:parchment') && !has('material:fep') && !has('material:ptfe')) {
        toAdd.push('material:parchment');
      }
    }

    // ── Syringe fix ──
    if (title.includes('syringe')) {
      if (has('family:rolling-paper')) toRemove.push('family:rolling-paper');
    }

    // ── Carb cap fix (remove incorrect rolling-tray tag) ──
    if (has('family:carb-cap') && has('family:rolling-tray')) {
      toRemove.push('family:rolling-tray');
    }

    // ── Apply changes ──
    if (toAdd.length === 0 && toRemove.length === 0) continue;

    console.log(`  ${p.title} [${p.vendor}]`);
    if (toAdd.length > 0) console.log(`    + ADD: ${toAdd.join(', ')}`);
    if (toRemove.length > 0) console.log(`    - REMOVE: ${toRemove.join(', ')}`);

    if (!DRY_RUN) {
      let ok = true;
      if (toAdd.length > 0) ok = await addTags(p.id, toAdd);
      if (ok && toRemove.length > 0) ok = await removeTags(p.id, toRemove);
      if (ok) {
        console.log(`    ✅ Done`);
        fixCount++;
      } else {
        errorCount++;
      }
      await sleep(300); // throttle
    } else {
      fixCount++;
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${DRY_RUN ? 'PREVIEW' : 'DONE'}: ${fixCount} products ${DRY_RUN ? 'would be fixed' : 'fixed'}, ${errorCount} errors`);
  console.log(`${'═'.repeat(60)}\n`);

  // Verify collection counts after fix
  if (!DRY_RUN) {
    console.log('  Waiting 5s for Shopify to reindex collections...\n');
    await sleep(5000);

    const verify = ['silicone-pads', 'glass-jars', 'joint-tubes', 'parchment-paper'];
    for (const handle of verify) {
      const r = gql(`{ collectionByHandle(handle: "${handle}") { title productsCount { count } } }`);
      const c = r.data?.collectionByHandle;
      if (c) {
        const flag = c.productsCount?.count > 0 ? '✅' : '⚠️';
        console.log(`  ${flag} ${handle}: ${c.productsCount?.count} products`);
      }
    }
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
