#!/usr/bin/env node
/**
 * Create Dropdown Menus
 *
 * Creates separate menus for each main navigation item to enable dropdown navigation.
 * The theme's menu system checks for menus with handles matching the main menu item handles.
 */

import 'dotenv/config';
import { execSync } from 'child_process';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const GRAPHQL_URL = `https://${STORE_URL}/admin/api/2024-01/graphql.json`;

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function graphqlRequest(query, variables = {}, retries = 3) {
  const body = JSON.stringify({ query, variables });
  const escapedBody = body.replace(/'/g, "'\\''");
  const cmd = `curl -s --max-time 60 "${GRAPHQL_URL}" -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" -H "Content-Type: application/json" -d '${escapedBody}'`;

  for (let i = 0; i < retries; i++) {
    try {
      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
      if (result && !result.includes('upstream connect error')) {
        return JSON.parse(result);
      }
    } catch (e) {
      console.log(`  Retry ${i + 1}/${retries}...`);
    }
    if (i < retries - 1) {
      const delay = (i + 1) * 3000;
      execSync(`sleep ${delay / 1000}`);
    }
  }
  return null;
}

// Define dropdown menus - these need handles that match the main menu item titles (handleized)
const dropdownMenus = {
  'smoke-vape': {
    title: 'Smoke & Vape Dropdown',
    items: [
      { title: 'Shop All Smoke & Vape', url: '/collections/smoke-and-vape' },
      { title: 'Bongs & Water Pipes', url: '/collections/bongs-water-pipes' },
      { title: 'Dab Rigs', url: '/collections/dab-rigs' },
      { title: 'Hand Pipes', url: '/collections/hand-pipes' },
      { title: 'Bubblers', url: '/collections/bubblers' },
      { title: 'Nectar Collectors', url: '/collections/nectar-collectors' },
      { title: 'One Hitters & Chillums', url: '/collections/one-hitters-chillums' },
      { title: 'Steamrollers', url: '/collections/steamrollers' },
      { title: 'Silicone Pipes', url: '/collections/silicone-pipes' },
    ],
  },
  'accessories': {
    title: 'Accessories Dropdown',
    items: [
      { title: 'Shop All Accessories', url: '/collections/accessories' },
      { title: 'Quartz Bangers', url: '/collections/quartz-bangers' },
      { title: 'Carb Caps', url: '/collections/carb-caps' },
      { title: 'Dab Tools', url: '/collections/dab-tools' },
      { title: 'Flower Bowls', url: '/collections/flower-bowls' },
      { title: 'Ash Catchers', url: '/collections/ash-catchers' },
      { title: 'Torches', url: '/collections/torches' },
      { title: 'Grinders', url: '/collections/grinders' },
      { title: 'Rolling Papers', url: '/collections/rolling-papers-cones' },
      { title: 'Downstems', url: '/collections/downstems' },
    ],
  },
  'brands': {
    title: 'Brands Dropdown',
    items: [
      { title: 'RAW', url: '/collections/raw' },
      { title: 'Zig Zag', url: '/collections/zig-zag' },
      { title: 'Vibes', url: '/collections/vibes' },
      { title: 'Cookies', url: '/collections/cookies' },
      { title: 'Maven', url: '/collections/maven' },
      { title: 'Made in USA', url: '/collections/made-in-usa' },
      { title: 'Monark', url: '/collections/monark' },
    ],
  },
  'extraction-packaging': {
    title: 'Extraction & Packaging Dropdown',
    items: [
      { title: 'Shop All Extraction', url: '/collections/extraction-packaging' },
      { title: 'Silicone Pads & Mats', url: '/collections/silicone-pads' },
      { title: 'FEP Sheets & Rolls', url: '/collections/fep-sheets' },
      { title: 'PTFE Sheets & Rolls', url: '/collections/ptfe-sheets' },
      { title: 'Parchment Paper', url: '/collections/parchment-paper' },
      { title: 'Glass Jars', url: '/collections/glass-jars' },
      { title: 'Concentrate Containers', url: '/collections/concentrate-containers' },
    ],
  },
  'silicone-pipes': {
    title: 'Silicone Pipes Dropdown',
    items: [
      { title: 'Shop All Silicone', url: '/collections/silicone-pipes' },
      { title: 'Silicone Bubblers', url: '/collections/silicone-bubblers' },
      { title: 'Silicone Hand Pipes', url: '/collections/silicone-hand-pipes' },
      { title: 'Silicone Nectar Collectors', url: '/collections/silicone-nectar-collectors' },
      { title: 'Silicone Rigs & Bongs', url: '/collections/silicone-rigs-bongs' },
    ],
  },
};

async function deleteMenuIfExists(handle) {
  const query = `{ menus(first: 50) { edges { node { id handle } } } }`;
  const result = graphqlRequest(query);
  if (!result?.data?.menus?.edges) return;

  for (const edge of result.data.menus.edges) {
    if (edge.node.handle === handle) {
      console.log(`  Deleting existing menu: ${handle}`);
      const deleteMutation = `mutation { menuDelete(id: "${edge.node.id}") { userErrors { message } } }`;
      graphqlRequest(deleteMutation);
      await sleep(500);
    }
  }
}

async function createDropdownMenu(handle, config) {
  console.log(`\nCreating dropdown menu: ${handle}`);

  // First delete if exists
  await deleteMenuIfExists(handle);
  await sleep(500);

  // Create menu with items
  const itemsInput = config.items.map(item => ({
    title: item.title,
    url: item.url,
    type: 'HTTP',
  }));

  const mutation = `
    mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu { id handle title }
        userErrors { field message }
      }
    }
  `;

  const variables = {
    title: config.title,
    handle: handle,
    items: itemsInput,
  };

  const result = graphqlRequest(mutation, variables);

  if (result?.data?.menuCreate?.menu) {
    console.log(`  ✓ Created: ${result.data.menuCreate.menu.handle} - ${result.data.menuCreate.menu.title}`);
    return true;
  } else if (result?.data?.menuCreate?.userErrors?.length) {
    console.log(`  ✗ Errors: ${JSON.stringify(result.data.menuCreate.userErrors)}`);
    return false;
  } else {
    console.log(`  ✗ Failed: ${JSON.stringify(result)}`);
    return false;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('CREATING DROPDOWN MENUS FOR NAVIGATION');
  console.log('='.repeat(60));
  console.log('\nThese menus will enable dropdown navigation in the header.');
  console.log('Menu handles must match the main menu item handles:\n');

  let created = 0;
  let failed = 0;

  for (const [handle, config] of Object.entries(dropdownMenus)) {
    const success = await createDropdownMenu(handle, config);
    if (success) created++;
    else failed++;
    await sleep(1000);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`COMPLETE: Created ${created} menus, ${failed} failed`);
  console.log('='.repeat(60));
}

main();
