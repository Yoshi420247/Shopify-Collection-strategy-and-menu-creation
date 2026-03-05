#!/usr/bin/env node
/**
 * Custom Collection Manager
 *
 * Scans "What You Need" vendor products and:
 * 1. Identifies rolling papers sold as individual packs (not full boxes)
 * 2. Moves all products with "custom" in the title to a "Custom" collection
 * 3. Strips smart-collection-matching tags so custom products only appear in the Custom collection
 *
 * Usage: node src/custom-collection-manager.js [--dry-run]
 */

import 'dotenv/config';

const STORE = process.env.SHOPIFY_STORE_URL;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API = process.env.SHOPIFY_API_VERSION || '2024-01';
const BASE = `https://${STORE}/admin/api/${API}`;
const DRY_RUN = process.argv.includes('--dry-run');

const RATE_LIMIT_MS = 500;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function shopifyGet(path) {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' }
  });
  if (!resp.ok) throw new Error(`GET ${path}: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

async function shopifyPost(path, body) {
  if (DRY_RUN) { console.log(`  [DRY RUN] POST ${path}`); return { dry_run: true }; }
  await sleep(RATE_LIMIT_MS);
  const resp = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error(`POST ${path}: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

async function shopifyPut(path, body) {
  if (DRY_RUN) { console.log(`  [DRY RUN] PUT ${path}`); return { dry_run: true }; }
  await sleep(RATE_LIMIT_MS);
  const resp = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'X-Shopify-Access-Token': TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!resp.ok) throw new Error(`PUT ${path}: ${resp.status} ${resp.statusText}`);
  return resp.json();
}

// Fetch all products for a vendor, paginated
async function fetchAllProducts(vendor) {
  const products = [];
  let url = `/products.json?vendor=${encodeURIComponent(vendor)}&limit=250`;

  while (url) {
    const data = await shopifyGet(url);
    products.push(...(data.products || []));
    console.log(`  Fetched ${products.length} products so far...`);

    // Check for pagination via Link header (simplified - Shopify returns page_info)
    // For simplicity, if we got 250 results there may be more
    if ((data.products || []).length < 250) break;

    // Note: In production, parse the Link header for page_info pagination
    // This simplified version fetches only the first page of 250
    break; // Would need proper pagination handling for full implementation
  }

  return products;
}

// Scan for individual rolling paper packs
function findIndividualRollingPapers(products) {
  const rollingKeywords = [
    'rolling paper', 'rolling papers', 'pre-rolled cone', 'blunt wrap',
    'hemp wrap', 'leaf wrap', 'king palm', 'cyclone cone'
  ];
  const brandPaperCombos = {
    brands: ['raw', 'elements', 'zig zag', 'zig-zag', 'juicy jay', 'vibes', 'ocb ', 'high hemp'],
    types: ['paper', 'cone', 'wrap', 'leaf', 'slim', 'kingsize', 'king size', '1 1/4', '1.25']
  };
  const boxKeywords = [
    'box', 'case', 'carton', 'display', '24 pack', '24pk', '24ct',
    '25 pack', '25pk', '50 pack', 'full box', '24 count', '12 count',
    'box of', 'master case'
  ];
  const excludeKeywords = [
    'tray', 'grinder', 'ashtray', 'lighter', 'torch', 'jar', 'container',
    'carb cap', 'dab tool', 'dabber', 'banger', 'pendant', 'pipe', 'bong',
    'rig', 'bubbler', 'downstem', 'bowl', 'ash catcher', 'smoke ring'
  ];

  const rollingProducts = products.filter(p => {
    const title = p.title.toLowerCase();
    const tags = (p.tags || '').toLowerCase();

    if (excludeKeywords.some(kw => title.includes(kw))) return false;

    if (rollingKeywords.some(kw => title.includes(kw))) return true;
    if (tags.includes('family:rolling-paper') || tags.includes('family:cone')) return true;

    for (const brand of brandPaperCombos.brands) {
      if (title.includes(brand)) {
        if (brandPaperCombos.types.some(t => title.includes(t))) return true;
      }
    }
    return false;
  });

  const individual = rollingProducts.filter(p => {
    const combined = `${p.title} ${p.tags || ''} ${p.body_html || ''}`.toLowerCase();
    const variantText = (p.variants || []).map(v => (v.title || '').toLowerCase()).join(' ');
    const full = combined + ' ' + variantText;
    return !boxKeywords.some(kw => full.includes(kw));
  });

  // Further filter by price - wholesale boxes are $25+, individual packs are <$20
  return individual.filter(p => {
    const prices = (p.variants || []).map(v => parseFloat(v.price || 0));
    const maxPrice = Math.max(...prices, 0);
    return maxPrice < 20; // Only truly consumer-priced individual packs
  });
}

