/**
 * Fix OR-Logic Collection Rules
 *
 * Updates collection rules to match actual product tags
 */

import 'dotenv/config';
import * as api from './shopify-api.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fix collections to match actual product tags
const fixes = [
  {
    name: 'Silicone Pads & Mats',
    newRules: [
      { column: 'tag', relation: 'equals', condition: 'Silicone Pad' },
      { column: 'tag', relation: 'equals', condition: 'dabpad' },
      { column: 'tag', relation: 'equals', condition: 'Dab Pads' }
    ],
    disjunctive: true
  },
  {
    name: 'Parchment Paper',
    newRules: [
      { column: 'tag', relation: 'equals', condition: 'paper' },
      { column: 'title', relation: 'contains', condition: 'parchment' }
    ],
    disjunctive: true
  }
];

async function main() {
  console.log('='.repeat(70));
  console.log('FIX OR-LOGIC COLLECTION RULES');
  console.log('='.repeat(70));

  const data = await api.get('smart_collections.json?limit=250');
  const collections = data.smart_collections || [];

  for (const fix of fixes) {
    const col = collections.find(c => c.title === fix.name);
    if (!col) {
      console.log(`\n${fix.name}: NOT FOUND`);
      continue;
    }

    console.log(`\nUpdating ${fix.name}...`);
    console.log('  Old rules:', JSON.stringify(col.rules));

    await api.updateSmartCollection(col.id, {
      rules: fix.newRules,
      disjunctive: fix.disjunctive
    });

    console.log('  New rules:', JSON.stringify(fix.newRules));
    console.log('  ✓ Updated');
    await sleep(500);
  }

  // Verify the collections now have products
  console.log('\n' + '='.repeat(70));
  console.log('VERIFYING COLLECTIONS');
  console.log('='.repeat(70));

  for (const fix of fixes) {
    const col = collections.find(c => c.title === fix.name);
    if (col) {
      await sleep(1000); // Wait for Shopify to reindex
      const products = await api.get(`collections/${col.id}/products.json?limit=10`);
      console.log(`${fix.name}: ${products.products?.length || 0} products`);
    }
  }
}

main().catch(console.error);
