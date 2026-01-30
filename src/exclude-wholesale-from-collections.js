import 'dotenv/config';
import * as api from './shopify-api.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAllSmartCollections() {
  let collections = [];
  let page = 1;
  let hasMore = true;
  let sinceId = 0;

  while (hasMore) {
    console.log(`Fetching page ${page}...`);
    const data = await api.get(`smart_collections.json?limit=250&since_id=${sinceId}`);

    if (!data.smart_collections || data.smart_collections.length === 0) {
      hasMore = false;
    } else {
      collections = collections.concat(data.smart_collections);
      sinceId = data.smart_collections[data.smart_collections.length - 1].id;
      page++;

      if (data.smart_collections.length < 250) {
        hasMore = false;
      }
    }
  }

  return collections;
}

async function addWholesaleExclusionRule(collection) {
  // Check if collection already has a wholesale exclusion rule
  const hasExclusion = collection.rules.some(
    rule => rule.column === 'tag' && rule.relation === 'not_equals' && rule.condition === 'Wholesale Quantity'
  );

  if (hasExclusion) {
    console.log(`  Already has exclusion rule, skipping`);
    return false;
  }

  // Add the exclusion rule
  const updatedRules = [
    ...collection.rules,
    {
      column: 'tag',
      relation: 'not_equals',
      condition: 'Wholesale Quantity'
    }
  ];

  await api.updateSmartCollection(collection.id, {
    rules: updatedRules,
    disjunctive: collection.disjunctive || false
  });

  return true;
}

async function main() {
  console.log('Fetching all smart collections...\n');
  const collections = await getAllSmartCollections();
  console.log(`\nFound ${collections.length} smart collections total\n`);

  // Find the Torches collection first to check its rules
  const torchesCollection = collections.find(c => c.title.toLowerCase().includes('torch'));
  if (torchesCollection) {
    console.log('Torches collection found:');
    console.log(`  ID: ${torchesCollection.id}`);
    console.log(`  Title: ${torchesCollection.title}`);
    console.log(`  Rules: ${JSON.stringify(torchesCollection.rules, null, 2)}`);
    console.log('');
  }

  // Find the Wholesale collection to exclude it from being modified
  const wholesaleCollection = collections.find(c => c.title.toLowerCase() === 'wholesale');
  console.log(`Wholesale collection: ${wholesaleCollection ? wholesaleCollection.title : 'NOT FOUND'}\n`);

  // Collections to exclude from modification (like Wholesale itself, Clearance, etc.)
  const excludeFromModification = ['wholesale', 'all', 'all products'];

  // Filter collections that should have the exclusion rule
  const collectionsToModify = collections.filter(c => {
    const titleLower = c.title.toLowerCase();
    return !excludeFromModification.includes(titleLower);
  });

  console.log(`\nWill add wholesale exclusion rule to ${collectionsToModify.length} collections:\n`);

  let modified = 0;
  let skipped = 0;
  let failed = 0;

  for (const collection of collectionsToModify) {
    console.log(`Processing: ${collection.title} (ID: ${collection.id})`);
    try {
      const wasModified = await addWholesaleExclusionRule(collection);
      if (wasModified) {
        console.log(`  ✓ Added exclusion rule`);
        modified++;
      } else {
        skipped++;
      }
      await sleep(300);
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      failed++;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Modified: ${modified}`);
  console.log(`Skipped (already had rule): ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
