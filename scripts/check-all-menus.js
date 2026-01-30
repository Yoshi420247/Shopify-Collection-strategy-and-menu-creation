#!/usr/bin/env node
/**
 * Check all menus for broken/empty collection links
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

const MENU_IDS = [
  { id: 'gid://shopify/Menu/305173987608', name: 'Main Navigation' },
  { id: 'gid://shopify/Menu/305172676888', name: 'Smoke & Vape Dropdown' },
  { id: 'gid://shopify/Menu/305198039320', name: 'Extraction & Packaging Dropdown' },
  { id: 'gid://shopify/Menu/305176674584', name: 'Brands Dropdown' },
  { id: 'gid://shopify/Menu/305171530008', name: 'Accessories Dropdown' },
  { id: 'gid://shopify/Menu/305171628312', name: 'Silicone Pipes Dropdown' },
  { id: 'gid://shopify/Menu/304857317656', name: 'Smoke & Vape Menu' },
];

async function getCollectionCounts() {
  const [smart, custom] = await Promise.all([
    api.getCollections('smart'),
    api.getCollections('custom')
  ]);

  const allCollections = [
    ...(smart.smart_collections || []),
    ...(custom.custom_collections || [])
  ];

  const counts = new Map();

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
          counts.set(val.handle, val.productsCount?.count || 0);
        }
      }
    }
  }

  return counts;
}

async function main() {
  console.log('='.repeat(70));
  console.log('MENU AUDIT - Finding broken & empty collection links');
  console.log('='.repeat(70) + '\n');

  // Get collection counts first
  console.log('Fetching collection product counts...\n');
  const collectionCounts = await getCollectionCounts();

  const brokenLinks = [];
  const emptyLinks = [];
  const lowProductLinks = [];

  for (const menuInfo of MENU_IDS) {
    const query = `
      query {
        menu(id: "${menuInfo.id}") {
          title
          items {
            title
            url
            items {
              title
              url
              items {
                title
                url
              }
            }
          }
        }
      }
    `;

    const result = await api.graphqlQuery(query, {});
    const menu = result.data?.menu;

    if (!menu) continue;

    console.log('='.repeat(50));
    console.log(`MENU: ${menu.title}`);
    console.log('='.repeat(50));

    function checkMenuItem(item, level = 0) {
      const indent = '  '.repeat(level);
      const url = item.url || '';

      // Extract collection handle from URL
      const match = url.match(/\/collections\/([^/?]+)/);
      const handle = match ? match[1] : null;

      let status = '';
      if (handle) {
        const count = collectionCounts.get(handle);
        if (count === undefined) {
          status = ' [NOT FOUND]';
          brokenLinks.push({ menu: menu.title, item: item.title, url, handle });
        } else if (count === 0) {
          status = ' [EMPTY - 0 products]';
          emptyLinks.push({ menu: menu.title, item: item.title, url, handle });
        } else if (count < 5) {
          status = ` [LOW - ${count} products]`;
          lowProductLinks.push({ menu: menu.title, item: item.title, url, handle, count });
        } else {
          status = ` (${count})`;
        }
      }

      console.log(`${indent}${item.title}${status}`);
      if (url && url !== '#') {
        console.log(`${indent}  -> ${url}`);
      }

      // Check sub-items
      for (const subItem of item.items || []) {
        checkMenuItem(subItem, level + 1);
      }
    }

    for (const item of menu.items || []) {
      checkMenuItem(item);
    }

    console.log('');
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('PROBLEMS FOUND');
  console.log('='.repeat(70));

  if (brokenLinks.length > 0) {
    console.log('\nBROKEN LINKS (collection not found):');
    for (const link of brokenLinks) {
      console.log(`  [${link.menu}] "${link.item}" -> /collections/${link.handle}`);
    }
  }

  if (emptyLinks.length > 0) {
    console.log('\nEMPTY COLLECTION LINKS (0 products):');
    for (const link of emptyLinks) {
      console.log(`  [${link.menu}] "${link.item}" -> /collections/${link.handle}`);
    }
  }

  if (lowProductLinks.length > 0) {
    console.log('\nLOW PRODUCT LINKS (<5 products) - Consider removing:');
    for (const link of lowProductLinks) {
      console.log(`  [${link.menu}] "${link.item}" -> /collections/${link.handle} (${link.count})`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`
Broken links (collection not found): ${brokenLinks.length}
Empty collection links (0 products): ${emptyLinks.length}
Low product links (<5 products):     ${lowProductLinks.length}
  `);
}

main().catch(console.error);
