#!/usr/bin/env node
/**
 * Check and fix extraction/packaging products
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function main() {
  console.log('Checking extraction/packaging products...');

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

  console.log(`Total products: ${products.length}`);

  // Count products with pillar:packaging
  const withPackagingPillar = products.filter(p => {
    const tags = Array.isArray(p.tags) ? p.tags : [];
    return tags.some(t => t === 'pillar:packaging');
  });
  console.log(`Products with pillar:packaging: ${withPackagingPillar.length}`);

  // Oil Slick products
  const oilSlick = products.filter(p => p.vendor === 'Oil Slick');
  console.log(`Oil Slick vendor products: ${oilSlick.length}`);

  // Products that SHOULD be in extraction/packaging
  const extractionKeywords = ['pad', 'mat', 'fep', 'ptfe', 'parchment', 'mylar', 'jar', 'container', 'tube', 'slick', 'nonstick', 'extraction', 'sheet', 'roll'];
  const shouldBePackaging = products.filter(p => {
    const title = p.title.toLowerCase();
    const vendor = p.vendor.toLowerCase();
    // Oil Slick products are all extraction/packaging
    if (vendor === 'oil slick') return true;
    return extractionKeywords.some(k => title.includes(k)) &&
           !title.includes('bong') && !title.includes('pipe') && !title.includes('rig');
  });
  console.log(`\nProducts that should be in extraction/packaging: ${shouldBePackaging.length}`);

  // Check how many of those have pillar:packaging
  const correctlyTagged = shouldBePackaging.filter(p => {
    const tags = Array.isArray(p.tags) ? p.tags : [];
    return tags.some(t => t === 'pillar:packaging');
  });
  console.log(`Correctly tagged with pillar:packaging: ${correctlyTagged.length}`);

  // Show ones that are NOT correctly tagged
  const notTagged = shouldBePackaging.filter(p => {
    const tags = Array.isArray(p.tags) ? p.tags : [];
    return !tags.some(t => t === 'pillar:packaging');
  });

  console.log(`\nProducts that need pillar:packaging tag: ${notTagged.length}`);

  if (notTagged.length > 0) {
    console.log('\nFirst 20 products that need fixing:');
    for (const p of notTagged.slice(0, 20)) {
      const tags = Array.isArray(p.tags) ? p.tags : [];
      const pillar = tags.find(t => t.startsWith('pillar:')) || 'no pillar';
      console.log(`  [${p.vendor}] ${p.title.substring(0, 45)}: ${pillar}`);
    }

    // Fix them
    console.log(`\n${'='.repeat(60)}`);
    console.log('FIXING PRODUCTS...');
    console.log('='.repeat(60));

    let fixed = 0;
    for (const product of notTagged) {
      const tags = Array.isArray(product.tags) ? product.tags : [];
      const newTags = new Set(tags.filter(t => !t.startsWith('pillar:')));
      newTags.add('pillar:packaging');

      // Also add family:extraction-supply if missing family tag
      const hasFamily = tags.some(t => t.startsWith('family:'));
      if (!hasFamily) {
        newTags.add('family:extraction-supply');
      }

      // Add use:extraction if missing use tag
      const hasUse = tags.some(t => t.startsWith('use:'));
      if (!hasUse) {
        newTags.add('use:extraction');
      }

      try {
        await api.updateProduct(product.restId, {
          tags: [...newTags].join(', ')
        });
        fixed++;
        if (fixed % 10 === 0) {
          console.log(`  Fixed ${fixed} products...`);
        }
      } catch (error) {
        console.log(`  [ERROR] ${product.title}: ${error.message}`);
      }
    }

    console.log(`\nFixed ${fixed} products with pillar:packaging tag`);
  }

  // Verify the count after fixing
  console.log('\n' + '='.repeat(60));
  console.log('VERIFYING...');
  console.log('='.repeat(60));

  // Check collection count via GraphQL
  const collQuery = `
    query {
      collectionByHandle(handle: "extraction-packaging") {
        title
        productsCount { count }
      }
    }
  `;

  const collResult = await api.graphqlQuery(collQuery, {});
  if (collResult.data && collResult.data.collectionByHandle) {
    const coll = collResult.data.collectionByHandle;
    console.log(`\n${coll.title}: ${coll.productsCount?.count || 0} products`);
  }

  console.log('\nDone!');
}

main().catch(console.error);
