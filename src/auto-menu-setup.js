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
 *   npm run menu:auto -- --cleanup       # Only delete legacy menus (dry run)
 *   npm run menu:auto -- --cleanup --execute  # Delete legacy menus for real
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

// ─── Update a menu in-place (preserves handle) ─────────────────────
async function updateMenu(menuId, items, title) {
  // menuUpdate uses MenuItemUpdateInput (not MenuItemCreateInput)
  // Omitting item IDs causes Shopify to replace all items with the new set
  const updateMutation = `
    mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu {
          id
          title
          handle
        }
        userErrors { field message }
      }
    }
  `;

  const result = await graphqlRequest(updateMutation, { id: menuId, title, items });

  if (result.data?.menuUpdate?.userErrors?.length > 0) {
    log('\nErrors:', 'red');
    for (const error of result.data.menuUpdate.userErrors) {
      console.log(`  ${error.field}: ${error.message}`);
    }
    return null;
  }

  return result.data?.menuUpdate?.menu;
}

// ─── Delete a menu by ID ────────────────────────────────────────────
async function deleteMenu(menuId) {
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
      log(`  Deleted menu: ${menuId}`, 'yellow');
      return true;
    }
  } catch (e) {
    log(`  Could not delete menu: ${e.message}`, 'yellow');
  }
  return false;
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

  // Find existing menu by handle (exact match first, then prefix match for duplicates)
  const existing = existingMenus.find(m => m.handle === menuDef.handle);

  // Also find and delete any duplicates (e.g. main-menu-1, main-menu-2)
  const duplicates = existingMenus.filter(m =>
    m.handle !== menuDef.handle &&
    m.handle.match(new RegExp(`^${menuDef.handle}-\\d+$`))
  );

  if (duplicates.length > 0) {
    log(`\nCleaning up ${duplicates.length} duplicate menu(s)...`, 'yellow');
    for (const dup of duplicates) {
      log(`  Deleting duplicate "${dup.title}" (${dup.handle}, ${dup.id})...`, 'yellow');
      await deleteMenu(dup.id);
      await sleep(500);
    }
  }

  let result;
  if (existing) {
    log(`\nUpdating existing menu "${existing.title}" (${existing.id}) in-place...`, 'cyan');
    result = await updateMenu(existing.id, graphqlItems, menuDef.title);
  } else {
    log(`\nCreating new menu "${menuDef.title}"...`, 'cyan');
    result = await createMenu(graphqlItems, menuDef.title, menuDef.handle);
  }

  if (result) {
    log(`\n✓ ${menuDef.title} applied successfully!`, 'green');
    console.log(`  ID: ${result.id}`);
    console.log(`  Handle: ${result.handle}`);
  } else {
    log(`\n✗ Failed to apply ${menuDef.title}`, 'red');
  }

  return result;
}

// ─── Delete legacy menus listed in config.legacyMenusToDelete ────────
async function cleanupLegacyMenus(existingMenus, dryRun) {
  const legacyHandles = config.legacyMenusToDelete || [];
  if (legacyHandles.length === 0) {
    log('\nNo legacy menus configured for deletion.', 'dim');
    return;
  }

  log(`\n${'═'.repeat(60)}`, 'bright');
  log('  LEGACY MENU CLEANUP', 'bright');
  log(`${'═'.repeat(60)}`, 'bright');

  const toDelete = existingMenus.filter(m => legacyHandles.includes(m.handle));
  const notFound = legacyHandles.filter(h => !existingMenus.some(m => m.handle === h));

  if (notFound.length > 0) {
    log(`\n  ${notFound.length} legacy menu(s) already removed:`, 'dim');
    for (const h of notFound) {
      console.log(`    ${C.dim}✓ ${h}${C.reset}`);
    }
  }

  if (toDelete.length === 0) {
    log('\n  All legacy menus already cleaned up.', 'green');
    return;
  }

  log(`\n  ${toDelete.length} legacy menu(s) to delete:`, 'yellow');
  for (const m of toDelete) {
    console.log(`    ${C.red}✗${C.reset} ${m.handle} — "${m.title}" (${m.id})`);
  }

  if (dryRun) {
    log('\n  [DRY RUN] No menus deleted.', 'yellow');
    return;
  }

  for (const m of toDelete) {
    log(`\n  Deleting "${m.title}" (${m.handle})...`, 'yellow');
    const deleted = await deleteMenu(m.id);
    if (deleted) {
      log(`    ✓ Deleted`, 'green');
    } else {
      log(`    ✗ Failed to delete`, 'red');
    }
    await sleep(500);
  }

  log(`\n  Legacy menu cleanup complete.`, 'green');
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  const menuFilter = args.find(a => a.startsWith('--menu='))?.split('=')[1];
  const cleanupOnly = args.includes('--cleanup');

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

  if (cleanupOnly) {
    log('  Task: Legacy menu cleanup only', 'cyan');
  } else if (menuFilter) {
    log(`  Filter: ${menuFilter} menu only`, 'cyan');
  }

  try {
    // Fetch existing menus (needed for replace and cleanup)
    log('\nFetching existing menus from Shopify...', 'cyan');
    const existingMenus = await fetchExistingMenus();
    for (const m of existingMenus) {
      console.log(`  ${m.handle} — "${m.title}"`);
    }

    // Always run legacy menu cleanup (before menu updates)
    await cleanupLegacyMenus(existingMenus, dryRun);

    if (!cleanupOnly) {
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

      for (const menuDef of menusToProcess) {
        await processMenu(menuDef, existingMenus, dryRun);
      }
    }

    log('\n' + '═'.repeat(70), 'bright');
    if (dryRun) {
      log('DRY RUN COMPLETE — run with --execute to apply', 'yellow');
    } else {
      log('ALL MENUS APPLIED', 'green');
      if (!cleanupOnly) {
        console.log('\nNext steps:');
        console.log('1. Go to Shopify Admin → Online Store → Navigation');
        console.log('2. Verify the menus appear correctly');
        console.log('3. In Theme Customizer → Header, assign the main menu');
        console.log('4. In Theme Customizer → Drawer/Sidebar, assign the sidebar menu');
      }
    }
    log('═'.repeat(70), 'bright');

  } catch (error) {
    log(`\nError: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();
