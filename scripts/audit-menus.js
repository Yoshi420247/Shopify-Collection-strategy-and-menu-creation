#!/usr/bin/env node
/**
 * Audit all menus and find broken/empty collection links
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function main() {
  console.log('='.repeat(60));
  console.log('MENU AUDIT - Finding broken links');
  console.log('='.repeat(60) + '\n');

  // Get menus using updated GraphQL query
  const menuQuery = `
    query {
      menus(first: 20) {
        edges {
          node {
            id
            title
            handle
            itemsCount { count }
          }
        }
      }
    }
  `;

  const menuResult = await api.graphqlQuery(menuQuery, {});
  const menus = menuResult.data?.menus?.edges || [];

  console.log('Found', menus.length, 'menus:\n');

  for (const edge of menus) {
    const menu = edge.node;
    console.log(`  ${menu.title} (${menu.handle}) - ${menu.itemsCount?.count || 0} items`);
  }

  // Get all collections for cross-reference
  console.log('\n' + '='.repeat(60));
  console.log('COLLECTION PRODUCT COUNTS');
  console.log('='.repeat(60) + '\n');

  const [smart, custom] = await Promise.all([
    api.getCollections('smart'),
    api.getCollections('custom')
  ]);

  const allCollections = [
    ...(smart.smart_collections || []),
    ...(custom.custom_collections || [])
  ];

  // Get accurate counts via GraphQL
  const collectionCounts = new Map();

  for (let i = 0; i < allCollections.length; i += 10) {
    const batch = allCollections.slice(i, i + 10);
    const queryParts = batch.map((c, idx) =>
      `c${idx}: collectionByHandle(handle: "${c.handle}") { handle productsCount { count } }`
    ).join('\n');

    const query = `query { ${queryParts} }`;
    const result = await api.graphqlQuery(query, {});

    if (result.data) {
      for (const val of Object.values(result.data)) {
        if (val) {
          collectionCounts.set(val.handle, val.productsCount?.count || 0);
        }
      }
    }
  }

  // Categorize collections
  const empty = [];
  const low = [];
  const brandSpecific = [];

  for (const [handle, count] of collectionCounts) {
    if (count === 0) {
      empty.push(handle);
    } else if (count < 5) {
      low.push({ handle, count });
    }

    // Check if it's a brand collection
    const brandNames = ['710-sci', 'cookies', 'elements', 'eo-vape', 'g-pen', 'lookah',
                        'maven', 'monark', 'only-quartz', 'peaselburg', 'puffco',
                        'raw', 'scorch', 'vibes', 'zig-zag', 'cloud-yhs'];
    if (brandNames.includes(handle)) {
      brandSpecific.push({ handle, count });
    }
  }

  console.log('EMPTY COLLECTIONS (0 products) - Should NOT be in menus:');
  for (const h of empty.sort()) {
    console.log(`  /collections/${h}`);
  }

  console.log('\nLOW PRODUCT COLLECTIONS (<5) - Consider removing from menus:');
  for (const c of low.sort((a,b) => a.count - b.count)) {
    console.log(`  /collections/${c.handle} (${c.count} products)`);
  }

  console.log('\nBRAND-SPECIFIC COLLECTIONS - Consider consolidating:');
  for (const c of brandSpecific.sort((a,b) => b.count - a.count)) {
    console.log(`  /collections/${c.handle} (${c.count} products)`);
  }

  // Recommendations
  console.log('\n' + '='.repeat(60));
  console.log('RECOMMENDATIONS');
  console.log('='.repeat(60));
  console.log(`
1. REMOVE these empty collection links from menus:
${empty.map(h => `   - /collections/${h}`).join('\n')}

2. CONSOLIDATE brand collections into main categories
   Instead of separate brand pages, use product tags for filtering

3. HIGH-LEVEL NAVIGATION should be:
   SMOKE SHOP:
   - Hand Pipes (380 products)
   - Bongs & Water Pipes (290 products)
   - Dab Rigs (149 products)
   - Accessories (125 products)
   - Rolling (157 products)
   - Nectar Collectors (36 products)

   EXTRACTION & PACKAGING:
   - Concentrate Jars (22 products)
   - Non-Stick Containers (7 products)
   - Parchment & PTFE (10 products)
   - Silicone Pads (28 products)
  `);
}

main().catch(console.error);
