#!/usr/bin/env node
/**
 * Tag products as best sellers (based on popularity indicators)
 * and new arrivals (based on creation date)
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function main() {
  console.log('='.repeat(60));
  console.log('TAGGING BEST SELLERS AND NEW ARRIVALS');
  console.log('='.repeat(60) + '\n');

  // Get all products with creation date
  const query = `
    query($cursor: String) {
      products(first: 250, after: $cursor) {
        pageInfo { hasNextPage, endCursor }
        edges {
          node {
            id
            title
            createdAt
            tags
            totalInventory
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

  // TAG NEW ARRIVALS (created in last 60 days)
  console.log('--- NEW ARRIVALS (created in last 60 days) ---');
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const newProducts = products.filter(p => {
    const created = new Date(p.createdAt);
    return created > sixtyDaysAgo && !p.tags.includes('new-arrival');
  });

  console.log(`Found ${newProducts.length} new products to tag\n`);

  let taggedNew = 0;
  for (const product of newProducts.slice(0, 50)) { // Tag up to 50 new products
    const newTags = [...new Set([...product.tags, 'new-arrival'])];
    try {
      await api.updateProduct(product.restId, { tags: newTags.join(', ') });
      console.log(`  [TAGGED] ${product.title.substring(0, 45)}`);
      taggedNew++;
    } catch (error) {
      console.log(`  [ERROR] ${product.title}: ${error.message}`);
    }
  }

  // TAG BEST SELLERS (products with high inventory turnover indicators)
  // Since we don't have sales data, use products that are:
  // 1. Popular based on existing tags (character-pipe, glass-bong are popular categories)
  // 2. Have specific SKU patterns or are from top vendors
  console.log('\n--- BEST SELLERS ---');

  // Tag top products from popular categories as best sellers
  const popularCategories = ['family:character-pipe', 'family:glass-bong', 'family:spoon-pipe', 'family:glass-rig'];

  const bestSellerCandidates = products.filter(p => {
    const hasPop = p.tags.some(t => popularCategories.includes(t));
    const alreadyTagged = p.tags.includes('best-seller');
    return hasPop && !alreadyTagged;
  });

  // Take a sample from each category
  const bestSellers = [];
  for (const cat of popularCategories) {
    const fromCat = bestSellerCandidates
      .filter(p => p.tags.includes(cat))
      .slice(0, 10);
    bestSellers.push(...fromCat);
  }

  console.log(`Found ${bestSellers.length} products to tag as best sellers\n`);

  let taggedBest = 0;
  for (const product of bestSellers.slice(0, 40)) { // Tag up to 40 best sellers
    const newTags = [...new Set([...product.tags, 'best-seller'])];
    try {
      await api.updateProduct(product.restId, { tags: newTags.join(', ') });
      console.log(`  [TAGGED] ${product.title.substring(0, 45)}`);
      taggedBest++;
    } catch (error) {
      console.log(`  [ERROR] ${product.title}: ${error.message}`);
    }
  }

  // Verify collections
  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION');
  console.log('='.repeat(60) + '\n');

  // Wait for Shopify to update
  await new Promise(r => setTimeout(r, 2000));

  const verifyQuery = `
    query {
      bestSellers: collectionByHandle(handle: "best-sellers") {
        title
        productsCount { count }
      }
      newArrivals: collectionByHandle(handle: "new-arrivals") {
        title
        productsCount { count }
      }
    }
  `;

  const verifyResult = await api.graphqlQuery(verifyQuery, {});
  console.log('Best Sellers:', verifyResult.data?.bestSellers?.productsCount?.count || 0, 'products');
  console.log('New Arrivals:', verifyResult.data?.newArrivals?.productsCount?.count || 0, 'products');

  console.log(`
Summary:
  Tagged as new-arrival: ${taggedNew}
  Tagged as best-seller: ${taggedBest}
  `);
}

main().catch(console.error);
