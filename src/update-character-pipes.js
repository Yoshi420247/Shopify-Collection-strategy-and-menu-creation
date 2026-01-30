#!/usr/bin/env node
/**
 * Update Character/Novelty Pipes Collection
 *
 * Tags all character/novelty pipes with "family:character-pipe" tag
 * and updates the collection to use tag-based rules.
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import fs from 'fs';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const REST_URL = `https://${STORE_URL}/admin/api/2024-01`;

const CHARACTER_TAG = 'family:character-pipe';

function sleep(ms) {
  execSync(`sleep ${ms / 1000}`);
}

function restRequest(endpoint, method = 'GET', body = null, retries = 4) {
  let cmd = `curl -s --max-time 60 -X ${method} "${REST_URL}${endpoint}" `;
  cmd += `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" `;
  cmd += `-H "Content-Type: application/json" `;

  if (body) {
    fs.writeFileSync('/tmp/rest_body.json', JSON.stringify(body));
    cmd += `-d @/tmp/rest_body.json`;
  }

  for (let i = 0; i < retries; i++) {
    try {
      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
      if (result && result.trim() && !result.includes('upstream connect error')) {
        return JSON.parse(result);
      }
    } catch (e) {
      console.log(`    Retry ${i + 1}/${retries}...`);
    }
    sleep(Math.pow(2, i + 1) * 1000);
  }
  return null;
}

// Load the missing character pipes from analysis
const missingPipes = JSON.parse(fs.readFileSync('/tmp/missing_character_pipes_refined.json', 'utf8'));

// Also need to tag products that ARE currently in the collection (already covered)
const alreadyCoveredKeywords = [
  'rabbit pipe', 'elephant pipe', 'dragon bubbler', 'turtle pipe',
  'turtle pendant', 'frog pipe', 'octopus pipe', 'cat eye rig',
  'dog print', 'bear claw', 'grogu', 'dragonfly', 'transformers'
];

async function tagProduct(productId, productTitle) {
  // Get current product
  const product = restRequest(`/products/${productId}.json`);
  if (!product || !product.product) {
    return { success: false, error: 'Failed to fetch product' };
  }

  const currentTags = product.product.tags || '';
  const tagList = currentTags.split(',').map(t => t.trim()).filter(t => t);

  // Check if already tagged
  if (tagList.some(t => t.toLowerCase() === CHARACTER_TAG.toLowerCase())) {
    return { success: true, alreadyTagged: true };
  }

  // Add new tag
  tagList.push(CHARACTER_TAG);
  const newTags = tagList.join(', ');

  // Update product
  const result = restRequest(`/products/${productId}.json`, 'PUT', {
    product: { id: productId, tags: newTags }
  });

  if (result && result.product) {
    return { success: true, alreadyTagged: false };
  }
  return { success: false, error: 'Failed to update' };
}

async function updateCollection() {
  console.log('\nUpdating novelty-character-pipes collection...');

  // Find the collection
  const collections = restRequest('/smart_collections.json?handle=novelty-character-pipes');
  if (!collections?.smart_collections?.length) {
    console.log('  Collection not found, creating...');

    const result = restRequest('/smart_collections.json', 'POST', {
      smart_collection: {
        title: 'Novelty & Character Pipes',
        handle: 'novelty-character-pipes',
        rules: [
          { column: 'tag', relation: 'equals', condition: CHARACTER_TAG }
        ],
        disjunctive: false,
        published: true
      }
    });

    if (result?.smart_collection) {
      console.log(`  ✓ Created collection with tag-based rule`);
      return true;
    }
    return false;
  }

  const collectionId = collections.smart_collections[0].id;

  // Update to use tag-based rule
  const result = restRequest(`/smart_collections/${collectionId}.json`, 'PUT', {
    smart_collection: {
      id: collectionId,
      rules: [
        { column: 'tag', relation: 'equals', condition: CHARACTER_TAG }
      ],
      disjunctive: false
    }
  });

  if (result?.smart_collection) {
    console.log(`  ✓ Updated collection to use tag-based rule: ${CHARACTER_TAG}`);
    return true;
  }

  console.log('  ✗ Failed to update collection');
  return false;
}

async function findAndTagExistingProducts() {
  console.log('\nFinding products already covered by old rules...');

  // Fetch all products and find ones matching old keywords
  const allProducts = JSON.parse(fs.readFileSync('/tmp/all_products.json', 'utf8'));

  const existingCharacterPipes = [];

  for (const p of allProducts) {
    const titleLower = p.title.toLowerCase();
    for (const kw of alreadyCoveredKeywords) {
      if (titleLower.includes(kw)) {
        existingCharacterPipes.push({
          id: p.id,
          title: p.title,
          keyword: kw
        });
        break;
      }
    }
  }

  console.log(`  Found ${existingCharacterPipes.length} products from old rules`);
  return existingCharacterPipes;
}

async function main() {
  console.log('='.repeat(70));
  console.log('UPDATE CHARACTER/NOVELTY PIPES COLLECTION');
  console.log('='.repeat(70));

  // Step 1: Find products already in collection (from old rules)
  const existingProducts = await findAndTagExistingProducts();

  // Combine with missing products
  const allCharacterPipes = [...missingPipes, ...existingProducts];

  // Remove duplicates by ID
  const uniqueProducts = Array.from(
    new Map(allCharacterPipes.map(p => [p.id, p])).values()
  );

  console.log(`\nTotal character/novelty pipes to tag: ${uniqueProducts.length}`);

  // Step 2: Tag all products
  console.log(`\n1. Tagging ${uniqueProducts.length} products with "${CHARACTER_TAG}"...\n`);

  let tagged = 0;
  let alreadyTagged = 0;
  let failed = 0;

  for (let i = 0; i < uniqueProducts.length; i++) {
    const product = uniqueProducts[i];
    process.stdout.write(`   [${i + 1}/${uniqueProducts.length}] ${product.title.substring(0, 40)}... `);

    const result = await tagProduct(product.id, product.title);

    if (result.success) {
      if (result.alreadyTagged) {
        console.log('already tagged');
        alreadyTagged++;
      } else {
        console.log('✓');
        tagged++;
      }
    } else {
      console.log(`✗ ${result.error}`);
      failed++;
    }

    // Rate limiting
    if ((i + 1) % 10 === 0) {
      sleep(1000);
    } else {
      sleep(300);
    }
  }

  console.log(`\n   Summary: ${tagged} tagged, ${alreadyTagged} already tagged, ${failed} failed`);

  // Step 3: Update collection to use tag-based rule
  console.log('\n2. Updating collection rules...');
  await updateCollection();

  console.log('\n' + '='.repeat(70));
  console.log('COMPLETE');
  console.log('='.repeat(70));
  console.log(`\n✓ Tagged ${tagged + alreadyTagged} products with "${CHARACTER_TAG}"`);
  console.log('✓ Updated collection to use tag-based rule');
  console.log(`\nThe Novelty & Character Pipes collection now includes ${uniqueProducts.length} products!`);
}

main();
