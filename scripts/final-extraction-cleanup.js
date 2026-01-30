#!/usr/bin/env node
/**
 * Final cleanup of Extraction & Packaging collection
 * Remove remaining smokeshop items
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

// Specific products to remove from packaging
const REMOVE_TITLES = [
  'Steam Roller',
  'Banana Tube',
  'Skull Tube',
  'CIGARETTE ROLLER',
  'PALM ROLLS',
  'PRE-ROLLED TIPS',
  'PRE-ROLLED CONES',
];

async function main() {
  console.log('Final cleanup of Extraction & Packaging...\n');

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
      products.push(...result.data.products.edges.map(e => ({
        ...e.node,
        restId: e.node.id.replace('gid://shopify/Product/', '')
      })));
      hasNextPage = result.data.products.pageInfo.hasNextPage;
      cursor = result.data.products.pageInfo.endCursor;
    } else {
      hasNextPage = false;
    }
  }

  // Find products to remove
  const packagingProducts = products.filter(p => {
    const tags = Array.isArray(p.tags) ? p.tags : [];
    return tags.some(t => t === 'pillar:packaging');
  });

  const toRemove = packagingProducts.filter(p => {
    const title = p.title.toUpperCase();
    return REMOVE_TITLES.some(r => title.includes(r.toUpperCase()));
  });

  console.log(`Found ${toRemove.length} products to remove:\n`);

  for (const product of toRemove) {
    console.log(`  [${product.vendor}] ${product.title}`);
  }

  if (toRemove.length > 0) {
    console.log('\nFixing...\n');

    for (const product of toRemove) {
      const title = product.title.toLowerCase();
      const tags = Array.isArray(product.tags) ? product.tags : [];

      // Determine correct category
      let newPillar, newFamily, newUse;

      if (title.includes('steam roller') || title.includes('steamroller')) {
        newPillar = 'pillar:smokeshop-device';
        newFamily = 'family:steamroller';
        newUse = 'use:flower-smoking';
      } else if (title.includes('tube') && (title.includes('banana') || title.includes('skull'))) {
        newPillar = 'pillar:smokeshop-device';
        newFamily = 'family:glass-bong';
        newUse = 'use:flower-smoking';
      } else if (title.includes('roller') || title.includes('roll') || title.includes('tips') || title.includes('cone')) {
        newPillar = 'pillar:accessory';
        newFamily = 'family:rolling-paper';
        newUse = 'use:rolling';
      } else {
        newPillar = 'pillar:accessory';
        newFamily = 'family:rolling-paper';
        newUse = 'use:rolling';
      }

      const newTags = new Set(tags.filter(t =>
        !t.startsWith('pillar:') &&
        !t.startsWith('family:') &&
        !t.startsWith('use:')
      ));

      newTags.add(newPillar);
      newTags.add(newFamily);
      newTags.add(newUse);

      // Remove dab pad tags
      newTags.delete('Silicone Pad');
      newTags.delete('dabpad');
      newTags.delete('Dab Pads');

      try {
        await api.updateProduct(product.restId, {
          tags: [...newTags].join(', ')
        });
        console.log(`  [FIXED] ${product.title}`);
      } catch (error) {
        console.log(`  [ERROR] ${product.title}: ${error.message}`);
      }
    }
  }

  // Verify
  console.log('\n' + '='.repeat(60));
  console.log('FINAL COUNT');
  console.log('='.repeat(60));

  const verifyQuery = `
    query {
      extraction: collectionByHandle(handle: "extraction-packaging") {
        title
        productsCount { count }
      }
    }
  `;

  const verifyResult = await api.graphqlQuery(verifyQuery, {});
  if (verifyResult.data && verifyResult.data.extraction) {
    console.log(`\n${verifyResult.data.extraction.title}: ${verifyResult.data.extraction.productsCount?.count || 0} products`);
  }

  console.log('\nDone!');
}

main().catch(console.error);
