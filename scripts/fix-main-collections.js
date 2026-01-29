#!/usr/bin/env node
/**
 * Fix Main Collections
 *
 * Updates the main collections to use tag-based rules instead of vendor rules
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

// Collections to fix with proper tag-based rules
const COLLECTION_FIXES = {
  'smoke-and-vape': {
    rules: [
      { column: 'tag', relation: 'equals', condition: 'pillar:smokeshop-device' },
    ],
    disjunctive: true
  },
  'extraction-packaging': {
    rules: [
      { column: 'tag', relation: 'equals', condition: 'pillar:packaging' },
    ],
    disjunctive: true
  },
  'all': {
    // All products - no vendor filter, just include everything
    rules: [
      { column: 'tag', relation: 'contains', condition: 'family:' },
    ],
    disjunctive: true
  },
  'accessories': {
    rules: [
      { column: 'tag', relation: 'equals', condition: 'pillar:accessory' },
    ],
    disjunctive: false
  }
};

async function main() {
  console.log('='.repeat(60));
  console.log('FIXING MAIN COLLECTIONS');
  console.log('='.repeat(60));

  // Get all smart collections
  const result = await api.getCollections('smart');
  const collections = result.smart_collections || [];

  console.log(`\nFound ${collections.length} smart collections`);

  for (const [handle, fix] of Object.entries(COLLECTION_FIXES)) {
    const collection = collections.find(c => c.handle === handle);

    if (!collection) {
      console.log(`\n[SKIP] ${handle} - not found`);
      continue;
    }

    console.log(`\n[UPDATE] ${collection.title} (${handle})`);
    console.log(`  Current rules: ${JSON.stringify(collection.rules)}`);
    console.log(`  New rules: ${JSON.stringify(fix.rules)}`);

    try {
      await api.updateSmartCollection(collection.id, {
        rules: fix.rules,
        disjunctive: fix.disjunctive
      });
      console.log(`  [SUCCESS] Updated!`);
    } catch (error) {
      console.log(`  [ERROR] ${error.message}`);
    }
  }

  // Now let's check what tags products actually have
  console.log('\n' + '='.repeat(60));
  console.log('CHECKING PRODUCT TAGS');
  console.log('='.repeat(60));

  const query = `
    query {
      products(first: 20) {
        edges {
          node {
            title
            vendor
            tags
          }
        }
      }
    }
  `;

  const prodResult = await api.graphqlQuery(query, {});
  if (prodResult.data && prodResult.data.products) {
    console.log('\nSample product tags:');
    for (const edge of prodResult.data.products.edges.slice(0, 10)) {
      const p = edge.node;
      console.log(`\n  ${p.title} [${p.vendor}]`);
      const tags = Array.isArray(p.tags) ? p.tags : [];
      const relevantTags = tags.filter(t => t.startsWith('family:') || t.startsWith('pillar:') || t.startsWith('use:'));
      console.log(`    Tags: ${relevantTags.join(', ') || 'none'}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('DONE');
  console.log('='.repeat(60));
  console.log('\nNote: Shopify may take a few minutes to recalculate collection membership.');
}

main().catch(console.error);
