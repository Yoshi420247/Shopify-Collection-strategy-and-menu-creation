/**
 * Standardize Tags for OR-Logic Collections
 *
 * For collections using OR logic with multiple tag variations,
 * standardize to a single primary tag and update the collection.
 */

import 'dotenv/config';
import * as api from './shopify-api.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Collections to standardize and their primary tags
const COLLECTIONS_TO_FIX = [
  {
    name: 'Concentrate Containers',
    primaryTag: 'category:concentrate-container',
    alternativeTags: ['category:container', 'use:storage'],
    // Only tag products that match alternative tags but are actually containers
    titlePatterns: ['container', 'jar', 'silicone jar', 'dab jar']
  },
  {
    name: 'Glass Jars',
    primaryTag: 'category:glass-jar',
    alternativeTags: ['category:jar'],
    titlePatterns: ['glass jar', 'jar']
  },
  {
    name: 'Silicone Pads & Mats',
    primaryTag: 'category:silicone-pad',
    alternativeTags: ['category:silicone-mat'],
    titlePatterns: ['pad', 'mat', 'silicone']
  },
  {
    name: 'FEP Sheets & Rolls',
    primaryTag: 'material:fep',
    alternativeTags: ['category:fep'],
    titlePatterns: ['fep']
  },
  {
    name: 'PTFE Sheets & Rolls',
    primaryTag: 'material:ptfe',
    alternativeTags: ['category:ptfe'],
    titlePatterns: ['ptfe', 'teflon']
  },
  {
    name: 'Parchment Paper',
    primaryTag: 'category:parchment',
    alternativeTags: ['category:paper'],
    titlePatterns: ['parchment', 'paper']
  }
];

async function getAllProducts() {
  let products = [];
  let sinceId = 0;

  while (true) {
    const data = await api.get(`products.json?limit=250&since_id=${sinceId}`);
    if (!data.products || data.products.length === 0) break;
    products = products.concat(data.products);
    sinceId = data.products[data.products.length - 1].id;
    process.stderr.write(`\rFetched ${products.length} products...`);
    if (data.products.length < 250) break;
  }
  console.error('');
  return products;
}

async function getAllSmartCollections() {
  const data = await api.get('smart_collections.json?limit=250');
  return data.smart_collections || [];
}

async function addTagToProduct(product, tag) {
  const currentTags = (product.tags || '').split(',').map(t => t.trim()).filter(t => t);

  if (currentTags.includes(tag)) {
    return false; // Already has tag
  }

  currentTags.push(tag);
  const newTags = currentTags.join(', ');

  await api.updateProduct(product.id, { tags: newTags });
  return true;
}

async function main() {
  console.log('='.repeat(70));
  console.log('STANDARDIZE TAGS FOR OR-LOGIC COLLECTIONS');
  console.log('='.repeat(70));

  console.log('\nFetching all products...');
  const products = await getAllProducts();
  console.log(`Found ${products.length} products\n`);

  console.log('Fetching all collections...');
  const collections = await getAllSmartCollections();
  console.log(`Found ${collections.length} collections\n`);

  for (const config of COLLECTIONS_TO_FIX) {
    console.log('\n' + '-'.repeat(70));
    console.log(`Processing: ${config.name}`);
    console.log('-'.repeat(70));

    // Find the collection
    const collection = collections.find(c => c.title === config.name);
    if (!collection) {
      console.log('  Collection not found, skipping');
      continue;
    }

    console.log(`  Collection ID: ${collection.id}`);
    console.log(`  Current rules: ${collection.rules.length}`);
    console.log(`  Disjunctive: ${collection.disjunctive}`);

    // Find products that have any of the alternative tags but not the primary tag
    const needsTag = products.filter(p => {
      const tags = (p.tags || '').split(',').map(t => t.trim());
      const hasPrimary = tags.includes(config.primaryTag);
      const hasAlternative = config.alternativeTags.some(alt => tags.includes(alt));
      return !hasPrimary && hasAlternative;
    });

    console.log(`  Products needing primary tag: ${needsTag.length}`);

    // Tag products
    let tagged = 0;
    for (const product of needsTag) {
      try {
        const wasTagged = await addTagToProduct(product, config.primaryTag);
        if (wasTagged) {
          console.log(`    ✓ Tagged: ${product.title.substring(0, 50)}...`);
          tagged++;
        }
        await sleep(300);
      } catch (e) {
        console.log(`    ✗ Error tagging ${product.id}: ${e.message}`);
      }
    }

    console.log(`  Tagged ${tagged} products with ${config.primaryTag}`);

    // Now simplify the collection to use only the primary tag
    if (collection.disjunctive && collection.rules.length > 1) {
      console.log('  Simplifying collection rules...');

      try {
        await api.updateSmartCollection(collection.id, {
          rules: [
            { column: 'tag', relation: 'equals', condition: config.primaryTag }
          ],
          disjunctive: false
        });
        console.log(`  ✓ Collection now uses single rule: tag = ${config.primaryTag}`);
      } catch (e) {
        console.log(`  ✗ Error updating collection: ${e.message}`);
      }
    }

    await sleep(500);
  }

  console.log('\n' + '='.repeat(70));
  console.log('DONE');
  console.log('='.repeat(70));
}

main().catch(console.error);
