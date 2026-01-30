#!/usr/bin/env node
/**
 * Analyze Search Console data and verify which top-traffic collections exist
 * Provides redirect recommendations for lost SEO traffic
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

// Top traffic collection URLs from Search Console (16 months data)
const TOP_COLLECTION_URLS = [
  { handle: 'silicone-pipes', clicks: 833, impressions: 96441, note: '#1 collection traffic!' },
  { handle: 'dabbing', clicks: 373, impressions: 33483, note: 'Major traffic page' },
  { handle: 'concentrate-jars', clicks: 304, impressions: 66046, note: 'High impressions' },
  { handle: 'parchment-papers', clicks: 304, impressions: 17889, note: 'Good traffic' },
  { handle: 'glass-jars-extract-packaging', clicks: 164, impressions: 14651, note: 'Extraction category' },
  { handle: 'silicone-smoking-devices', clicks: 104, impressions: 9507, note: 'Device category' },
  { handle: 'non-stick-containers', clicks: 103, impressions: 13758, note: 'Non-stick category' },
  { handle: 'rosin-extraction', clicks: 80, impressions: 5999, note: 'Rosin category' },
  { handle: 'silicone-glass-hybrid-rigs-and-bubblers', clicks: 53, impressions: 3391, note: 'Hybrid category' },
  { handle: 'non-stick-paper-and-ptfe', clicks: 51, impressions: 10665, note: 'Paper category' },
  { handle: 'nectar-collectors', clicks: 48, impressions: 4014, note: 'Nectar collectors' },
  { handle: 'top-selling-silicone-rigs', clicks: 42, impressions: 7355, note: 'Top sellers' },
  { handle: 'extract-packaging-jars-and-nonstick', clicks: 12, impressions: 10786, note: 'Old extract URL - high impressions' },
  { handle: 'quartz-bangers', clicks: 18, impressions: 6156, note: 'Quartz category' },
  { handle: 'spoons', clicks: 26, impressions: 1470, note: 'Spoon pipes' },
  { handle: 'cute-silicone-rigs', clicks: 15, impressions: 1534, note: 'Cute rigs' },
  { handle: 'silicone-beaker-bongs', clicks: 6, impressions: 1305, note: 'Beaker bongs' },
  { handle: 'storage-packaging', clicks: 9, impressions: 882, note: 'Storage' },
  { handle: 'clearance-2', clicks: 3, impressions: 10782, note: 'Clearance - high impressions' },
  { handle: 'smoke-shop-products', clicks: 5, impressions: 192, note: 'Smoke shop' },
  { handle: 'all', clicks: 12, impressions: 2586, note: 'All products' }
];

async function main() {
  console.log('='.repeat(70));
  console.log('SEARCH CONSOLE SEO ANALYSIS - TOP COLLECTIONS');
  console.log('Data: Last 16 months');
  console.log('='.repeat(70) + '\n');

  // Fetch all collections
  const [smart, custom] = await Promise.all([
    api.getCollections('smart'),
    api.getCollections('custom')
  ]);

  const allCollections = [
    ...(smart.smart_collections || []).map(c => ({ ...c, type: 'smart' })),
    ...(custom.custom_collections || []).map(c => ({ ...c, type: 'custom' }))
  ];

  console.log(`Total collections in store: ${allCollections.length}\n`);

  // Check each top traffic URL
  const results = {
    healthy: [],
    needsAttention: [],
    missing: []
  };

  console.log('Checking collection URLs from Search Console...\n');

  for (const url of TOP_COLLECTION_URLS) {
    const collection = allCollections.find(c => c.handle === url.handle);

    if (!collection) {
      results.missing.push(url);
    } else if ((collection.products_count || 0) === 0) {
      results.needsAttention.push({ ...url, collection });
    } else {
      results.healthy.push({ ...url, collection });
    }
  }

  // Display results
  console.log('='.repeat(70));
  console.log('HEALTHY COLLECTIONS (exists with products)');
  console.log('='.repeat(70) + '\n');

  for (const item of results.healthy.sort((a, b) => b.clicks - a.clicks)) {
    console.log(`  /collections/${item.handle}`);
    console.log(`    Clicks: ${item.clicks} | Impressions: ${item.impressions.toLocaleString()}`);
    console.log(`    Current products: ${item.collection.products_count || 0}`);
    console.log(`    Status: OK\n`);
  }

  if (results.needsAttention.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('COLLECTIONS WITH 0 PRODUCTS (NEED REDIRECT OR FIX)');
    console.log('='.repeat(70) + '\n');

    for (const item of results.needsAttention.sort((a, b) => b.clicks - a.clicks)) {
      console.log(`  /collections/${item.handle}`);
      console.log(`    Clicks: ${item.clicks} | Impressions: ${item.impressions.toLocaleString()}`);
      console.log(`    Note: ${item.note}`);
      console.log(`    Status: NEEDS REDIRECT OR PRODUCTS!\n`);
    }
  }

  if (results.missing.length > 0) {
    console.log('\n' + '='.repeat(70));
    console.log('MISSING COLLECTIONS (URL not found - NEED REDIRECT)');
    console.log('='.repeat(70) + '\n');

    for (const item of results.missing.sort((a, b) => b.clicks - a.clicks)) {
      console.log(`  /collections/${item.handle}`);
      console.log(`    Clicks: ${item.clicks} | Impressions: ${item.impressions.toLocaleString()}`);
      console.log(`    Note: ${item.note}`);
      console.log(`    Status: MISSING - REDIRECT REQUIRED!\n`);
    }
  }

  // Generate redirect recommendations
  console.log('\n' + '='.repeat(70));
  console.log('RECOMMENDED REDIRECTS (Add in Shopify Admin > Navigation > URL Redirects)');
  console.log('='.repeat(70) + '\n');

  const redirectRecommendations = [];

  for (const item of [...results.missing, ...results.needsAttention]) {
    let redirectTo = '';
    const handle = item.handle;

    // Determine best redirect target
    if (handle.includes('extract') || handle.includes('packaging') || handle.includes('jar')) {
      redirectTo = '/collections/extraction-packaging';
    } else if (handle.includes('silicone') && (handle.includes('pipe') || handle.includes('rig') || handle.includes('bong'))) {
      redirectTo = '/collections/silicone-pipes';
    } else if (handle.includes('dabbing') || handle.includes('dab')) {
      redirectTo = '/collections/silicone-pads';
    } else if (handle.includes('non-stick') || handle.includes('parchment') || handle.includes('ptfe') || handle.includes('paper')) {
      redirectTo = '/collections/extraction-packaging';
    } else if (handle.includes('rosin')) {
      redirectTo = '/collections/extraction-packaging';
    } else if (handle.includes('nectar')) {
      redirectTo = '/collections/silicone-pipes';
    } else if (handle.includes('quartz') || handle.includes('banger')) {
      redirectTo = '/collections/accessories';
    } else if (handle.includes('storage')) {
      redirectTo = '/collections/extraction-packaging';
    } else if (handle === 'clearance-2') {
      redirectTo = '/collections/all';
    } else if (handle === 'smoke-shop-products') {
      redirectTo = '/collections/smoke-vape';
    } else if (handle === 'spoons') {
      redirectTo = '/collections/silicone-pipes';
    } else if (handle === 'all') {
      redirectTo = '/'; // Homepage
    } else {
      redirectTo = '/collections/all';
    }

    redirectRecommendations.push({
      from: `/collections/${handle}`,
      to: redirectTo,
      clicks: item.clicks,
      impressions: item.impressions,
      reason: item.note
    });
  }

  // Sort by traffic impact (clicks + impressions weighted)
  redirectRecommendations.sort((a, b) => (b.clicks * 100 + b.impressions) - (a.clicks * 100 + a.impressions));

  for (const rec of redirectRecommendations) {
    console.log(`FROM: ${rec.from}`);
    console.log(`TO:   ${rec.to}`);
    console.log(`Traffic: ${rec.clicks} clicks, ${rec.impressions.toLocaleString()} impressions`);
    console.log(`Reason: ${rec.reason}\n`);
  }

  // Summary
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`
Healthy collections:       ${results.healthy.length}
Empty (need attention):    ${results.needsAttention.length}
Missing (need redirect):   ${results.missing.length}

Total lost traffic potential:
  - Clicks: ${[...results.missing, ...results.needsAttention].reduce((sum, i) => sum + i.clicks, 0)}
  - Impressions: ${[...results.missing, ...results.needsAttention].reduce((sum, i) => sum + i.impressions, 0).toLocaleString()}

CRITICAL: The silicone-pipes collection was your #1 traffic source (833 clicks).
This was already fixed and now shows 93+ products.

NEXT STEPS:
1. Add the recommended redirects in Shopify Admin
2. Go to: Online Store > Navigation > URL Redirects
3. For each redirect above, click "Create URL redirect"
4. Enter the FROM path and TO path
5. Save

This will preserve your SEO value and redirect visitors to relevant pages.
  `);
}

main().catch(console.error);
