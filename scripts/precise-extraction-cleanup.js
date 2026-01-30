#!/usr/bin/env node
/**
 * Precisely clean up Extraction & Packaging collection
 * Only keep actual extraction/lab/packaging supplies
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

// These product types belong in Extraction & Packaging
const EXTRACTION_TYPES = [
  'silicone pad', 'slick pad', 'dab pad', 'dab mat',
  'fep', 'ptfe', 'parchment',
  'glass jar', 'concentrate jar', 'storage jar',
  'concentrate container', 'silicone container', 'slick stack',
  'mylar bag', 'zipper bag',
  'joint tube', 'doob tube', 'pre-roll tube',
  'syringe',
  'sticker', 'custom packaging', 'box',
  'oil slick', 'slick duo', 'slick slab', 'canvas',
  'shield', 'wrap', 'pack-it', 'clear roll', 'clear sheet'
];

// These product types do NOT belong in Extraction & Packaging
const NOT_EXTRACTION = [
  'rolling tray', 'tray',  // Accessory
  'rolling paper', 'paper', 'cone', 'pre-rolled cone', 'fatty cone', // Rolling accessory
  'bong', 'water pipe', 'beaker', 'straight tube',  // Smokeshop device
  'dab rig', 'rig', 'recycler', 'incycler',  // Smokeshop device
  'pipe', 'spoon', 'sherlock', 'steamroller', 'chillum',  // Smokeshop device
  'bubbler', 'hammer',  // Smokeshop device
  'nectar collector', 'nectar straw',  // Smokeshop device
  'grinder',  // Accessory
  'torch', 'lighter',  // Accessory
  'banger', 'slurper', 'nail',  // Accessory
  'carb cap', 'spinner',  // Accessory
  'dab tool', 'dabber',  // Accessory
  'bowl', 'slide',  // Accessory
  'ash catcher', 'downstem', 'adapter'  // Accessory
];

async function main() {
  console.log('Precisely cleaning Extraction & Packaging collection...\n');

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

  // Get products currently in extraction/packaging (pillar:packaging)
  const packagingProducts = products.filter(p => {
    const tags = Array.isArray(p.tags) ? p.tags : [];
    return tags.some(t => t === 'pillar:packaging');
  });

  console.log(`Products with pillar:packaging: ${packagingProducts.length}\n`);

  // Check each one
  const toRemove = [];
  const toKeep = [];

  for (const product of packagingProducts) {
    const title = product.title.toLowerCase();
    const vendor = product.vendor;

    // Check if it should NOT be in extraction
    let shouldRemove = false;
    let reason = '';

    for (const notType of NOT_EXTRACTION) {
      // Special handling to avoid false positives
      if (notType === 'paper' && title.includes('parchment')) continue;
      if (notType === 'paper' && title.includes('rosin')) continue;
      if (notType === 'tray' && title.includes('rolling tray')) {
        shouldRemove = true;
        reason = 'rolling tray';
        break;
      }
      if (notType === 'cone' && title.includes('silicone')) continue; // sili-cone
      if (notType === 'cone' && title.includes('fits') && title.includes('cones')) continue; // tube that fits cones

      // Check for exact match patterns
      if (notType === 'rolling paper' && (title.includes('rolling paper') || title.includes('hemp wrap'))) {
        shouldRemove = true;
        reason = 'rolling paper';
        break;
      }
      if (notType === 'pre-rolled cone' && title.includes('pre-rolled') && title.includes('cone')) {
        shouldRemove = true;
        reason = 'pre-rolled cone';
        break;
      }
      if (notType === 'fatty cone' && title.includes('fatty') && title.includes('cone')) {
        shouldRemove = true;
        reason = 'fatty cone';
        break;
      }

      // Generic check
      if (title.includes(notType) && !['paper', 'cone', 'tray'].includes(notType)) {
        shouldRemove = true;
        reason = notType;
        break;
      }
    }

    if (shouldRemove) {
      toRemove.push({ product, reason });
    } else {
      toKeep.push(product);
    }
  }

  console.log(`Products to KEEP in Extraction & Packaging: ${toKeep.length}`);
  console.log(`Products to REMOVE from Extraction & Packaging: ${toRemove.length}\n`);

  if (toRemove.length > 0) {
    console.log('Products to remove:');
    for (const { product, reason } of toRemove) {
      console.log(`  [${product.vendor}] ${product.title.substring(0, 50)}`);
      console.log(`    Reason: ${reason}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('REMOVING FROM EXTRACTION/PACKAGING...');
    console.log('='.repeat(60));

    let fixed = 0;
    for (const { product, reason } of toRemove) {
      const title = product.title.toLowerCase();
      const tags = Array.isArray(product.tags) ? product.tags : [];

      // Determine correct pillar and family
      let newPillar = 'pillar:accessory';
      let newFamily = 'family:rolling-tray';
      let newUse = 'use:rolling';

      if (reason.includes('rolling tray') || reason.includes('tray')) {
        newFamily = 'family:rolling-tray';
        newUse = 'use:rolling';
      } else if (reason.includes('rolling paper') || reason.includes('cone')) {
        newFamily = 'family:rolling-paper';
        newUse = 'use:rolling';
      } else if (reason.includes('bong') || reason.includes('water pipe') || reason.includes('tube')) {
        newPillar = 'pillar:smokeshop-device';
        newFamily = 'family:glass-bong';
        newUse = 'use:flower-smoking';
      } else if (reason.includes('rig')) {
        newPillar = 'pillar:smokeshop-device';
        newFamily = 'family:glass-rig';
        newUse = 'use:dabbing';
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
        fixed++;
        console.log(`  [FIXED] ${product.title.substring(0, 50)}`);
      } catch (error) {
        console.log(`  [ERROR] ${product.title}: ${error.message}`);
      }
    }

    console.log(`\nRemoved ${fixed} products from Extraction & Packaging`);
  }

  // Final verification
  console.log('\n' + '='.repeat(60));
  console.log('FINAL VERIFICATION');
  console.log('='.repeat(60));

  const verifyQuery = `
    query {
      extraction: collectionByHandle(handle: "extraction-packaging") {
        title
        productsCount { count }
      }
      accessories: collectionByHandle(handle: "accessories") {
        title
        productsCount { count }
      }
      rollingPapers: collectionByHandle(handle: "rolling-papers") {
        title
        productsCount { count }
      }
      trays: collectionByHandle(handle: "trays-work-surfaces") {
        title
        productsCount { count }
      }
    }
  `;

  const verifyResult = await api.graphqlQuery(verifyQuery, {});
  if (verifyResult.data) {
    console.log('\n');
    for (const val of Object.values(verifyResult.data)) {
      if (val) {
        console.log(`  ${val.title.padEnd(35)} ${val.productsCount?.count || 0} products`);
      }
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
