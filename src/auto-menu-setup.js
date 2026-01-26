#!/usr/bin/env node
/**
 * Automated Menu Setup
 *
 * This script automatically creates and updates Shopify navigation menus
 * using the GraphQL Admin API.
 */

import 'dotenv/config';
import { execSync } from 'child_process';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

const GRAPHQL_URL = `https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`;

// Colors for output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function graphqlRequest(query, variables = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const body = JSON.stringify({ query, variables }).replace(/'/g, "'\\''");
      const cmd = `curl -s --max-time 30 -X POST "${GRAPHQL_URL}" ` +
        `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" ` +
        `-H "Content-Type: application/json" ` +
        `-d '${body}'`;

      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const data = JSON.parse(result);

      if (data.errors) {
        throw new Error(JSON.stringify(data.errors));
      }

      return data;
    } catch (error) {
      if (attempt < retries) {
        console.log(`  Retry ${attempt}/${retries}...`);
        await sleep(2000 * attempt);
      } else {
        throw error;
      }
    }
  }
}

// Get collection ID by handle
async function getCollectionId(handle) {
  const query = `
    query getCollection($handle: String!) {
      collectionByHandle(handle: $handle) {
        id
        title
      }
    }
  `;

  try {
    const result = await graphqlRequest(query, { handle });
    return result.data?.collectionByHandle?.id || null;
  } catch (e) {
    return null;
  }
}

// Build menu items with collection IDs
async function buildMenuItems() {
  log('\nBuilding menu structure with collection IDs...', 'cyan');

  const menuStructure = [
    {
      title: 'Extraction & Packaging',
      handle: 'extraction-packaging',
      type: 'COLLECTION',
    },
    {
      title: 'Smoke & Vape',
      handle: 'smoke-and-vape',
      type: 'COLLECTION',
      children: [
        { title: 'Shop All Smoke & Vape', handle: 'smoke-and-vape', type: 'COLLECTION' },
        { title: 'Bongs & Water Pipes', handle: 'bongs-water-pipes', type: 'COLLECTION' },
        { title: 'Dab Rigs', handle: 'dab-rigs', type: 'COLLECTION' },
        { title: 'Hand Pipes', handle: 'hand-pipes', type: 'COLLECTION' },
        { title: 'Bubblers', handle: 'bubblers', type: 'COLLECTION' },
        { title: 'Nectar Collectors', handle: 'nectar-collectors', type: 'COLLECTION' },
        { title: 'One Hitters & Chillums', handle: 'one-hitters-chillums', type: 'COLLECTION' },
      ],
    },
    {
      title: 'Accessories',
      handle: 'accessories',
      type: 'COLLECTION',
      children: [
        { title: 'Quartz Bangers', handle: 'quartz-bangers', type: 'COLLECTION' },
        { title: 'Carb Caps', handle: 'carb-caps', type: 'COLLECTION' },
        { title: 'Dab Tools', handle: 'dab-tools', type: 'COLLECTION' },
        { title: 'Flower Bowls', handle: 'flower-bowls', type: 'COLLECTION' },
        { title: 'Ash Catchers', handle: 'ash-catchers', type: 'COLLECTION' },
        { title: 'Torches', handle: 'torches', type: 'COLLECTION' },
        { title: 'Grinders', handle: 'grinders', type: 'COLLECTION' },
        { title: 'Rolling Papers', handle: 'rolling-papers', type: 'COLLECTION' },
      ],
    },
    {
      title: 'Brands',
      type: 'HTTP',
      url: '#',
      children: [
        { title: 'Monark', handle: 'monark', type: 'COLLECTION' },
        { title: 'Zig Zag', handle: 'zig-zag', type: 'COLLECTION' },
        { title: 'Cookies', handle: 'cookies', type: 'COLLECTION' },
        { title: 'Maven', handle: 'maven', type: 'COLLECTION' },
        { title: 'Vibes', handle: 'vibes', type: 'COLLECTION' },
        { title: 'RAW', handle: 'raw', type: 'COLLECTION' },
        { title: 'Made in USA', handle: 'made-in-usa', type: 'COLLECTION' },
      ],
    },
    {
      title: 'Clearance',
      handle: 'clearance',
      type: 'COLLECTION',
    },
  ];

  // Convert to GraphQL format
  async function convertItem(item) {
    const menuItem = {
      title: item.title,
      type: item.type,
    };

    if (item.type === 'COLLECTION' && item.handle) {
      const collectionId = await getCollectionId(item.handle);
      if (collectionId) {
        menuItem.resourceId = collectionId;
        console.log(`  ✓ ${item.title} → ${item.handle}`);
      } else {
        // Fallback to URL
        menuItem.type = 'HTTP';
        menuItem.url = `/collections/${item.handle}`;
        console.log(`  ⚠ ${item.title} → URL fallback: /collections/${item.handle}`);
      }
    } else if (item.type === 'HTTP') {
      menuItem.url = item.url || '#';
    }

    if (item.children && item.children.length > 0) {
      menuItem.items = [];
      for (const child of item.children) {
        menuItem.items.push(await convertItem(child));
      }
    }

    return menuItem;
  }

  const items = [];
  for (const item of menuStructure) {
    items.push(await convertItem(item));
  }

  return items;
}

