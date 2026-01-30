#!/usr/bin/env node
/**
 * Tag products that are missing family tags for their collections
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function main() {
  console.log('='.repeat(60));
  console.log('TAGGING PRODUCTS FOR EMPTY COLLECTIONS');
  console.log('='.repeat(60) + '\n');

  // Get all products
  const query = `
    query($cursor: String) {
      products(first: 250, after: $cursor) {
        pageInfo { hasNextPage, endCursor }
        edges {
          node {
            id
            title
            tags
          }
        }
      }
    }
  `;

  const products = [];
  let cursor = null;
  let hasNextPage = true;

  console.log('Fetching all products...');

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

  console.log(`Found ${products.length} products\n`);

  // Tag ashtrays
  console.log('--- ASHTRAYS ---');
  const ashtrays = products.filter(p =>
    p.title.toLowerCase().includes('ashtray') &&
    !p.tags.includes('family:ashtray')
  );

  console.log(`Found ${ashtrays.length} ashtrays needing tag`);
  for (const product of ashtrays) {
    const newTags = [...new Set([...product.tags, 'family:ashtray', 'pillar:accessory'])];
    try {
      await api.updateProduct(product.restId, { tags: newTags.join(', ') });
      console.log(`  [TAGGED] ${product.title.substring(0, 40)}`);
    } catch (error) {
      console.log(`  [ERROR] ${product.title}: ${error.message}`);
    }
  }

  // Tag joint tubes
  console.log('\n--- JOINT TUBES ---');
  const jointTubes = products.filter(p => {
    const title = p.title.toLowerCase();
    return (title.includes('doob tube') || title.includes('joint tube') ||
            (title.includes('tube') && title.includes('joint'))) &&
           !p.tags.includes('Joint Tubes');
  });

  console.log(`Found ${jointTubes.length} joint tubes needing tag`);
  for (const product of jointTubes) {
    const newTags = [...new Set([...product.tags, 'Joint Tubes', 'pillar:packaging'])];
    try {
      await api.updateProduct(product.restId, { tags: newTags.join(', ') });
      console.log(`  [TAGGED] ${product.title.substring(0, 40)}`);
    } catch (error) {
      console.log(`  [ERROR] ${product.title}: ${error.message}`);
    }
  }

  // Verify
  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION');
  console.log('='.repeat(60) + '\n');

  const verifyQuery = `
    query {
      ashtrays: collectionByHandle(handle: "ashtrays") {
        title
        productsCount { count }
      }
      jointTubes: collectionByHandle(handle: "joint-tubes") {
        title
        productsCount { count }
      }
    }
  `;

  const verifyResult = await api.graphqlQuery(verifyQuery, {});
  if (verifyResult.data) {
    console.log('Ashtrays:', verifyResult.data.ashtrays?.productsCount?.count || 0, 'products');
    console.log('Joint Tubes:', verifyResult.data.jointTubes?.productsCount?.count || 0, 'products');
  }
}

main().catch(console.error);
