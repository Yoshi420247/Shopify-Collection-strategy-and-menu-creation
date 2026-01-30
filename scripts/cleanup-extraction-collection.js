#!/usr/bin/env node
/**
 * Clean up Extraction & Packaging collection
 * Remove smokeshop items that don't belong there
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

// Items that SHOULD be in extraction/packaging
const PACKAGING_KEYWORDS = [
  'pad', 'mat', 'slick', 'fep', 'ptfe', 'parchment', 'mylar', 'bag',
  'jar', 'container', 'syringe', 'vial', 'sticker', 'box', 'lid',
  'sheet', 'roll', 'wrap', 'foil', 'canvas', 'paper for rosin',
  'non-stick', 'nonstick', 'clear slick', 'oil slick'
];

// Items that should NOT be in extraction/packaging (they're smokeshop)
const SMOKESHOP_KEYWORDS = [
  'bong', 'water pipe', 'dab rig', 'rig', 'pipe', 'bubbler',
  'nectar collector', 'nectar straw', 'chillum', 'one hitter',
  'rolling paper', 'cone', 'rolling tray', 'grinder', 'torch',
  'banger', 'carb cap', 'dab tool', 'dabber', 'bowl', 'slide',
  'ash catcher', 'downstem', 'steamroller', 'sherlock', 'spoon'
];

// Oil Slick vendor products are ALWAYS packaging (except water pipes)
const OIL_SLICK_SMOKESHOP = ['water pipe', 'bubbler', 'pipe', 'bong'];

async function main() {
  console.log('Cleaning up Extraction & Packaging collection...\n');

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

  // Find products with pillar:packaging that shouldn't have it
  const packagingProducts = products.filter(p => {
    const tags = Array.isArray(p.tags) ? p.tags : [];
    return tags.some(t => t === 'pillar:packaging');
  });

  console.log(`Products with pillar:packaging: ${packagingProducts.length}\n`);

  const needsFixing = [];

  for (const product of packagingProducts) {
    const title = product.title.toLowerCase();
    const vendor = product.vendor.toLowerCase();
    const tags = Array.isArray(product.tags) ? product.tags : [];

    // Check if this is a smokeshop item
    let isSmokeshop = false;
    let reason = '';

    // Check smokeshop keywords
    for (const keyword of SMOKESHOP_KEYWORDS) {
      if (title.includes(keyword)) {
        // Make sure it's not actually a packaging item
        const isActuallyPackaging = PACKAGING_KEYWORDS.some(pk => title.includes(pk));

        // Special case: "parchment" is packaging, "rolling paper" is smokeshop
        if (keyword === 'rolling paper' || keyword === 'cone' || keyword === 'rolling tray') {
          isSmokeshop = true;
          reason = keyword;
          break;
        }

        // Special case: Oil Slick products
        if (vendor === 'oil slick') {
          if (OIL_SLICK_SMOKESHOP.some(sk => title.includes(sk))) {
            isSmokeshop = true;
            reason = `Oil Slick ${keyword}`;
            break;
          }
        } else if (!isActuallyPackaging) {
          isSmokeshop = true;
          reason = keyword;
          break;
        }
      }
    }

    if (isSmokeshop) {
      needsFixing.push({ product, reason });
    }
  }

  console.log(`Products that need to be moved to smokeshop: ${needsFixing.length}\n`);

  if (needsFixing.length > 0) {
    console.log('Products to fix:');
    for (const { product, reason } of needsFixing.slice(0, 30)) {
      console.log(`  [${product.vendor}] ${product.title.substring(0, 50)}`);
      console.log(`    Reason: contains "${reason}"`);
    }
    if (needsFixing.length > 30) {
      console.log(`  ... and ${needsFixing.length - 30} more`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('FIXING PRODUCTS...');
    console.log('='.repeat(60));

    let fixed = 0;
    for (const { product, reason } of needsFixing) {
      const title = product.title.toLowerCase();
      const tags = Array.isArray(product.tags) ? product.tags : [];

      // Determine correct pillar
      let newPillar = 'pillar:smokeshop-device';
      let newFamily = null;
      let newUse = null;

      // Determine family based on product type
      if (title.includes('rolling paper') || title.includes('cone') || title.includes('wrap')) {
        newPillar = 'pillar:accessory';
        newFamily = 'family:rolling-paper';
        newUse = 'use:rolling';
      } else if (title.includes('rolling tray') || title.includes('tray')) {
        newPillar = 'pillar:accessory';
        newFamily = 'family:rolling-tray';
        newUse = 'use:rolling';
      } else if (title.includes('grinder')) {
        newPillar = 'pillar:accessory';
        newFamily = 'family:grinder';
        newUse = 'use:preparation';
      } else if (title.includes('torch')) {
        newPillar = 'pillar:accessory';
        newFamily = 'family:torch';
        newUse = 'use:dabbing';
      } else if (title.includes('banger') || title.includes('slurper')) {
        newPillar = 'pillar:accessory';
        newFamily = 'family:banger';
        newUse = 'use:dabbing';
      } else if (title.includes('carb cap')) {
        newPillar = 'pillar:accessory';
        newFamily = 'family:carb-cap';
        newUse = 'use:dabbing';
      } else if (title.includes('dab tool') || title.includes('dabber')) {
        newPillar = 'pillar:accessory';
        newFamily = 'family:dab-tool';
        newUse = 'use:dabbing';
      } else if (title.includes('bong') || title.includes('water pipe') || title.includes('beaker')) {
        newFamily = 'family:glass-bong';
        newUse = 'use:flower-smoking';
      } else if (title.includes('rig') || title.includes('recycler')) {
        newFamily = 'family:glass-rig';
        newUse = 'use:dabbing';
      } else if (title.includes('bubbler')) {
        newFamily = 'family:bubbler';
        newUse = 'use:flower-smoking';
      } else if (title.includes('pipe') || title.includes('spoon')) {
        newFamily = 'family:spoon-pipe';
        newUse = 'use:flower-smoking';
      } else if (title.includes('nectar')) {
        newFamily = 'family:nectar-collector';
        newUse = 'use:dabbing';
      }

      // Build new tags
      const newTags = new Set(tags.filter(t =>
        !t.startsWith('pillar:') &&
        (newFamily ? !t.startsWith('family:') : true) &&
        (newUse ? !t.startsWith('use:') : true)
      ));

      newTags.add(newPillar);
      if (newFamily) newTags.add(newFamily);
      if (newUse) newTags.add(newUse);

      // Remove packaging-specific tags
      newTags.delete('Silicone Pad');
      newTags.delete('dabpad');
      newTags.delete('Dab Pads');

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

    console.log(`\nFixed ${fixed} products`);
  }

  // Verify final count
  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION');
  console.log('='.repeat(60));

  const verifyQuery = `
    query {
      extraction: collectionByHandle(handle: "extraction-packaging") {
        title
        productsCount { count }
      }
      smokeVape: collectionByHandle(handle: "smoke-and-vape") {
        title
        productsCount { count }
      }
      accessories: collectionByHandle(handle: "accessories") {
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
