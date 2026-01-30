#!/usr/bin/env node
/**
 * Fix silicone-pipes collection - critical for SEO
 * This was the #1 traffic page and needs to show all silicone products
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function main() {
  console.log('='.repeat(60));
  console.log('FIXING SILICONE-PIPES COLLECTION');
  console.log('='.repeat(60));

  // Get the collection
  const smart = await api.getCollections('smart');
  const siliconePipes = smart.smart_collections.find(c => c.handle === 'silicone-pipes');

  if (!siliconePipes) {
    console.log('Collection not found!');
    return;
  }

  console.log('\nCurrent state:');
  console.log('  Title:', siliconePipes.title);
  console.log('  Rules:', JSON.stringify(siliconePipes.rules, null, 2));

  // Update to match ALL silicone smoking devices (vendor-agnostic)
  // Just require material:silicone tag - this will include all silicone rigs, pipes, bubblers
  const newRules = [
    { column: 'tag', relation: 'equals', condition: 'material:silicone' }
  ];

  console.log('\nUpdating to:');
  console.log('  Title: Silicone Pipes & Rigs');
  console.log('  Rules:', JSON.stringify(newRules, null, 2));

  try {
    await api.updateSmartCollection(siliconePipes.id, {
      title: 'Silicone Pipes & Rigs',
      rules: newRules,
      disjunctive: false
    });
    console.log('\n[SUCCESS] Collection updated!');
  } catch (error) {
    console.log('\n[ERROR]', error.message);
  }

  // Verify the count
  console.log('\nVerifying...');

  const query = `
    query {
      collectionByHandle(handle: "silicone-pipes") {
        title
        handle
        productsCount { count }
      }
    }
  `;

  const result = await api.graphqlQuery(query, {});
  if (result.data && result.data.collectionByHandle) {
    const c = result.data.collectionByHandle;
    console.log(`\n${c.title}: ${c.productsCount?.count || 0} products`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('DONE - Your #1 traffic page should now show all silicone products');
  console.log('='.repeat(60));
}

main().catch(console.error);
