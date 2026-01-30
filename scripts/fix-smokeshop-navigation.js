#!/usr/bin/env node
/**
 * Fix smoke shop navigation - create clean high-level category collections
 * Remove granular brand filters, create logical product type categories
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

// High-level categories for smoke shop navigation
// Based on actual family tags found in product data
const CATEGORIES = [
  {
    handle: 'hand-pipes',
    title: 'Hand Pipes',
    description: 'Spoon pipes, character pipes, chillums & one-hitters',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'family:spoon-pipe' },
      { column: 'tag', relation: 'equals', condition: 'family:character-pipe' },
      { column: 'tag', relation: 'equals', condition: 'family:chillum-onehitter' },
      { column: 'tag', relation: 'equals', condition: 'family:steamroller' }
    ],
    disjunctive: true // OR logic - match any of these
  },
  {
    handle: 'bongs-water-pipes',
    title: 'Bongs & Water Pipes',
    description: 'Glass bongs, bubblers, and water filtration',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'family:glass-bong' },
      { column: 'tag', relation: 'equals', condition: 'family:bubbler' }
    ],
    disjunctive: true
  },
  {
    handle: 'dab-rigs',
    title: 'Dab Rigs',
    description: 'Glass and silicone rigs for concentrates',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'family:glass-rig' },
      { column: 'tag', relation: 'equals', condition: 'family:silicone-rig' }
    ],
    disjunctive: true
  },
  {
    handle: 'nectar-collectors',
    title: 'Nectar Collectors',
    description: 'Portable dab straws and collectors',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'family:nectar-collector' }
    ],
    disjunctive: false
  },
  {
    handle: 'dab-accessories',
    title: 'Dab Accessories',
    description: 'Carb caps, dab tools, bangers & torches',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'family:carb-cap' },
      { column: 'tag', relation: 'equals', condition: 'family:dab-tool' },
      { column: 'tag', relation: 'equals', condition: 'family:banger' },
      { column: 'tag', relation: 'equals', condition: 'family:banger-set' },
      { column: 'tag', relation: 'equals', condition: 'family:torch' }
    ],
    disjunctive: true
  },
  {
    handle: 'bowls-downstems',
    title: 'Bowls & Downstems',
    description: 'Flower bowls, downstems, and ash catchers',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'family:flower-bowl' },
      { column: 'tag', relation: 'equals', condition: 'family:downstem' },
      { column: 'tag', relation: 'equals', condition: 'family:ash-catcher' }
    ],
    disjunctive: true
  },
  {
    handle: 'rolling-papers',
    title: 'Rolling Papers & Trays',
    description: 'Papers, cones, and rolling trays',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'family:rolling-paper' },
      { column: 'tag', relation: 'equals', condition: 'family:rolling-tray' }
    ],
    disjunctive: true
  },
  {
    handle: 'grinders',
    title: 'Grinders',
    description: 'Herb grinders',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'family:grinder' }
    ],
    disjunctive: false
  }
];

async function main() {
  console.log('='.repeat(60));
  console.log('FIXING SMOKE SHOP NAVIGATION');
  console.log('Creating clean high-level category collections');
  console.log('='.repeat(60) + '\n');

  // Get existing smart collections
  const smart = await api.getCollections('smart');
  const existingCollections = new Map(
    smart.smart_collections.map(c => [c.handle, c])
  );

  for (const category of CATEGORIES) {
    console.log(`\nProcessing: ${category.title} (${category.handle})`);

    // Combine rules
    let allRules = [...category.rules];
    if (category.additionalRules) {
      allRules = [...allRules, ...category.additionalRules];
    }

    const existing = existingCollections.get(category.handle);

    if (existing) {
      // Update existing collection
      console.log('  Updating existing collection...');
      console.log('  Old rules:', JSON.stringify(existing.rules, null, 2).substring(0, 100));

      try {
        await api.updateSmartCollection(existing.id, {
          title: category.title,
          rules: allRules,
          disjunctive: category.disjunctive !== false
        });
        console.log('  [SUCCESS] Updated');
      } catch (error) {
        console.log('  [ERROR]', error.message);
      }
    } else {
      // Create new collection
      console.log('  Creating new collection...');
      try {
        await api.createSmartCollection({
          title: category.title,
          handle: category.handle,
          rules: allRules,
          disjunctive: category.disjunctive !== false
        });
        console.log('  [SUCCESS] Created');
      } catch (error) {
        console.log('  [ERROR]', error.message);
      }
    }
  }

  // Verify counts
  console.log('\n' + '='.repeat(60));
  console.log('VERIFICATION - Collection Product Counts');
  console.log('='.repeat(60) + '\n');

  const handles = CATEGORIES.map(c => c.handle);
  const queryParts = handles.map((h, i) =>
    `c${i}: collectionByHandle(handle: "${h}") { title productsCount { count } }`
  ).join('\n');

  const query = `query { ${queryParts} }`;
  const result = await api.graphqlQuery(query, {});

  if (result.data) {
    for (const [key, val] of Object.entries(result.data)) {
      if (val) {
        console.log(`  ${val.title.padEnd(30)} ${val.productsCount?.count || 0} products`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('DONE - Navigation categories are now set up');
  console.log('='.repeat(60));
}

main().catch(console.error);