// Update the menu (delete and recreate since update requires item IDs)
async function updateMenu(menuId, items, title = 'Sidebar Menu', handle = 'best-selling') {
  log('\nUpdating menu (delete and recreate)...', 'cyan');

  // First, delete the existing menu
  const deleteMutation = `
    mutation menuDelete($id: ID!) {
      menuDelete(id: $id) {
        deletedMenuId
        userErrors {
          field
          message
        }
      }
    }
  `;

  try {
    const deleteResult = await graphqlRequest(deleteMutation, { id: menuId });
    if (deleteResult.data?.menuDelete?.deletedMenuId) {
      log('  Deleted existing menu', 'yellow');
    }
  } catch (e) {
    log(`  Could not delete menu: ${e.message}`, 'yellow');
  }

  // Wait a moment for deletion to process
  await sleep(1000);

  // Create new menu with same handle
  const createMutation = `
    mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu {
          id
          title
          handle
          items {
            title
            url
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await graphqlRequest(createMutation, { title, handle, items });

  if (result.data?.menuCreate?.userErrors?.length > 0) {
    log('\nErrors:', 'red');
    for (const error of result.data.menuCreate.userErrors) {
      console.log(`  ${error.field}: ${error.message}`);
    }
    return false;
  }

  return result.data?.menuCreate?.menu;
}

// Create a new menu for Smoke & Vape specifically
async function createSmokeVapeMenu() {
  log('\nCreating dedicated Smoke & Vape menu...', 'cyan');

  const items = [
    { title: 'Shop All', handle: 'smoke-and-vape', type: 'COLLECTION' },
    { title: 'Bongs & Water Pipes', handle: 'bongs-water-pipes', type: 'COLLECTION' },
    { title: 'Dab Rigs', handle: 'dab-rigs', type: 'COLLECTION' },
    { title: 'Hand Pipes', handle: 'hand-pipes', type: 'COLLECTION' },
    { title: 'Bubblers', handle: 'bubblers', type: 'COLLECTION' },
    { title: 'Nectar Collectors', handle: 'nectar-collectors', type: 'COLLECTION' },
    { title: 'One Hitters & Chillums', handle: 'one-hitters-chillums', type: 'COLLECTION' },
  ];

  const menuItems = [];
  for (const item of items) {
    const collectionId = await getCollectionId(item.handle);
    if (collectionId) {
      menuItems.push({
        title: item.title,
        type: 'COLLECTION',
        resourceId: collectionId,
      });
      console.log(`  ✓ ${item.title}`);
    } else {
      menuItems.push({
        title: item.title,
        type: 'HTTP',
        url: `/collections/${item.handle}`,
      });
      console.log(`  ⚠ ${item.title} (URL fallback)`);
    }
  }

  const mutation = `
    mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu {
          id
          title
          handle
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await graphqlRequest(mutation, {
    title: 'Smoke & Vape Menu',
    handle: 'smoke-vape-menu',
    items: menuItems,
  });

  if (result.data?.menuCreate?.userErrors?.length > 0) {
    const errors = result.data.menuCreate.userErrors;
    if (errors.some(e => e.message.includes('already exists'))) {
      log('  Menu already exists, updating instead...', 'yellow');
      // Get menu ID and update
      const existingMenu = await graphqlRequest(`
        query { menus(first: 50) { edges { node { id handle } } } }
      `);
      const menu = existingMenu.data?.menus?.edges?.find(
        e => e.node.handle === 'smoke-vape-menu'
      );
      if (menu) {
        return updateMenu(menu.node.id, menuItems);
      }
    } else {
      log('\nErrors:', 'red');
      for (const error of errors) {
        console.log(`  ${error.field}: ${error.message}`);
      }
      return false;
    }
  }

  return result.data?.menuCreate?.menu;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  log('\n' + '═'.repeat(70), 'bright');
  log('  AUTOMATED MENU SETUP', 'bright');
  log('═'.repeat(70), 'bright');

  if (dryRun) {
    log('  Mode: DRY RUN (use --execute to apply changes)', 'yellow');
  } else {
    log('  Mode: EXECUTING CHANGES', 'green');
  }

  try {
    // Build menu items
    const items = await buildMenuItems();

    console.log('\nProposed menu structure:');
    console.log(JSON.stringify(items, null, 2).substring(0, 2000) + '...');

    if (!dryRun) {
      // Update the main sidebar menu (best-selling)
      const SIDEBAR_MENU_ID = 'gid://shopify/Menu/9794912285';

      log('\n' + '='.repeat(70), 'bright');
      log('UPDATING SIDEBAR MENU (best-selling)', 'bright');
      log('='.repeat(70), 'bright');

      const result = await updateMenu(SIDEBAR_MENU_ID, items, 'Sidebar Menu', 'best-selling');

      if (result) {
        log('\n✓ Sidebar menu updated successfully!', 'green');
        console.log(`  Title: ${result.title}`);
        console.log(`  Handle: ${result.handle}`);
        console.log(`  Items: ${result.items?.length || 0}`);
      }

      // Create dedicated Smoke & Vape menu
      log('\n' + '='.repeat(70), 'bright');
      log('CREATING SMOKE & VAPE MENU', 'bright');
      log('='.repeat(70), 'bright');

      const smokeVapeMenu = await createSmokeVapeMenu();

      if (smokeVapeMenu) {
        log('\n✓ Smoke & Vape menu created/updated successfully!', 'green');
        console.log(`  ID: ${smokeVapeMenu.id}`);
        console.log(`  Handle: ${smokeVapeMenu.handle}`);
      }

      log('\n' + '='.repeat(70), 'bright');
      log('COMPLETE', 'green');
      log('='.repeat(70), 'bright');

      console.log('\nNext steps:');
      console.log('1. Go to Theme Customizer → Header');
      console.log('2. Set "Main menu" to "best-selling" or "smoke-vape-menu"');
      console.log('3. Configure mega menus if desired');

    } else {
      log('\n\nRun with --execute to apply these changes.', 'yellow');
    }

  } catch (error) {
    log(`\nError: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();
