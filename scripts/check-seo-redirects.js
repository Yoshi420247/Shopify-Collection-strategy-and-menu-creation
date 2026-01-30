#!/usr/bin/env node
/**
 * Check collections that may need SEO redirects
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function main() {
  console.log('Fetching all collections and their product counts...\n');

  const [smart, custom] = await Promise.all([
    api.getCollections('smart'),
    api.getCollections('custom')
  ]);

  const all = [
    ...(smart.smart_collections || []).map(c => ({ ...c, type: 'smart' })),
    ...(custom.custom_collections || []).map(c => ({ ...c, type: 'custom' }))
  ];

  console.log('='.repeat(70));
  console.log('COLLECTIONS THAT MAY NEED REDIRECTS');
  console.log('='.repeat(70));

  // Collections with 0 products - these might have had traffic before
  const emptyCollections = all.filter(c => (c.products_count || 0) === 0);

  console.log(`\nEmpty collections (0 products) - ${emptyCollections.length} total:\n`);
  for (const c of emptyCollections.sort((a,b) => a.handle.localeCompare(b.handle))) {
    console.log(`  /collections/${c.handle}`);
    console.log(`    Title: ${c.title}`);
  }

  // Collections that might be duplicates or old versions
  console.log('\n' + '='.repeat(70));
  console.log('POTENTIALLY OLD/DUPLICATE COLLECTION URLS');
  console.log('='.repeat(70) + '\n');

  const suspicious = all.filter(c =>
    c.handle.includes('-1') ||
    c.handle.includes('-2') ||
    c.handle.includes('_') ||
    c.handle.endsWith('-collection')
  );

  for (const c of suspicious) {
    console.log(`  /collections/${c.handle}`);
    console.log(`    Title: ${c.title} (${c.products_count || 0} products)`);
  }

  // Key extraction/packaging URLs from search results
  console.log('\n' + '='.repeat(70));
  console.log('KEY URLS FOUND IN SEARCH ENGINES (verify these exist)');
  console.log('='.repeat(70) + '\n');

  const searchEngineUrls = [
    { url: '/collections/extraction-supplies', note: 'Found in Google' },
    { url: '/collections/extraction-materials-packaging', note: 'Found in Google' },
    { url: '/collections/dabbing', note: 'Silicone Slick Pads page' },
    { url: '/collections/extract-packaging-jars-and-nonstick', note: 'Found in Google' },
    { url: '/collections/silicone-water-pipes', note: 'Found in Google' },
    { url: '/pages/home-page', note: 'Old home page' },
    { url: '/pages/about-us', note: 'About page' },
  ];

  for (const item of searchEngineUrls) {
    const handle = item.url.replace('/collections/', '').replace('/pages/', '');
    const found = all.find(c => c.handle === handle);
    if (found) {
      console.log(`  ${item.url}`);
      console.log(`    Status: EXISTS (${found.products_count || 0} products)`);
    } else {
      console.log(`  ${item.url}`);
      console.log(`    Status: MAY NEED REDIRECT - ${item.note}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('RECOMMENDED REDIRECTS');
  console.log('='.repeat(70) + '\n');

  const redirects = [
    { from: '/collections/extraction-supplies', to: '/collections/extraction-packaging', reason: 'Old URL found in search' },
    { from: '/collections/extract-packaging-jars-and-nonstick', to: '/collections/extraction-packaging', reason: 'Old URL found in search' },
    { from: '/collections/dabbing', to: '/collections/silicone-pads', reason: 'Silicone pads collection' },
  ];

  // Check which redirects are needed
  for (const r of redirects) {
    const fromHandle = r.from.replace('/collections/', '');
    const fromColl = all.find(c => c.handle === fromHandle);

    if (!fromColl || (fromColl.products_count || 0) === 0) {
      console.log(`  ${r.from} -> ${r.to}`);
      console.log(`    Reason: ${r.reason}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('NEXT STEPS FOR SEO AUDIT');
  console.log('='.repeat(70));
  console.log(`
1. Check Google Search Console for:
   - Pages with 404 errors
   - Pages with declining impressions/clicks
   - Crawl errors

2. Check Google Analytics for:
   - Top landing pages (historical)
   - Pages with high bounce rates
   - Pages that have lost traffic

3. Use Ahrefs/SEMrush to check:
   - Backlinks to specific pages
   - Lost backlinks
   - Referring domains

4. Set up redirects in Shopify Admin:
   - Online Store > Navigation > URL Redirects
  `);
}

main().catch(console.error);
