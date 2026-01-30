#!/usr/bin/env node
/**
 * Remove vendor restrictions from ALL smart collections
 * This makes collections vendor-agnostic so products from all vendors appear
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function main() {
  console.log('='.repeat(60));
  console.log('REMOVING VENDOR RESTRICTIONS FROM ALL COLLECTIONS');
  console.log('='.repeat(60) + '\n');

  const smart = await api.getCollections('smart');

  let fixed = 0;
  let skipped = 0;

  for (const collection of smart.smart_collections) {
    const hasVendorRule = collection.rules?.some(r => r.column === 'vendor');

    if (!hasVendorRule) {
      skipped++;
      continue;
    }

    // Remove vendor rules, keep other rules
    const newRules = collection.rules.filter(r => r.column !== 'vendor');

    if (newRules.length === 0) {
      console.log(`[SKIP] ${collection.handle} - would have no rules after removing vendor`);
      skipped++;
      continue;
    }

    console.log(`Fixing: ${collection.handle}`);
    console.log(`  Old rules: ${collection.rules.length} (including vendor)`);
    console.log(`  New rules: ${newRules.length}`);

    try {
      await api.updateSmartCollection(collection.id, {
        rules: newRules
      });
      console.log(`  [SUCCESS] Updated\n`);
      fixed++;
    } catch (error) {
      console.log(`  [ERROR] ${error.message}\n`);
    }
  }

  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`
Fixed: ${fixed}
Skipped: ${skipped}
Total: ${smart.smart_collections.length}
  `);

  // Verify counts for previously empty collections
  console.log('Verifying previously problematic collections...\n');

  const checkHandles = ['ashtrays', 'electric-grinders', 'joint-tubes', 'papers', 'steamrollers'];
  const queryParts = checkHandles.map((h, i) =>
    `c${i}: collectionByHandle(handle: "${h}") { title handle productsCount { count } }`
  ).join('\n');

  const query = `query { ${queryParts} }`;
  const result = await api.graphqlQuery(query, {});

  if (result.data) {
    for (const val of Object.values(result.data)) {
      if (val) {
        console.log(`  ${val.title.padEnd(25)} ${val.productsCount?.count || 0} products`);
      }
    }
  }
}

main().catch(console.error);
