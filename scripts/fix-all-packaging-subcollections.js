#!/usr/bin/env node
/**
 * Fix all packaging subcollections by tagging products correctly
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function main() {
  console.log('Fetching all products...');

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

  console.log(`Found ${products.length} products\n`);

  // Find and tag products for each subcollection
  const subcollections = [
    {
      name: 'Mylar Bags',
      keywords: ['mylar', 'zipper bag', 'resealable bag'],
      tag: 'mylar'
    },
    {
      name: 'Joint Tubes',
      keywords: ['joint tube', 'doob tube', 'cone tube', 'pre-roll tube'],
      tag: 'joint tube'
    },
    {
      name: 'FEP Sheets',
      keywords: ['fep', 'clear sheet', 'clear roll'],
      excludeKeywords: ['ptfe'],
      tag: 'fep'
    },
    {
      name: 'PTFE Sheets',
      keywords: ['ptfe', 'teflon'],
      tag: 'ptfe'
    },
    {
      name: 'Parchment Paper',
      keywords: ['parchment', 'paper'],
      excludeKeywords: ['rolling paper'],
      tag: 'parchment'
    },
    {
      name: 'Glass Jars',
      keywords: ['glass jar', 'jar with lid', 'screw top jar', 'concentrate jar'],
      tag: 'jar'
    },
    {
      name: 'Rosin Extraction',
      keywords: ['rosin', 'press', 'extraction', 'purge'],
      tag: 'rosin'
    }
  ];

  for (const subcoll of subcollections) {
    const matching = products.filter(p => {
      const title = p.title.toLowerCase();
      const hasKeyword = subcoll.keywords.some(k => title.includes(k));
      const hasExclude = subcoll.excludeKeywords
        ? subcoll.excludeKeywords.some(k => title.includes(k))
        : false;
      return hasKeyword && !hasExclude;
    });

    if (matching.length > 0) {
      console.log(`\n${subcoll.name}: Found ${matching.length} products`);

      let fixed = 0;
      for (const product of matching) {
        const tags = Array.isArray(product.tags) ? product.tags : [];
        const hasTag = tags.some(t => t.toLowerCase() === subcoll.tag.toLowerCase());

        if (!hasTag) {
          const newTags = new Set(tags);
          newTags.add(subcoll.tag);

          try {
            await api.updateProduct(product.restId, {
              tags: [...newTags].join(', ')
            });
            fixed++;
          } catch (error) {
            console.log(`  [ERROR] ${product.title}: ${error.message}`);
          }
        }
      }

      if (fixed > 0) {
        console.log(`  Added "${subcoll.tag}" tag to ${fixed} products`);
      } else {
        console.log(`  All products already tagged`);
      }
    } else {
      console.log(`\n${subcoll.name}: No products found`);
    }
  }

  // Verify final counts
  console.log('\n' + '='.repeat(60));
  console.log('FINAL COUNTS');
  console.log('='.repeat(60));

  const verifyQuery = `
    query {
      extraction: collectionByHandle(handle: "extraction-packaging") {
        title
        productsCount { count }
      }
      siliconePads: collectionByHandle(handle: "silicone-pads") {
        title
        productsCount { count }
      }
      fepSheets: collectionByHandle(handle: "fep-sheets") {
        title
        productsCount { count }
      }
      ptfeSheets: collectionByHandle(handle: "ptfe-sheets") {
        title
        productsCount { count }
      }
      parchment: collectionByHandle(handle: "parchment-paper") {
        title
        productsCount { count }
      }
      glassJars: collectionByHandle(handle: "glass-jars") {
        title
        productsCount { count }
      }
      mylarBags: collectionByHandle(handle: "mylar-bags") {
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
    console.log('\n');
    for (const [key, val] of Object.entries(verifyResult.data)) {
      if (val) {
        console.log(`  ${val.title.padEnd(35)} ${val.productsCount?.count || 0} products`);
      }
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
