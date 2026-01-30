#!/usr/bin/env node
/**
 * Create URL redirects in Shopify for missing collection URLs
 * These redirects preserve SEO value from old/deleted collection URLs
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

const REDIRECTS = [
  { from: '/collections/parchment-papers', to: '/collections/extraction-packaging', clicks: 304 },
  { from: '/collections/glass-jars-extract-packaging', to: '/collections/extraction-packaging', clicks: 164 },
  { from: '/collections/silicone-glass-hybrid-rigs-and-bubblers', to: '/collections/silicone-pipes', clicks: 53 },
  { from: '/collections/cute-silicone-rigs', to: '/collections/silicone-pipes', clicks: 15 },
  { from: '/collections/extract-packaging-jars-and-nonstick', to: '/collections/extraction-packaging', clicks: 12 },
  { from: '/collections/storage-packaging', to: '/collections/extraction-packaging', clicks: 9 },
  { from: '/collections/silicone-beaker-bongs', to: '/collections/silicone-pipes', clicks: 6 },
  { from: '/collections/smoke-shop-products', to: '/collections/smoke-vape', clicks: 5 },
];

async function main() {
  console.log('='.repeat(60));
  console.log('CREATING SEO REDIRECTS IN SHOPIFY');
  console.log('='.repeat(60) + '\n');

  // First, check existing redirects to avoid duplicates
  console.log('Checking existing redirects...\n');

  let existingRedirects = [];
  try {
    const result = await api.get('redirects.json?limit=250');
    existingRedirects = result.redirects || [];
    console.log(`Found ${existingRedirects.length} existing redirects\n`);
  } catch (error) {
    console.log('Could not fetch existing redirects:', error.message);
  }

  const existingPaths = new Set(existingRedirects.map(r => r.path));

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const redirect of REDIRECTS) {
    // Check if redirect already exists
    if (existingPaths.has(redirect.from)) {
      console.log(`[SKIP] ${redirect.from} - redirect already exists`);
      skipped++;
      continue;
    }

    console.log(`Creating redirect: ${redirect.from} -> ${redirect.to}`);

    try {
      const result = await api.post('redirects.json', {
        redirect: {
          path: redirect.from,
          target: redirect.to
        }
      });

      if (result.redirect) {
        console.log(`  [SUCCESS] Redirect created (ID: ${result.redirect.id})`);
        created++;
      } else if (result.errors) {
        console.log(`  [ERROR] ${JSON.stringify(result.errors)}`);
        failed++;
      }
    } catch (error) {
      console.log(`  [ERROR] ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`
Created: ${created}
Skipped (already exist): ${skipped}
Failed: ${failed}
Total: ${REDIRECTS.length}
  `);

  if (created > 0) {
    console.log('Redirects are now LIVE on your website!');
    console.log('Old URLs will automatically redirect to the new pages.');
  }
}

main().catch(console.error);
