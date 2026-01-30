/**
 * Remove Vendor Restrictions from Collections
 *
 * Removes the "vendor equals What You Need" rule from all collections
 * so that products from all vendors appear in appropriate collections.
 */

import 'dotenv/config';
import * as api from './shopify-api.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAllSmartCollections() {
  let collections = [];
  let sinceId = 0;

  while (true) {
    const data = await api.get(`smart_collections.json?limit=250&since_id=${sinceId}`);
    if (!data.smart_collections || data.smart_collections.length === 0) break;
    collections = collections.concat(data.smart_collections);
    sinceId = data.smart_collections[data.smart_collections.length - 1].id;
    if (data.smart_collections.length < 250) break;
  }

  return collections;
}

async function removeVendorRestriction(collection) {
  // Find vendor restriction rules
  const vendorRules = collection.rules.filter(
    r => r.column === 'vendor' && r.relation === 'equals'
  );

  if (vendorRules.length === 0) {
    return { modified: false, reason: 'No vendor restriction' };
  }

  // Remove vendor rules
  const newRules = collection.rules.filter(
    r => !(r.column === 'vendor' && r.relation === 'equals')
  );

  // Don't leave collection with zero rules
  if (newRules.length === 0) {
    return { modified: false, reason: 'Would leave collection with no rules' };
  }

  await api.updateSmartCollection(collection.id, {
    rules: newRules,
    disjunctive: collection.disjunctive || false
  });

  return { modified: true, removedVendors: vendorRules.map(r => r.condition) };
}

async function main() {
  console.log('='.repeat(70));
  console.log('REMOVE VENDOR RESTRICTIONS FROM COLLECTIONS');
  console.log('='.repeat(70));

  console.log('\nFetching all smart collections...');
  const collections = await getAllSmartCollections();
  console.log(`Found ${collections.length} collections\n`);

  // Find collections with vendor restrictions
  const vendorRestricted = collections.filter(c =>
    c.rules.some(r => r.column === 'vendor' && r.relation === 'equals')
  );

  console.log(`Collections with vendor restrictions: ${vendorRestricted.length}\n`);

  let modified = 0;
  let skipped = 0;
  let failed = 0;

  for (const collection of vendorRestricted) {
    console.log(`Processing: ${collection.title}`);

    try {
      const result = await removeVendorRestriction(collection);

      if (result.modified) {
        console.log(`  ✓ Removed vendor restriction: ${result.removedVendors.join(', ')}`);
        modified++;
      } else {
        console.log(`  - Skipped: ${result.reason}`);
        skipped++;
      }

      await sleep(350);
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Modified: ${modified}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
