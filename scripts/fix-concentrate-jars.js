#!/usr/bin/env node
/**
 * Fix concentrate-jars collection
 * This collection had 304 clicks and 66K impressions but 0 products due to vendor restriction
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function main() {
  console.log('='.repeat(60));
  console.log('FIXING CONCENTRATE-JARS COLLECTION');
  console.log('Traffic: 304 clicks, 66,046 impressions (16 months)');
  console.log('='.repeat(60) + '\n');

  // Get concentrate-jars collection
  const smart = await api.getCollections('smart');
  const concentrateJars = smart.smart_collections.find(c => c.handle === 'concentrate-jars');

  if (!concentrateJars) {
    console.log('Collection not found!');
    return;
  }

  console.log('Current state:');
  console.log('  Title:', concentrateJars.title);
  console.log('  Rules:', JSON.stringify(concentrateJars.rules, null, 2));

  // Update to vendor-agnostic rules that match jars
  const newRules = [
    { column: 'tag', relation: 'equals', condition: 'family:container' }
  ];

  console.log('\nUpdating to:');
  console.log('  Rules:', JSON.stringify(newRules, null, 2));

  try {
    await api.updateSmartCollection(concentrateJars.id, {
      rules: newRules,
      disjunctive: false
    });
    console.log('\n[SUCCESS] Collection updated!');
  } catch (error) {
    console.log('\n[ERROR]', error.message);
  }

  // Verify
  const query = `
    query {
      collectionByHandle(handle: "concentrate-jars") {
        title
        productsCount { count }
      }
    }
  `;
  const result = await api.graphqlQuery(query, {});
  if (result.data && result.data.collectionByHandle) {
    console.log(`\nNew product count: ${result.data.collectionByHandle.productsCount?.count || 0}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('DONE');
  console.log('='.repeat(60));
}

main().catch(console.error);
