#!/usr/bin/env node
/**
 * Create smart collections for quick filters
 * These improve customer journey by providing high-level filter options
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

// Quick filter collections to create
const FILTER_COLLECTIONS = [
  // MATERIAL-BASED FILTERS
  {
    handle: 'glass-products',
    title: 'Glass Products',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'material:glass' }
    ],
    disjunctive: false
  },
  {
    handle: 'silicone-products',
    title: 'Silicone Products',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'material:silicone' }
    ],
    disjunctive: false
  },
  {
    handle: 'quartz-products',
    title: 'Quartz Products',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'material:quartz' }
    ],
    disjunctive: false
  },

  // USE-BASED FILTERS (Customer Intent)
  {
    handle: 'for-flower',
    title: 'For Flower Smoking',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'use:flower-smoking' }
    ],
    disjunctive: false
  },
  {
    handle: 'for-dabbing',
    title: 'For Dabbing & Concentrates',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'use:dabbing' }
    ],
    disjunctive: false
  },
  {
    handle: 'for-rolling',
    title: 'Rolling Supplies',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'use:rolling' }
    ],
    disjunctive: false
  },

  // PRICE-BASED FILTERS
  {
    handle: 'under-25',
    title: 'Under $25',
    rules: [
      { column: 'variant_price', relation: 'less_than', condition: '25.00' }
    ],
    disjunctive: false
  },
  {
    handle: 'under-50',
    title: 'Under $50',
    rules: [
      { column: 'variant_price', relation: 'less_than', condition: '50.00' }
    ],
    disjunctive: false
  },
  {
    handle: 'under-100',
    title: 'Under $100',
    rules: [
      { column: 'variant_price', relation: 'less_than', condition: '100.00' }
    ],
    disjunctive: false
  },
  {
    handle: 'premium-100-plus',
    title: 'Premium ($100+)',
    rules: [
      { column: 'variant_price', relation: 'greater_than', condition: '99.99' }
    ],
    disjunctive: false
  },

  // SPECIAL COLLECTIONS
  {
    handle: 'best-sellers',
    title: 'Best Sellers',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'best-seller' }
    ],
    disjunctive: true,
    additionalRules: [
      { column: 'tag', relation: 'equals', condition: 'bestseller' },
      { column: 'tag', relation: 'equals', condition: 'popular' }
    ]
  },
  {
    handle: 'new-arrivals',
    title: 'New Arrivals',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'new' }
    ],
    disjunctive: true,
    additionalRules: [
      { column: 'tag', relation: 'equals', condition: 'new-arrival' },
      { column: 'tag', relation: 'equals', condition: 'New' }
    ]
  },
  {
    handle: 'on-sale',
    title: 'On Sale',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'on sale' }
    ],
    disjunctive: true,
    additionalRules: [
      { column: 'tag', relation: 'equals', condition: 'sale' },
      { column: 'tag', relation: 'equals', condition: 'clearance' }
    ]
  },

  // SMOKESHOP SPECIFIC - Product Type Quick Filters
  {
    handle: 'all-pipes',
    title: 'All Pipes',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'family:spoon-pipe' },
      { column: 'tag', relation: 'equals', condition: 'family:character-pipe' },
      { column: 'tag', relation: 'equals', condition: 'family:chillum-onehitter' },
      { column: 'tag', relation: 'equals', condition: 'family:steamroller' },
      { column: 'tag', relation: 'equals', condition: 'family:sherlock-pipe' }
    ],
    disjunctive: true
  },
  {
    handle: 'all-bongs',
    title: 'All Bongs & Water Pipes',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'family:glass-bong' },
      { column: 'tag', relation: 'equals', condition: 'family:bubbler' },
      { column: 'tag', relation: 'equals', condition: 'family:silicone-bong' }
    ],
    disjunctive: true
  },
  {
    handle: 'all-rigs',
    title: 'All Dab Rigs',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'family:glass-rig' },
      { column: 'tag', relation: 'equals', condition: 'family:silicone-rig' },
      { column: 'tag', relation: 'equals', condition: 'family:nectar-collector' }
    ],
    disjunctive: true
  },
  {
    handle: 'all-accessories',
    title: 'All Accessories',
    rules: [
      { column: 'tag', relation: 'equals', condition: 'family:carb-cap' },
      { column: 'tag', relation: 'equals', condition: 'family:dab-tool' },
      { column: 'tag', relation: 'equals', condition: 'family:banger' },
      { column: 'tag', relation: 'equals', condition: 'family:torch' },
      { column: 'tag', relation: 'equals', condition: 'family:flower-bowl' },
      { column: 'tag', relation: 'equals', condition: 'family:downstem' },
      { column: 'tag', relation: 'equals', condition: 'family:ash-catcher' },
      { column: 'tag', relation: 'equals', condition: 'family:grinder' }
    ],
    disjunctive: true
  }
];

async function main() {
  console.log('='.repeat(70));
  console.log('CREATING QUICK FILTER COLLECTIONS');
  console.log('Improving customer journey with high-level filter options');
  console.log('='.repeat(70) + '\n');

  // Get existing collections
  const smart = await api.getCollections('smart');
  const existingHandles = new Set(smart.smart_collections.map(c => c.handle));

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const collection of FILTER_COLLECTIONS) {
    // Combine rules if there are additional rules
    let allRules = [...collection.rules];
    if (collection.additionalRules) {
      allRules = [...allRules, ...collection.additionalRules];
    }

    const exists = existingHandles.has(collection.handle);
    console.log(`${exists ? 'Updating' : 'Creating'}: ${collection.title} (${collection.handle})`);

    try {
      if (exists) {
        // Find and update existing collection
        const existing = smart.smart_collections.find(c => c.handle === collection.handle);
        await api.updateSmartCollection(existing.id, {
          title: collection.title,
          rules: allRules,
          disjunctive: collection.disjunctive !== false
        });
        updated++;
      } else {
        // Create new collection
        await api.createSmartCollection({
          title: collection.title,
          handle: collection.handle,
          rules: allRules,
          disjunctive: collection.disjunctive !== false
        });
        created++;
      }
      console.log('  [SUCCESS]');
    } catch (error) {
      console.log('  [ERROR]', error.message);
      failed++;
    }
  }

  // Verify collections
  console.log('\n' + '='.repeat(70));
  console.log('VERIFICATION - Collection Product Counts');
  console.log('='.repeat(70) + '\n');

  // Query in batches
  const handles = FILTER_COLLECTIONS.map(c => c.handle);

  for (let i = 0; i < handles.length; i += 8) {
    const batch = handles.slice(i, i + 8);
    const queryParts = batch.map((h, idx) =>
      `c${idx}: collectionByHandle(handle: "${h}") { title handle productsCount { count } }`
    ).join('\n');

    const query = `query { ${queryParts} }`;
    const result = await api.graphqlQuery(query, {});

    if (result.data) {
      for (const val of Object.values(result.data)) {
        if (val) {
          const status = val.productsCount?.count > 0 ? '✓' : '✗';
          console.log(`  ${status} ${val.title.padEnd(30)} ${val.productsCount?.count || 0} products`);
        }
      }
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`
Created: ${created}
Updated: ${updated}
Failed:  ${failed}

QUICK FILTER URLS FOR THEME:

MATERIAL FILTERS:
  /collections/glass-products     - Glass Products
  /collections/silicone-products  - Silicone Products
  /collections/quartz-products    - Quartz Products

USE/INTENT FILTERS:
  /collections/for-flower         - For Flower Smoking
  /collections/for-dabbing        - For Dabbing & Concentrates
  /collections/for-rolling        - Rolling Supplies

PRICE FILTERS:
  /collections/under-25           - Under $25
  /collections/under-50           - Under $50
  /collections/under-100          - Under $100
  /collections/premium-100-plus   - Premium ($100+)

SPECIAL FILTERS:
  /collections/best-sellers       - Best Sellers
  /collections/new-arrivals       - New Arrivals
  /collections/on-sale            - On Sale

PRODUCT TYPE FILTERS:
  /collections/all-pipes          - All Pipes
  /collections/all-bongs          - All Bongs & Water Pipes
  /collections/all-rigs           - All Dab Rigs
  /collections/all-accessories    - All Accessories

Use these URLs in your theme's Quick Filters section!
  `);
}

main().catch(console.error);
