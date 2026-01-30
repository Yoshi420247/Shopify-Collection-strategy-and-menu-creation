#!/usr/bin/env node
/**
 * Fix Silicone Pads & Mats collection
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function main() {
  console.log('Finding silicone pad/mat products...');

  const query = `
    query($cursor: String) {
      products(first: 250, after: $cursor, query: "vendor:'Oil Slick'") {
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

  console.log(`Found ${products.length} Oil Slick products`);

  // Find pad/mat products
  const padMatKeywords = ['pad', 'mat', 'slick', 'dab pad', 'dabpad', 'non-stick', 'nonstick'];
  const excludeKeywords = ['jar', 'container', 'syringe', 'sticker', 'box', 'lid', 'custom'];

  const padMatProducts = products.filter(p => {
    const title = p.title.toLowerCase();
    const hasKeyword = padMatKeywords.some(k => title.includes(k));
    const hasExclude = excludeKeywords.some(k => title.includes(k));
    return hasKeyword && !hasExclude;
  });

  console.log(`\nFound ${padMatProducts.length} pad/mat products:`);
  for (const p of padMatProducts) {
    console.log(`  ${p.title}`);
  }

  // Tag them with the correct tags for the silicone-pads collection
  console.log('\nAdding "Silicone Pad" and "dabpad" tags...');

  let fixed = 0;
  for (const product of padMatProducts) {
    const tags = Array.isArray(product.tags) ? product.tags : [];
    const newTags = new Set(tags);

    // Add the tags that silicone-pads collection is looking for
    newTags.add('Silicone Pad');
    newTags.add('dabpad');
    newTags.add('Dab Pads');

    try {
      await api.updateProduct(product.restId, {
        tags: [...newTags].join(', ')
      });
      fixed++;
      console.log(`  [FIXED] ${product.title}`);
    } catch (error) {
      console.log(`  [ERROR] ${product.title}: ${error.message}`);
    }
  }

  console.log(`\nFixed ${fixed} products`);

  // Also update the silicone-pads collection to include family:extraction-supply products
  console.log('\nUpdating silicone-pads collection rules...');

  const smart = await api.getCollections('smart');
  const siliconePads = smart.smart_collections.find(c => c.handle === 'silicone-pads');

  if (siliconePads) {
    try {
      await api.updateSmartCollection(siliconePads.id, {
        rules: [
          { column: 'tag', relation: 'equals', condition: 'Silicone Pad' },
          { column: 'tag', relation: 'equals', condition: 'dabpad' },
          { column: 'tag', relation: 'equals', condition: 'Dab Pads' },
          { column: 'tag', relation: 'equals', condition: 'dab mat' },
        ],
        disjunctive: true // OR - any of these tags
      });
      console.log('[SUCCESS] Updated silicone-pads collection');
    } catch (error) {
      console.log('[ERROR] Could not update collection:', error.message);
    }
  }

  // Verify
  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION');
  console.log('='.repeat(60));

  const verifyQuery = `
    query {
      silicone: collectionByHandle(handle: "silicone-pads") {
        title
        productsCount { count }
      }
      extraction: collectionByHandle(handle: "extraction-packaging") {
        title
        productsCount { count }
      }
    }
  `;

  const verifyResult = await api.graphqlQuery(verifyQuery, {});
  if (verifyResult.data) {
    if (verifyResult.data.silicone) {
      console.log(`\n${verifyResult.data.silicone.title}: ${verifyResult.data.silicone.productsCount?.count || 0} products`);
    }
    if (verifyResult.data.extraction) {
      console.log(`${verifyResult.data.extraction.title}: ${verifyResult.data.extraction.productsCount?.count || 0} products`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
