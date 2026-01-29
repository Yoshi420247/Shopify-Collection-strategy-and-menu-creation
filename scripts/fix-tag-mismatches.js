#!/usr/bin/env node
/**
 * Fix Tag Mismatches
 *
 * Fixes products that have incorrect family tags based on their titles
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function getAllProducts() {
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

  return products;
}

function determineCorrectFamily(title) {
  const t = title.toLowerCase();

  // Bangers and slurpers
  if (t.includes('banger') || t.includes('slurper') || t.includes('terp pearl') || t.includes('blender')) {
    return { family: 'banger', pillar: 'accessory', use: 'dabbing', material: 'quartz' };
  }

  // Silicone rigs
  if (t.includes('silicone') && t.includes('rig')) {
    return { family: 'silicone-rig', pillar: 'smokeshop-device', use: 'dabbing', material: 'silicone' };
  }

  // Glass rigs
  if (t.includes(' rig') && !t.includes('silicone') && !t.includes('trigger')) {
    if (t.includes('hybrid') || t.includes('glass')) {
      return { family: 'glass-rig', pillar: 'smokeshop-device', use: 'dabbing', material: 'glass' };
    }
    return { family: 'glass-rig', pillar: 'smokeshop-device', use: 'dabbing' };
  }

  // Carb caps
  if (t.includes('carb cap') || t.includes('spinner cap') || t.includes('bubble cap')) {
    return { family: 'carb-cap', pillar: 'accessory', use: 'dabbing' };
  }

  // Dab tools
  if (t.includes('dab tool') || t.includes('dabber') || t.includes('scoop tool')) {
    return { family: 'dab-tool', pillar: 'accessory', use: 'dabbing' };
  }

  return null;
}

async function fixProduct(product, correction) {
  const tags = Array.isArray(product.tags) ? product.tags : [];
  const newTags = new Set(tags.filter(t =>
    !t.startsWith('family:') &&
    !t.startsWith('pillar:') &&
    !t.startsWith('use:') &&
    !t.startsWith('material:')
  ));

  if (correction.family) newTags.add(`family:${correction.family}`);
  if (correction.pillar) newTags.add(`pillar:${correction.pillar}`);
  if (correction.use) newTags.add(`use:${correction.use}`);
  if (correction.material) newTags.add(`material:${correction.material}`);

  try {
    await api.updateProduct(product.restId, {
      tags: [...newTags].join(', ')
    });
    return true;
  } catch (error) {
    console.log(`  [ERROR] ${product.title}: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('FIXING TAG MISMATCHES');
  console.log('='.repeat(60));

  const products = await getAllProducts();
  console.log(`\nAnalyzing ${products.length} products...`);

  let fixed = 0;
  let errors = 0;

  for (const product of products) {
    const title = (product.title || '').toLowerCase();
    const tags = Array.isArray(product.tags) ? product.tags : [];
    const familyTag = tags.find(t => t.startsWith('family:'));
    const currentFamily = familyTag ? familyTag.replace('family:', '') : null;

    // Check if this product needs fixing
    const correction = determineCorrectFamily(product.title);

    if (!correction) continue;

    // Only fix if current family is wrong
    if (currentFamily !== correction.family) {
      console.log(`\n[FIX] ${product.title}`);
      console.log(`  From: family:${currentFamily}`);
      console.log(`  To: family:${correction.family}`);

      const success = await fixProduct(product, correction);
      if (success) {
        fixed++;
      } else {
        errors++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log(`Fixed: ${fixed}`);
  console.log(`Errors: ${errors}`);
  console.log('\nDone!');
}

main().catch(console.error);
