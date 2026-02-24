#!/usr/bin/env node
/**
 * Automated Menu Setup
 *
 * Reads menu structure from config.js (single source of truth) and applies
 * it to Shopify via the GraphQL Admin API.
 *
 * Usage:
 *   npm run menu:auto              # Dry run — preview changes
 *   npm run menu:auto:execute      # Apply all menus to Shopify
 *   npm run menu:auto -- --menu=main     # Only main menu
 *   npm run menu:auto -- --menu=sidebar  # Only sidebar menu
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { config } from './config.js';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

const GRAPHQL_URL = `https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`;

// Colors for output
const C = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function log(msg, color = 'reset') {
  console.log(`${C[color]}${msg}${C.reset}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Collection ID Cache ────────────────────────────────────────────
const collectionCache = new Map();

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

// Get collection ID by handle (with cache)
async function getCollectionId(handle) {
  if (collectionCache.has(handle)) {
    return collectionCache.get(handle);
  }

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
    const id = result.data?.collectionByHandle?.id || null;
    collectionCache.set(handle, id);
    return id;
  } catch (e) {
    collectionCache.set(handle, null);
    return null;
  }
}

// ─── Extract collection handles from a menu item tree ───────────────
function extractHandles(items) {
  const handles = new Set();
  for (const item of items) {
    const match = item.url?.match(/^\/collections\/(.+)$/);
    if (match && match[1] !== 'all') {
      handles.add(match[1]);
    }
    if (item.children) {
      for (const h of extractHandles(item.children)) {
        handles.add(h);
      }
    }
  }
  return handles;
}

// ─── Validate all collections exist before building ─────────────────
async function validateCollections(items) {
  const handles = extractHandles(items);
  log(`\nValidating ${handles.size} collection references...`, 'cyan');

  const missing = [];
  for (const handle of handles) {
    const id = await getCollectionId(handle);
    if (id) {
      console.log(`  ${C.green}✓${C.reset} ${handle}`);
    } else {
      console.log(`  ${C.yellow}⚠${C.reset} ${handle} — not found (will use URL fallback)`);
      missing.push(handle);
    }
  }

  if (missing.length > 0) {
    log(`\n${missing.length} collection(s) not found — they will link by URL instead of resource ID.`, 'yellow');
  } else {
    log(`\nAll collections validated.`, 'green');
  }

  return missing;
}

// ─── Convert config menu items → Shopify GraphQL format ─────────────
async function convertItem(item) {
  const menuItem = { title: item.title };

  // URL-based item (e.g. /collections/xxx or #)
  const collectionMatch = item.url?.match(/^\/collections\/(.+)$/);

  if (collectionMatch && collectionMatch[1] !== 'all') {
    const handle = collectionMatch[1];
    const collectionId = await getCollectionId(handle);
    if (collectionId) {
      menuItem.type = 'COLLECTION';
      menuItem.resourceId = collectionId;
    } else {
      menuItem.type = 'HTTP';
      menuItem.url = item.url;
    }
  } else if (item.url === '/collections/all') {
    // "Shop All" links to the /collections/all catalog
    menuItem.type = 'CATALOG';
  } else if (item.url === '#' || !item.url) {
    menuItem.type = 'HTTP';
    menuItem.url = '#';
  } else {
    menuItem.type = 'HTTP';
    menuItem.url = item.url;
  }

  if (item.children && item.children.length > 0) {
    menuItem.items = [];
    for (const child of item.children) {
      menuItem.items.push(await convertItem(child));
    }
  }

  return menuItem;
}

// ─── Print tree preview of menu ─────────────────────────────────────
function printTree(items, indent = '') {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isLast = i === items.length - 1;
    const branch = isLast ? '└─' : '├─';
    const childIndent = indent + (isLast ? '   ' : '│  ');

    const url = item.url || '';
    console.log(`${indent}${branch} ${C.bright}${item.title}${C.reset} ${C.dim}${url}${C.reset}`);

    if (item.children && item.children.length > 0) {
      printTree(item.children, childIndent);
    }
  }
}

// ─── Fetch existing menus to find the right one to replace ──────────
async function fetchExistingMenus() {
  const query = `
    query {
      menus(first: 50) {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
  `;

  const result = await graphqlRequest(query);
  return result.data?.menus?.edges?.map(e => e.node) || [];
}

// ─── Delete + recreate a menu ───────────────────────────────────────
async function replaceMenu(menuId, items, title, handle) {
  // Delete existing
  const deleteMutation = `
    mutation menuDelete($id: ID!) {
      menuDelete(id: $id) {
        deletedMenuId
        userErrors { field message }
      }
    }
  `;

  try {
    const deleteResult = await graphqlRequest(deleteMutation, { id: menuId });
    if (deleteResult.data?.menuDelete?.deletedMenuId) {
      log(`  Deleted existing menu: ${menuId}`, 'yellow');
    }
  } catch (e) {
    log(`  Could not delete menu: ${e.message}`, 'yellow');
  }

  await sleep(1000);

  // Create new
  return await createMenu(items, title, handle);
}

async function createMenu(items, title, handle) {
  const createMutation = `
    mutation menuCreate($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(title: $title, handle: $handle, items: $items) {
        menu {
          id
          title
          handle
        }
        userErrors { field message }
      }
    }
  `;

  const result = await graphqlRequest(createMutation, { title, handle, items });

  if (result.data?.menuCreate?.userErrors?.length > 0) {
    log('\nErrors:', 'red');
    for (const error of result.data.menuCreate.userErrors) {
      console.log(`  ${error.field}: ${error.message}`);
    }
    return null;
  }

  return result.data?.menuCreate?.menu;
}

// ─── Process one menu definition from config ────────────────────────
async function processMenu(menuDef, existingMenus, dryRun) {
  log(`\n${'═'.repeat(60)}`, 'bright');
  log(`  ${menuDef.title} (handle: ${menuDef.handle})`, 'bright');
  log(`${'═'.repeat(60)}`, 'bright');

  // Validate
  await validateCollections(menuDef.items);

  // Show tree preview
  log('\nProposed menu structure:', 'cyan');
  printTree(menuDef.items);

  if (dryRun) {
    log('\n  [DRY RUN] No changes applied.', 'yellow');
    return;
  }

  // Convert to GraphQL format
  log('\nConverting to Shopify format...', 'cyan');
  const graphqlItems = [];
  for (const item of menuDef.items) {
    graphqlItems.push(await convertItem(item));
  }

  // Find existing menu by handle
  const existing = existingMenus.find(m => m.handle === menuDef.handle);

  let result;
  if (existing) {
    log(`\nReplacing existing menu "${existing.title}" (${existing.id})...`, 'cyan');
    result = await replaceMenu(existing.id, graphqlItems, menuDef.title, menuDef.handle);
  } else {
    log(`\nCreating new menu "${menuDef.title}"...`, 'cyan');
    result = await createMenu(graphqlItems, menuDef.title, menuDef.handle);
  }

  if (result) {
    log(`\n✓ ${menuDef.title} applied successfully!`, 'green');
    console.log(`  ID: ${result.id}`);
    console.log(`  Handle: ${result.handle}`);
    console.log(`  Handle: ${result.handle}`);
  } else {
    log(`\n✗ Failed to apply ${menuDef.title}`, 'red');
  }

  return result;
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  const menuFilter = args.find(a => a.startsWith('--menu='))?.split('=')[1];

  if (!STORE_URL || !ACCESS_TOKEN) {
    log('\nError: SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN must be set in .env', 'red');
    process.exit(1);
  }

  log('\n' + '═'.repeat(70), 'bright');
  log('  AUTOMATED MENU SETUP (config-driven)', 'bright');
  log('═'.repeat(70), 'bright');

  if (dryRun) {
    log('  Mode: DRY RUN (use --execute to apply changes)', 'yellow');
  } else {
    log('  Mode: EXECUTING CHANGES', 'green');
  }

  if (menuFilter) {
    log(`  Filter: ${menuFilter} menu only`, 'cyan');
  }

  try {
    const menuDefs = config.menuStructure;
    const menusToProcess = [];

    if (!menuFilter || menuFilter === 'main') {
      menusToProcess.push(menuDefs.main);
    }
    if (!menuFilter || menuFilter === 'sidebar') {
      menusToProcess.push(menuDefs.sidebar);
    }

    if (menusToProcess.length === 0) {
      log(`\nNo menu matching "${menuFilter}" found in config.`, 'red');
      process.exit(1);
    }

    // Fetch existing menus (needed for replace)
    let existingMenus = [];
    if (!dryRun) {
      log('\nFetching existing menus from Shopify...', 'cyan');
      existingMenus = await fetchExistingMenus();
      for (const m of existingMenus) {
        console.log(`  ${m.handle} — "${m.title}"`);
      }
    }

    for (const menuDef of menusToProcess) {
      await processMenu(menuDef, existingMenus, dryRun);
    }

    log('\n' + '═'.repeat(70), 'bright');
    if (dryRun) {
      log('DRY RUN COMPLETE — run with --execute to apply', 'yellow');
    } else {
      log('ALL MENUS APPLIED', 'green');
      console.log('\nNext steps:');
      console.log('1. Go to Shopify Admin → Online Store → Navigation');
      console.log('2. Verify the menus appear correctly');
      console.log('3. In Theme Customizer → Header, assign the main menu');
      console.log('4. In Theme Customizer → Drawer/Sidebar, assign the sidebar menu');
    }
    log('═'.repeat(70), 'bright');

  } catch (error) {
    log(`\nError: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();
