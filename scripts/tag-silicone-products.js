#!/usr/bin/env node
/**
 * Tag silicone products with material:silicone so they appear in the collection
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function main() {
  console.log('Checking for silicone products missing material:silicone tag...\n');

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

  console.log(`Checked ${products.length} products`);

  // Find silicone products WITHOUT material:silicone tag
  const needsTag = products.filter(p => {
    const title = p.title.toLowerCase();
    const tags = Array.isArray(p.tags) ? p.tags : [];
    const hasSiliconeInTitle = title.includes('silicone');
    const hasMaterialTag = tags.some(t => t === 'material:silicone');
    const isSmokingDevice = title.includes('pipe') || title.includes('rig') ||
                           title.includes('bong') || title.includes('bubbler') ||
                           title.includes('nectar') || title.includes('spoon');
    return hasSiliconeInTitle && isSmokingDevice && !hasMaterialTag;
  });

  console.log(`Found ${needsTag.length} silicone products missing material:silicone tag`);

  if (needsTag.length > 0) {
    console.log('\nAdding material:silicone tag...');
    let fixed = 0;
    for (const product of needsTag) {
      const tags = Array.isArray(product.tags) ? product.tags : [];
      const newTags = new Set(tags);
      newTags.add('material:silicone');

      try {
        await api.updateProduct(product.restId, {
          tags: [...newTags].join(', ')
        });
        fixed++;
        console.log(`  [FIXED] ${product.title.substring(0, 50)}`);
      } catch (error) {
        console.log(`  [ERROR] ${product.title}: ${error.message}`);
      }
    }
    console.log(`\nTagged ${fixed} products`);
  }

  // Verify final count
  const verifyQuery = `
    query {
      collectionByHandle(handle: "silicone-pipes") {
        title
        productsCount { count }
      }
    }
  `;

  const verifyResult = await api.graphqlQuery(verifyQuery, {});
  if (verifyResult.data && verifyResult.data.collectionByHandle) {
    const c = verifyResult.data.collectionByHandle;
    console.log(`\nFinal count: ${c.title} has ${c.productsCount?.count || 0} products`);
  }
}

main().catch(console.error);
