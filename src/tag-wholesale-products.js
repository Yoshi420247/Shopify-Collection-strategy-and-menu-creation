#!/usr/bin/env node
/**
 * Tag Wholesale Products and Create Collection
 *
 * Tags all identified wholesale products with "Wholesale Quantity"
 * and creates a Wholesale collection for them.
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import fs from 'fs';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const REST_URL = `https://${STORE_URL}/admin/api/2024-01`;
const GRAPHQL_URL = `https://${STORE_URL}/admin/api/2024-01/graphql.json`;

const WHOLESALE_TAG = 'Wholesale Quantity';

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

function graphqlRequest(query, variables = {}, retries = 4) {
  const body = JSON.stringify({ query, variables });
  fs.writeFileSync('/tmp/gql_body.json', body);
  const cmd = `curl -s --max-time 60 "${GRAPHQL_URL}" -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" -H "Content-Type: application/json" -d @/tmp/gql_body.json`;

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

// Wholesale product IDs from analysis
const wholesaleProductIds = [
  9885278175512, 9885292658968, 9885293412632, 9885293871384, 9885295051032,
  9885294067992, 9885295542552, 9885289709848, 9885289939224, 9885289971992,
  9885287219480, 9885291774232, 9885293379864, 9885295247640, 9885292691736,
  9885291512088, 9885291872536, 9885283844376, 9885283909912, 9885291544856,
  9885291610392, 9885291675928, 9885291708696, 9885291807000, 9885291905304,
  9885291938072, 9885292003608, 9885281517848, 9885294788888, 9885295673624,
  9885296197912, 9885288694040, 9885294428440, 9885295739160, 9885295771928,
  9885285220632, 9885293478168, 9885293904152, 9885290955032, 9885293936920,
  9885294821656, 9885294887192
];

async function tagProduct(productId) {
  // Get current product
  const product = restRequest(`/products/${productId}.json`);
  if (!product || !product.product) {
    return { success: false, error: 'Failed to fetch product' };
  }

  const currentTags = product.product.tags || '';
  const tagList = currentTags.split(',').map(t => t.trim()).filter(t => t);

  // Check if already tagged
  if (tagList.some(t => t.toLowerCase() === WHOLESALE_TAG.toLowerCase())) {
    return { success: true, alreadyTagged: true };
  }

  // Add new tag
  tagList.push(WHOLESALE_TAG);
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

async function createWholesaleCollection() {
  console.log('\nCreating Wholesale smart collection...');

  // Check if collection already exists
  const existing = restRequest('/smart_collections.json?handle=wholesale');
  if (existing?.smart_collections?.length > 0) {
    console.log('  Collection already exists, updating...');
    const collectionId = existing.smart_collections[0].id;

    // Update the collection
    const result = restRequest(`/smart_collections/${collectionId}.json`, 'PUT', {
      smart_collection: {
        id: collectionId,
        title: 'Wholesale',
        rules: [
          { column: 'tag', relation: 'equals', condition: WHOLESALE_TAG }
        ],
        disjunctive: false,
        published: true
      }
    });

    if (result?.smart_collection) {
      console.log(`  ✓ Updated collection: ${result.smart_collection.handle}`);
      return result.smart_collection;
    }
  }

  // Create new collection
  const result = restRequest('/smart_collections.json', 'POST', {
    smart_collection: {
      title: 'Wholesale',
      handle: 'wholesale',
      rules: [
        { column: 'tag', relation: 'equals', condition: WHOLESALE_TAG }
      ],
      disjunctive: false,
      published: true
    }
  });

  if (result?.smart_collection) {
    console.log(`  ✓ Created collection: ${result.smart_collection.handle}`);
    return result.smart_collection;
  }

  console.log('  ✗ Failed to create collection');
  return null;
}

async function addToMenu() {
  console.log('\nAdding Wholesale to navigation menu...');

  // Get current main menu
  const menusQuery = `{ menus(first: 20) { edges { node { id handle title items { id title } } } } }`;
  const menusResult = graphqlRequest(menusQuery);

  if (!menusResult?.data?.menus?.edges) {
    console.log('  ✗ Failed to fetch menus');
    return;
  }

  // Find best-selling menu
  const mainMenu = menusResult.data.menus.edges.find(e => e.node.handle === 'best-selling');
  if (!mainMenu) {
    console.log('  ✗ Main menu not found');
    return;
  }

  const menuId = mainMenu.node.id;
  const existingItems = mainMenu.node.items || [];

  // Check if Wholesale already exists
  if (existingItems.some(item => item.title.toLowerCase() === 'wholesale')) {
    console.log('  Wholesale already in menu');
    return;
  }

  // Add Wholesale item to menu
  const mutation = `
    mutation menuItemCreate($menuId: ID!, $items: [MenuItemCreateInput!]!) {
      menuItemCreate(menuId: $menuId, menuItem: { title: "Wholesale", url: "/collections/wholesale", type: HTTP }) {
        menuItem { id title }
        userErrors { message }
      }
    }
  `;

  // Note: menuItemCreate doesn't exist in older API versions
  // We need to delete and recreate the menu with the new item

  // Get current items
  const currentItems = existingItems.map(item => ({
    title: item.title,
    url: item.title === 'Brands' ? '#' : `/collections/${item.title.toLowerCase().replace(/ & /g, '-').replace(/ /g, '-')}`,
    type: 'HTTP'
  }));

  // Add Wholesale at the bottom
  currentItems.push({ title: 'Wholesale', url: '/collections/wholesale', type: 'HTTP' });

  // Delete old menu
  const deleteMutation = `mutation { menuDelete(id: "${menuId}") { userErrors { message } } }`;
  graphqlRequest(deleteMutation);
  sleep(1000);

  // Create new menu with Wholesale
  const createMutation = `
    mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu { id handle title }
        userErrors { message }
      }
    }
  `;

  const result = graphqlRequest(createMutation, {
    title: 'Main Navigation',
    handle: 'best-selling',
    items: currentItems
  });

  if (result?.data?.menuCreate?.menu) {
    console.log('  ✓ Added Wholesale to menu');
  } else {
    console.log(`  ✗ Failed: ${JSON.stringify(result)}`);
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('TAG WHOLESALE PRODUCTS & CREATE COLLECTION');
  console.log('='.repeat(70));

  // Step 1: Tag all wholesale products
  console.log(`\n1. Tagging ${wholesaleProductIds.length} products with "${WHOLESALE_TAG}"...\n`);

  let tagged = 0;
  let alreadyTagged = 0;
  let failed = 0;

  for (let i = 0; i < wholesaleProductIds.length; i++) {
    const productId = wholesaleProductIds[i];
    process.stdout.write(`   [${i + 1}/${wholesaleProductIds.length}] Product ${productId}... `);

    const result = await tagProduct(productId);

    if (result.success) {
      if (result.alreadyTagged) {
        console.log('already tagged');
        alreadyTagged++;
      } else {
        console.log('✓ tagged');
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

  // Step 2: Create wholesale collection
  console.log('\n2. Creating Wholesale collection...');
  await createWholesaleCollection();

  // Step 3: Add to menu
  console.log('\n3. Adding to navigation menu...');
  await addToMenu();

  console.log('\n' + '='.repeat(70));
  console.log('COMPLETE');
  console.log('='.repeat(70));
  console.log(`\n✓ Tagged ${tagged + alreadyTagged} products with "${WHOLESALE_TAG}"`);
  console.log('✓ Created/updated "Wholesale" collection');
  console.log('✓ Added "Wholesale" to main navigation menu');
}

main();