// Find products with "custom" in the title
function findCustomProducts(products) {
  return products.filter(p => {
    const title = p.title.toLowerCase();
    return title.includes('custom') && !title.includes('customary');
  });
}

// Smart collection tag prefixes that pull products into other collections
const SMART_TAG_PREFIXES = [
  'family:', 'material:', 'pillar:', 'use:', 'style:', 'includes:',
  'joint_size:', 'size:', 'length:'
];

function stripSmartTags(tags) {
  const tagList = tags.split(',').map(t => t.trim()).filter(Boolean);
  const kept = tagList.filter(tag => !SMART_TAG_PREFIXES.some(p => tag.startsWith(p)));
  if (!kept.includes('custom')) kept.push('custom');
  return kept.join(', ');
}

async function main() {
  console.log('=== Custom Collection Manager ===');
  if (DRY_RUN) console.log('[DRY RUN MODE - No changes will be made]\n');

  console.log('Fetching "What You Need" vendor products...');
  const products = await fetchAllProducts('What You Need');
  console.log(`Total products: ${products.length}\n`);

  // --- Rolling Papers Check ---
  console.log('--- Rolling Papers Individual Pack Scan ---');
  const individualPacks = findIndividualRollingPapers(products);
  if (individualPacks.length === 0) {
    console.log('No individual rolling paper packs found. Store is clean!\n');
  } else {
    console.log(`Found ${individualPacks.length} individual packs:`);
    for (const p of individualPacks) {
      const prices = (p.variants || []).map(v => v.price);
      console.log(`  ${p.title} (ID: ${p.id}) - $${prices.join('/$')} - Status: ${p.status}`);
    }
    console.log();
  }

  // --- Custom Products ---
  console.log('--- Custom Products Management ---');
  const customProducts = findCustomProducts(products);
  console.log(`Found ${customProducts.length} custom products\n`);

  // Check for existing Custom collection
  const existingCustom = await shopifyGet('/custom_collections.json?title=Custom&limit=5');
  let collectionId;

  if (existingCustom.custom_collections.length > 0) {
    collectionId = existingCustom.custom_collections[0].id;
    console.log(`Using existing Custom collection (ID: ${collectionId})`);
  } else {
    console.log('Creating new Custom collection...');
    const result = await shopifyPost('/custom_collections.json', {
      custom_collection: {
        title: 'Custom',
        body_html: '<p>Custom branded products - available for customization with your logo, brand, or design.</p>',
        published: true,
        sort_order: 'alpha-asc'
      }
    });
    collectionId = result.custom_collection?.id || 'DRY_RUN';
    console.log(`Created collection ID: ${collectionId}`);
  }

  // Add products to Custom collection and strip tags
  for (const p of customProducts) {
    console.log(`\nProcessing: ${p.title}`);

    // Add to Custom collection
    try {
      await shopifyPost('/collects.json', {
        collect: { product_id: p.id, collection_id: collectionId }
      });
      console.log('  Added to Custom collection');
    } catch (e) {
      console.log(`  Already in collection or error: ${e.message}`);
    }

    // Strip smart collection tags
    const newTags = stripSmartTags(p.tags || '');
    if (newTags !== (p.tags || '')) {
      await shopifyPut(`/products/${p.id}.json`, {
        product: { id: p.id, tags: newTags }
      });
      console.log(`  Tags updated: ${newTags}`);
    }
  }

  console.log('\n=== Complete ===');
  console.log(`Custom collection ID: ${collectionId}`);
  console.log(`Products processed: ${customProducts.length}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
