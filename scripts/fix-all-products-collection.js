#!/usr/bin/env node
/**
 * Fix All Products Collection and Check Tag Mismatches
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function main() {
  console.log('Fixing All Products collection...');

  const smart = await api.getCollections('smart');
  const allProducts = smart.smart_collections.find(c => c.handle === 'all');

  if (allProducts) {
    // Use a broad rule - match anything with a pillar tag
    try {
      await api.updateSmartCollection(allProducts.id, {
        rules: [
          { column: 'tag', relation: 'equals', condition: 'pillar:smokeshop-device' },
          { column: 'tag', relation: 'equals', condition: 'pillar:accessory' },
          { column: 'tag', relation: 'equals', condition: 'pillar:merch' },
          { column: 'tag', relation: 'equals', condition: 'pillar:packaging' },
          { column: 'tag', relation: 'equals', condition: 'pillar:wholesale' },
        ],
        disjunctive: true // OR - any of these pillars
      });
      console.log('[SUCCESS] All Products collection updated');
    } catch (error) {
      console.log('[ERROR]', error.message);
    }
  } else {
    console.log('All Products collection not found');
  }

  // Check for products with mismatched tags
  console.log('\nChecking for products with potential tag mismatches...');

  const query = `
    query($cursor: String) {
      products(first: 250, after: $cursor) {
        pageInfo { hasNextPage, endCursor }
        edges {
          node {
            id
            title
            vendor
            tags
          }
        }
      }
    }
  `;

  const products = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const result = await api.graphqlQuery(query, { cursor });
    if (result.data && result.data.products) {
      products.push(...result.data.products.edges.map(e => e.node));
      hasNextPage = result.data.products.pageInfo.hasNextPage;
      cursor = result.data.products.pageInfo.endCursor;
    } else {
      hasNextPage = false;
    }
  }

  console.log(`Checked ${products.length} products`);

  // Find mismatches
  const mismatches = [];

  for (const p of products) {
    const title = (p.title || '').toLowerCase();
    const tags = Array.isArray(p.tags) ? p.tags : [];
    const familyTag = tags.find(t => t.startsWith('family:'));

    if (!familyTag) continue;

    const family = familyTag.replace('family:', '');

    // Banger check
    if ((title.includes('banger') || title.includes('slurper')) && family !== 'banger') {
      mismatches.push({ title: p.title, vendor: p.vendor, currentFamily: family, shouldBe: 'banger', id: p.id });
    }
    // Rig check
    else if (title.includes(' rig') && !title.includes('trigger') && !['glass-rig', 'silicone-rig'].includes(family)) {
      mismatches.push({ title: p.title, vendor: p.vendor, currentFamily: family, shouldBe: 'glass-rig/silicone-rig', id: p.id });
    }
  }

  if (mismatches.length > 0) {
    console.log(`\nFound ${mismatches.length} potential mismatches:`);
    for (const m of mismatches.slice(0, 30)) {
      console.log(`  [${m.vendor}] ${m.title}`);
      console.log(`    Has: family:${m.currentFamily}, should be: ${m.shouldBe}`);
    }
    if (mismatches.length > 30) {
      console.log(`  ... and ${mismatches.length - 30} more`);
    }
  } else {
    console.log('No obvious tag mismatches found.');
  }

  console.log('\nDone!');
}

main().catch(console.error);
