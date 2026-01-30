#!/usr/bin/env node
/**
 * Fix parchment paper collection to exclude rolling papers
 * and ensure rolling papers has its own proper collection
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function main() {
  console.log('='.repeat(60));
  console.log('FIXING PARCHMENT & ROLLING PAPER COLLECTIONS');
  console.log('='.repeat(60) + '\n');

  const smart = await api.getCollections('smart');

  // 1. Fix Parchment Paper collection
  // Use pillar:packaging AND use:extraction to get only extraction parchment
  const parchment = smart.smart_collections.find(c => c.handle === 'parchment-paper');

  console.log('Fixing parchment-paper collection...');

  // The key is to match ONLY extraction supplies, not rolling papers
  // Products like "Oil Slick Paper" have family:extraction-supply
  // Rolling papers have family:rolling-paper
  const parchmentRules = [
    { column: 'tag', relation: 'equals', condition: 'use:extraction' }
  ];

  await api.updateSmartCollection(parchment.id, {
    title: 'Parchment Paper & PTFE',
    rules: parchmentRules,
    disjunctive: false
  });

  console.log('[SUCCESS] Updated parchment-paper to use:extraction only\n');

  // 2. Make sure rolling-papers collection exists and is smoke-shop focused
  const rolling = smart.smart_collections.find(c => c.handle === 'rolling-papers');

  if (rolling) {
    console.log('Updating rolling-papers collection...');

    // Rolling papers for smoke shop - papers and trays
    const rollingRules = [
      { column: 'tag', relation: 'equals', condition: 'family:rolling-paper' },
      { column: 'tag', relation: 'equals', condition: 'family:rolling-tray' }
    ];

    await api.updateSmartCollection(rolling.id, {
      title: 'Rolling Papers & Trays',
      rules: rollingRules,
      disjunctive: true  // Match either
    });

    console.log('[SUCCESS] Updated rolling-papers collection\n');
  }

  // 3. Create a dedicated "Rolling Supplies" collection for smoke shop if needed
  const existingRolling = smart.smart_collections.find(c => c.handle === 'rolling-supplies');

  if (!existingRolling) {
    console.log('Creating rolling-supplies collection...');

    try {
      await api.createSmartCollection({
        title: 'Rolling Supplies',
        handle: 'rolling-supplies',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:rolling-paper' },
          { column: 'tag', relation: 'equals', condition: 'family:rolling-tray' },
          { column: 'tag', relation: 'equals', condition: 'use:rolling' }
        ],
        disjunctive: true
      });
      console.log('[SUCCESS] Created rolling-supplies collection\n');
    } catch (error) {
      console.log('[INFO] rolling-supplies may already exist\n');
    }
  }

  // Wait for Shopify to process
  await new Promise(r => setTimeout(r, 3000));

  // Verify
  console.log('='.repeat(60));
  console.log('VERIFICATION');
  console.log('='.repeat(60) + '\n');

  const verifyQuery = `
    query {
      parchment: collectionByHandle(handle: "parchment-paper") {
        title
        productsCount { count }
      }
      rolling: collectionByHandle(handle: "rolling-papers") {
        title
        productsCount { count }
      }
      rollingSupplies: collectionByHandle(handle: "rolling-supplies") {
        title
        productsCount { count }
      }
    }
  `;

  const result = await api.graphqlQuery(verifyQuery, {});

  console.log('Collection counts:');
  if (result.data?.parchment) {
    console.log(`  ${result.data.parchment.title}: ${result.data.parchment.productsCount?.count || 0} products`);
  }
  if (result.data?.rolling) {
    console.log(`  ${result.data.rolling.title}: ${result.data.rolling.productsCount?.count || 0} products`);
  }
  if (result.data?.rollingSupplies) {
    console.log(`  ${result.data.rollingSupplies.title}: ${result.data.rollingSupplies.productsCount?.count || 0} products`);
  }

  // Check parchment contents
  console.log('\nParchment Paper collection sample:');
  const parchmentQuery = `
    query {
      collectionByHandle(handle: "parchment-paper") {
        products(first: 10) {
          edges {
            node {
              title
            }
          }
        }
      }
    }
  `;

  const parchmentResult = await api.graphqlQuery(parchmentQuery, {});
  for (const p of parchmentResult.data?.collectionByHandle?.products?.edges || []) {
    console.log('  -', p.node.title.substring(0, 50));
  }
}

main().catch(console.error);
