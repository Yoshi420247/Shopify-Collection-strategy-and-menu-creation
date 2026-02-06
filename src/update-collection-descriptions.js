#!/usr/bin/env node
// =============================================================================
// Update Collection Descriptions
// Pushes SEO-optimized long-form descriptions to all Shopify collections
// =============================================================================

import { getCollections, updateSmartCollection, get, put } from './shopify-api.js';
import collectionDescriptions from './collection-descriptions.js';

const DRY_RUN = !process.argv.includes('--execute');
const SINGLE = process.argv.find(a => a.startsWith('--collection='));
const REPORT_ONLY = process.argv.includes('--report');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAllCollections() {
  console.log('Fetching all collections from Shopify...\n');

  const [smartResult, customResult] = await Promise.all([
    getCollections('smart'),
    getCollections('custom'),
  ]);

  const smart = (smartResult.smart_collections || []).map(c => ({ ...c, type: 'smart' }));
  const custom = (customResult.custom_collections || []).map(c => ({ ...c, type: 'custom' }));

  const all = [...smart, ...custom];
  console.log(`  Found ${smart.length} smart collections and ${custom.length} custom collections (${all.length} total)\n`);
  return all;
}

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').trim();
}

async function updateDescription(collection, newHtml) {
  const { id, type } = collection;
  const endpoint = type === 'smart'
    ? `smart_collections/${id}.json`
    : `custom_collections/${id}.json`;

  const key = type === 'smart' ? 'smart_collection' : 'custom_collection';

  return put(endpoint, { [key]: { id, body_html: newHtml } });
}

async function run() {
  console.log('='.repeat(70));
  console.log('  OIL SLICK — Collection Description Updater');
  console.log('='.repeat(70));
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (use --execute to apply changes)' : 'LIVE — APPLYING CHANGES'}`);
  console.log(`  Descriptions loaded: ${Object.keys(collectionDescriptions).length}`);
  console.log('');

  // Fetch all collections
  const collections = await getAllCollections();

  // Build handle → collection map
  const collectionMap = {};
  for (const c of collections) {
    collectionMap[c.handle] = c;
  }

  // Filter to single collection if specified
  const handles = SINGLE
    ? [SINGLE.split('=')[1]]
    : Object.keys(collectionDescriptions);

  // Report: show what will be updated
  let toUpdate = 0;
  let skipped = 0;
  let notFound = 0;
  const results = [];

  console.log('-'.repeat(70));
  console.log('  COLLECTION DESCRIPTION REPORT');
  console.log('-'.repeat(70));

  for (const handle of handles) {
    const newHtml = collectionDescriptions[handle];
    if (!newHtml) {
      console.log(`  [SKIP] ${handle} — no description defined`);
      skipped++;
      continue;
    }

    const collection = collectionMap[handle];
    if (!collection) {
      console.log(`  [NOT FOUND] ${handle} — collection does not exist in Shopify`);
      notFound++;
      continue;
    }

    const currentText = stripHtml(collection.body_html);
    const newText = stripHtml(newHtml);
    const currentLen = currentText.length;
    const newLen = newText.length;

    if (currentText === newText) {
      console.log(`  [UNCHANGED] ${handle} — already up to date (${currentLen} chars)`);
      skipped++;
      continue;
    }

    const status = currentLen === 0 ? 'NEW' : 'UPDATE';
    console.log(`  [${status}] ${handle} — ${currentLen} → ${newLen} chars (${collection.type})`);
    toUpdate++;
    results.push({ handle, collection, newHtml, status });
  }

  console.log('');
  console.log('-'.repeat(70));
  console.log(`  Summary: ${toUpdate} to update | ${skipped} skipped | ${notFound} not found in Shopify`);
  console.log('-'.repeat(70));

  if (REPORT_ONLY) {
    console.log('\n  Report complete. Use --execute to apply changes.\n');
    return;
  }

  if (DRY_RUN) {
    console.log('\n  DRY RUN complete. Use --execute to apply changes.\n');
    console.log('  Preview of descriptions:');
    console.log('');
    for (const { handle, newHtml } of results) {
      const preview = stripHtml(newHtml).substring(0, 120);
      console.log(`  ${handle}:`);
      console.log(`    "${preview}..."`);
      console.log('');
    }
    return;
  }

  // Execute updates
  console.log(`\n  Updating ${toUpdate} collection descriptions...\n`);

  let success = 0;
  let errors = 0;

  for (const { handle, collection, newHtml, status } of results) {
    try {
      process.stdout.write(`  [${success + errors + 1}/${toUpdate}] ${handle}...`);
      await updateDescription(collection, newHtml.trim());
      console.log(` ✓ ${status}`);
      success++;
      // Rate limiting pause between updates
      await sleep(600);
    } catch (err) {
      console.log(` ✗ ERROR: ${err.message}`);
      errors++;
    }
  }

  console.log('');
  console.log('='.repeat(70));
  console.log(`  DONE: ${success} updated | ${errors} errors | ${skipped} skipped`);
  console.log('='.repeat(70));
  console.log('');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
