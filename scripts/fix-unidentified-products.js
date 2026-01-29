#!/usr/bin/env node
/**
 * Fix Unidentified Products
 * Handles box sets, bulk cases, and specialty items that were not identified
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';
import { config } from '../src/config.js';

// Additional rules for unidentified products
const ADDITIONAL_RULES = [
  // Box Sets - dab accessories
  {
    match: (title) => title.includes('set') || title.includes('gavel') || title.includes('blender') ||
                      title.includes('slurper') || title.includes('charmer') || title.includes('encalmo'),
    family: 'banger',
    pillar: 'accessory',
    use: 'dabbing',
    productType: 'Banger Set'
  },
  // Tweezers - dab tools
  {
    match: (title) => title.includes('tweezer'),
    family: 'dab-tool',
    pillar: 'accessory',
    use: 'dabbing',
    productType: 'Dab Tool'
  },
  // Digital Scales
  {
    match: (title) => title.includes('scale') || title.includes('digital'),
    family: 'scale',
    pillar: 'accessory',
    use: 'preparation',
    productType: 'Scale'
  },
  // Cartridges
  {
    match: (title) => title.includes('cartridge') || title.includes('cart'),
    family: 'vape-cartridge',
    pillar: 'accessory',
    use: 'vaping',
    productType: 'Vape Cartridge'
  },
  // Water pipes / rigs - XL Tube, Rick, Tycoon, etc
  {
    match: (title) => title.includes('water pipe') || title.includes('rig') || title.includes('tycoon') ||
                      title.includes('rick') || title.includes('tube style'),
    family: 'glass-bong',
    pillar: 'smokeshop-device',
    use: 'flower-smoking',
    productType: 'Water Pipe',
    checkDab: true // Check if it's actually a dab rig
  },
  // Bulk cases
  {
    match: (title) => title.includes('bulk') || title.includes('case'),
    family: 'bulk-item',
    pillar: 'wholesale',
    use: 'retail',
    productType: 'Bulk Item'
  },
  // Tassel (usually dab tool accessory)
  {
    match: (title) => title.includes('tassel'),
    family: 'dab-tool',
    pillar: 'accessory',
    use: 'dabbing',
    productType: 'Dab Tool Accessory'
  }
];

async function fetchUnidentifiedProducts() {
  console.log('Fetching products that may need fixing...');

  const query = `
    query($cursor: String) {
      products(first: 250, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            handle
            vendor
            productType
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
      const batch = result.data.products.edges.map(edge => ({
        ...edge.node,
        restId: edge.node.id.replace('gid://shopify/Product/', '')
      }));
      products.push(...batch);
      hasNextPage = result.data.products.pageInfo.hasNextPage;
      cursor = result.data.products.pageInfo.endCursor;
      console.log(`  Fetched ${products.length} products...`);
    } else {
      hasNextPage = false;
    }
  }

  // Filter to products without proper family tags or with wrong product type
  const needsFixing = products.filter(p => {
    const tags = Array.isArray(p.tags) ? p.tags : (p.tags || '').split(',');
    const hasFamily = tags.some(t => t.trim().startsWith('family:'));
    const badType = !p.productType || p.productType === 'What You Need' ||
                    p.productType === 'Cloud YHS' || p.productType === 'Oil Slick';
    return !hasFamily || badType;
  });

  console.log(`Found ${needsFixing.length} products needing fixes`);
  return needsFixing;
}

function analyzeUnidentifiedProduct(product) {
  const title = (product.title || '').toLowerCase();

  // Check for dab rig indicators
  const isDabRig = title.includes('rig') && !title.includes('water pipe') &&
                   (title.includes('dab') || title.includes('oil') || title.includes('concentrate') ||
                    title.match(/\b[567]"/i) || title.includes('mini') || title.includes('recycler'));

  for (const rule of ADDITIONAL_RULES) {
    if (rule.match(title)) {
      const result = { ...rule };

      // Adjust for dab rigs
      if (rule.checkDab && isDabRig) {
        result.family = 'glass-rig';
        result.use = 'dabbing';
        result.productType = 'Dab Rig';
      }

      return result;
    }
  }

  return null;
}

async function fixProduct(product, analysis) {
  const tags = Array.isArray(product.tags) ? product.tags : (product.tags || '').split(',').map(t => t.trim());
  const newTags = new Set(tags.filter(t => t && !t.startsWith('family:') && !t.startsWith('pillar:') && !t.startsWith('use:')));

  if (analysis.family) newTags.add(`family:${analysis.family}`);
  if (analysis.pillar) newTags.add(`pillar:${analysis.pillar}`);
  if (analysis.use) newTags.add(`use:${analysis.use}`);

  const updates = {
    tags: [...newTags].join(', ')
  };

  if (analysis.productType) {
    updates.product_type = analysis.productType;
  }

  try {
    await api.updateProduct(product.restId, updates);
    return { success: true };
  } catch (error) {
    return { error: error.message };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('FIX UNIDENTIFIED PRODUCTS');
  console.log('='.repeat(60));

  const products = await fetchUnidentifiedProducts();

  let fixed = 0;
  let skipped = 0;
  let errors = 0;
  const stillUnidentified = [];

  for (const product of products) {
    const analysis = analyzeUnidentifiedProduct(product);

    if (!analysis) {
      stillUnidentified.push(product);
      skipped++;
      continue;
    }

    const result = await fixProduct(product, analysis);
    if (result.success) {
      console.log(`  [FIXED] ${product.title} -> ${analysis.productType}`);
      fixed++;
    } else {
      console.log(`  [ERROR] ${product.title}: ${result.error}`);
      errors++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log(`Fixed: ${fixed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);

  if (stillUnidentified.length > 0) {
    console.log(`\nStill unidentified (${stillUnidentified.length}):`);
    for (const p of stillUnidentified.slice(0, 30)) {
      console.log(`  - [${p.vendor}] ${p.title}`);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
