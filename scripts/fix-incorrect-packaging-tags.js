#!/usr/bin/env node
/**
 * Fix products incorrectly tagged as packaging
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

// Products that should NOT be packaging (they're smoking devices)
const NOT_PACKAGING_KEYWORDS = [
  'straight tube', 'steam roller', 'steamroller', 'banana tube',
  'water pipe', 'bong', 'rig', 'pipe', 'bubbler', 'roller'
];

// Products that ARE packaging
const IS_PACKAGING_KEYWORDS = [
  'jar', 'container', 'fep', 'ptfe', 'parchment', 'mylar', 'bag',
  'sticker', 'lid', 'box', 'tube', 'pad', 'mat', 'sheet', 'roll',
  'syringe', 'vial', 'tray'
];

async function main() {
  console.log('Fixing incorrectly tagged products...');

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

  // Find products with pillar:packaging that shouldn't have it
  const incorrectlyTagged = products.filter(p => {
    const tags = Array.isArray(p.tags) ? p.tags : [];
    const hasPackaging = tags.some(t => t === 'pillar:packaging');
    if (!hasPackaging) return false;

    const title = p.title.toLowerCase();

    // Check if it has NOT_PACKAGING keywords and NOT IS_PACKAGING keywords
    const hasNotKeyword = NOT_PACKAGING_KEYWORDS.some(k => title.includes(k));
    const hasIsKeyword = IS_PACKAGING_KEYWORDS.some(k => title.includes(k));

    // It's incorrect if it has NOT keyword and doesn't have IS keyword
    return hasNotKeyword && !hasIsKeyword;
  });

  console.log(`\nFound ${incorrectlyTagged.length} products incorrectly tagged as packaging:`);

  for (const p of incorrectlyTagged) {
    console.log(`  [${p.vendor}] ${p.title}`);
  }

  if (incorrectlyTagged.length > 0) {
    console.log('\nFixing...');

    for (const product of incorrectlyTagged) {
      const tags = Array.isArray(product.tags) ? product.tags : [];
      const title = product.title.toLowerCase();

      // Determine correct pillar
      let correctPillar = 'pillar:smokeshop-device';
      let correctFamily = 'family:glass-bong';
      let correctUse = 'use:flower-smoking';

      if (title.includes('roller') || title.includes('steam')) {
        correctFamily = 'family:steamroller';
      } else if (title.includes('tube')) {
        correctFamily = 'family:glass-bong';
      }

      const newTags = new Set(tags.filter(t =>
        !t.startsWith('pillar:') &&
        !t.startsWith('family:') &&
        !t.startsWith('use:')
      ));

      newTags.add(correctPillar);
      newTags.add(correctFamily);
      newTags.add(correctUse);

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

  // Check final collection count
  console.log('\n' + '='.repeat(60));
  console.log('FINAL VERIFICATION');
  console.log('='.repeat(60));

  const collQuery = `
    query {
      extraction: collectionByHandle(handle: "extraction-packaging") {
        title
        productsCount { count }
      }
      smokeVape: collectionByHandle(handle: "smoke-and-vape") {
        title
        productsCount { count }
      }
      silicone: collectionByHandle(handle: "silicone-rigs-bongs") {
        title
        productsCount { count }
      }
    }
  `;

  const collResult = await api.graphqlQuery(collQuery, {});
  if (collResult.data) {
    if (collResult.data.extraction) {
      console.log(`\n${collResult.data.extraction.title}: ${collResult.data.extraction.productsCount?.count || 0} products`);
    }
    if (collResult.data.smokeVape) {
      console.log(`${collResult.data.smokeVape.title}: ${collResult.data.smokeVape.productsCount?.count || 0} products`);
    }
    if (collResult.data.silicone) {
      console.log(`${collResult.data.silicone.title}: ${collResult.data.silicone.productsCount?.count || 0} products`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
