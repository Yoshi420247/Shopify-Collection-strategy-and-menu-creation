#!/usr/bin/env node
/**
 * Fix silicone products that were incorrectly moved out of packaging
 * These products contain "silicone" which has "cone" in it
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

// Products that should be in packaging (Oil Slick jars, containers, etc.)
const PACKAGING_PRODUCTS = [
  '6ml Glass No-Neck Jar',
  'Canvas Silicone Slick',
  'Slick® Stack Silicone Container',
  '3oz Honey Jar',
  '5oz jar with silicone',
  'Child-Resistant Opaque Tubes',
  'WIGWAG JAR',
];

// Products that should NOT be in packaging
const NOT_PACKAGING = [
  'Rolling Tray',
  'Silicone Straight tube', // This is a bong
  'FATTY CONES', // Rolling cones
  'PRE-ROLLED',
];

async function main() {
  console.log('Fixing silicone products incorrectly moved...\n');

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

  // Find Oil Slick products that should be packaging
  const oilSlickProducts = products.filter(p => p.vendor === 'Oil Slick');

  console.log(`Found ${oilSlickProducts.length} Oil Slick products`);

  // Check which ones need to be moved back to packaging
  const needsPackagingTag = oilSlickProducts.filter(p => {
    const title = p.title.toLowerCase();
    const tags = Array.isArray(p.tags) ? p.tags : [];
    const hasPackaging = tags.some(t => t === 'pillar:packaging');

    // Should NOT be packaging if it's a water pipe/bubbler
    if (title.includes('water pipe') || title.includes('bubbler') ||
        title.includes('pipe') || title.includes('smoker')) {
      return false;
    }

    // Should be packaging if it doesn't have the tag yet
    return !hasPackaging;
  });

  console.log(`\nOil Slick products that need pillar:packaging: ${needsPackagingTag.length}`);

  for (const p of needsPackagingTag) {
    console.log(`  ${p.title}`);
  }

  if (needsPackagingTag.length > 0) {
    console.log('\nFixing...');

    let fixed = 0;
    for (const product of needsPackagingTag) {
      const tags = Array.isArray(product.tags) ? product.tags : [];
      const newTags = new Set(tags.filter(t => !t.startsWith('pillar:')));
      newTags.add('pillar:packaging');

      // Also ensure family tag
      if (!tags.some(t => t.startsWith('family:'))) {
        newTags.add('family:extraction-supply');
      }

      try {
        await api.updateProduct(product.restId, {
          tags: [...newTags].join(', ')
        });
        fixed++;
      } catch (error) {
        console.log(`  [ERROR] ${product.title}: ${error.message}`);
      }
    }

    console.log(`Fixed ${fixed} Oil Slick products`);
  }

  // Also fix other vendor products with silicone jars
  console.log('\n' + '='.repeat(60));
  console.log('Fixing other silicone jar/container products...');
  console.log('='.repeat(60));

  const jarProducts = products.filter(p => {
    const title = p.title.toLowerCase();
    const tags = Array.isArray(p.tags) ? p.tags : [];

    // Is it a jar/container that should be packaging?
    const isJar = title.includes('jar') || title.includes('container');
    const hasSilicone = title.includes('silicone');
    const hasPackaging = tags.some(t => t === 'pillar:packaging');

    // Not a smoking device
    const isSmokingDevice = title.includes('bong') || title.includes('pipe') ||
                           title.includes('rig') || title.includes('bubbler');

    return isJar && hasSilicone && !hasPackaging && !isSmokingDevice;
  });

  console.log(`Found ${jarProducts.length} jar products needing packaging tag`);

  for (const product of jarProducts) {
    const tags = Array.isArray(product.tags) ? product.tags : [];
    const newTags = new Set(tags.filter(t => !t.startsWith('pillar:')));
    newTags.add('pillar:packaging');

    try {
      await api.updateProduct(product.restId, {
        tags: [...newTags].join(', ')
      });
      console.log(`  [FIXED] ${product.title}`);
    } catch (error) {
      console.log(`  [ERROR] ${product.title}: ${error.message}`);
    }
  }

  // Verify
  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION');
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
