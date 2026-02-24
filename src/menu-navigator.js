#!/usr/bin/env node
/**
 * Menu Navigator — Comprehensive navigation inspection tool
 *
 * Subcommands (via CLI flags):
 *   (none)         Full report: collections + menus + validation + orphans + suggestions
 *   --collections  List all collections with product counts
 *   --menus        Show current live menu structure from Shopify
 *   --validate     Check config references against actual store collections
 *   --orphans      Find collections not linked from any menu
 *   --suggest      Suggest improvements (thin collections in menus, large orphans, etc.)
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { config } from './config.js';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

const GRAPHQL_URL = `https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`;

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
        await sleep(2000 * attempt);
      } else {
        throw error;
      }
    }
  }
}

// ─── Fetch all collections with product counts ──────────────────────
async function fetchAllCollections() {
  const collections = [];
  let cursor = null;
  let page = 0;

  while (true) {
    page++;
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const query = `
      query {
        collections(first: 50${afterClause}) {
          pageInfo { hasNextPage }
          edges {
            cursor
            node {
              id
              title
              handle
              productsCount { count }
              updatedAt
              ruleSet { rules { column relation condition } }
            }
          }
        }
      }
    `;

    const result = await graphqlRequest(query);
    const edges = result.data?.collections?.edges || [];
    for (const edge of edges) {
      const node = edge.node;
      // Normalize productsCount from { count: N } to plain number
      node.productsCount = node.productsCount?.count ?? 0;
      collections.push(node);
      cursor = edge.cursor;
    }

    if (!result.data?.collections?.pageInfo?.hasNextPage) break;
    if (page > 20) break; // safety limit
  }

  return collections;
}

// ─── Fetch live menus from Shopify ──────────────────────────────────
async function fetchMenus() {
  const query = `
    query {
      menus(first: 50) {
        edges {
          node {
            id
            title
            handle
            items {
              title
              type
              url
              resourceId
              items {
                title
                type
                url
                resourceId
              }
            }
          }
        }
      }
    }
  `;

  const result = await graphqlRequest(query);
  return result.data?.menus?.edges?.map(e => e.node) || [];
}

// ─── Extract handles referenced in config menus ─────────────────────
function getConfigMenuHandles() {
  const handles = new Set();

  function walk(items) {
    for (const item of items) {
      const match = item.url?.match(/^\/collections\/(.+)$/);
      if (match && match[1] !== 'all') {
        handles.add(match[1]);
      }
      if (item.children) walk(item.children);
    }
  }

  const menuDefs = config.menuStructure;
  if (menuDefs.main) walk(menuDefs.main.items);
  if (menuDefs.sidebar) walk(menuDefs.sidebar.items);

  return handles;
}

// ─── Subcommand: List collections ───────────────────────────────────
async function cmdCollections() {
  log('\n' + '═'.repeat(70), 'bright');
  log('  ALL COLLECTIONS', 'bright');
  log('═'.repeat(70), 'bright');

  const collections = await fetchAllCollections();
  collections.sort((a, b) => (b.productsCount || 0) - (a.productsCount || 0));

  console.log(`\nFound ${collections.length} collections:\n`);
  console.log(`${'Handle'.padEnd(40)} ${'Title'.padEnd(35)} Products`);
  console.log(`${'─'.repeat(40)} ${'─'.repeat(35)} ${'─'.repeat(8)}`);

  for (const col of collections) {
    const count = col.productsCount ?? '?';
    const countStr = String(count).padStart(8);
    const color = count === 0 ? C.red : count < 5 ? C.yellow : C.reset;
    console.log(`${color}${col.handle.padEnd(40)} ${col.title.substring(0, 35).padEnd(35)} ${countStr}${C.reset}`);
  }

  console.log(`\nTotal: ${collections.length} collections`);
  return collections;
}

// ─── Subcommand: Show live menus ────────────────────────────────────
async function cmdMenus() {
  log('\n' + '═'.repeat(70), 'bright');
  log('  LIVE MENUS FROM SHOPIFY', 'bright');
  log('═'.repeat(70), 'bright');

  const menus = await fetchMenus();

  for (const menu of menus) {
    log(`\n${menu.title} (handle: ${menu.handle}, ${menu.items?.length || 0} top-level items)`, 'cyan');
    log(`  ID: ${menu.id}`, 'dim');

    for (const item of menu.items) {
      const url = item.url || item.resourceId || '';
      console.log(`  ├─ ${C.bright}${item.title}${C.reset} ${C.dim}[${item.type}] ${url}${C.reset}`);
      if (item.items) {
        for (let i = 0; i < item.items.length; i++) {
          const child = item.items[i];
          const branch = i === item.items.length - 1 ? '└─' : '├─';
          const childUrl = child.url || child.resourceId || '';
          console.log(`  │  ${branch} ${child.title} ${C.dim}[${child.type}] ${childUrl}${C.reset}`);
        }
      }
    }
  }

  return menus;
}

// ─── Subcommand: Validate config against store ──────────────────────
async function cmdValidate() {
  log('\n' + '═'.repeat(70), 'bright');
  log('  VALIDATE CONFIG vs STORE', 'bright');
  log('═'.repeat(70), 'bright');

  const configHandles = getConfigMenuHandles();
  const collections = await fetchAllCollections();
  const storeHandles = new Set(collections.map(c => c.handle));

  log(`\nConfig references ${configHandles.size} collection handles.`, 'cyan');
  log(`Store has ${storeHandles.size} collections.\n`, 'cyan');

  let missingCount = 0;
  for (const handle of [...configHandles].sort()) {
    if (storeHandles.has(handle)) {
      console.log(`  ${C.green}✓${C.reset} ${handle}`);
    } else {
      console.log(`  ${C.red}✗${C.reset} ${handle} — NOT FOUND in store`);
      missingCount++;
    }
  }

  if (missingCount > 0) {
    log(`\n${missingCount} collection(s) referenced in config but missing from store.`, 'red');
    log('These menus will fall back to URL links instead of collection resource IDs.', 'yellow');
  } else {
    log('\nAll config collection references are valid.', 'green');
  }

  return { configHandles, storeHandles, missingCount };
}

// ─── Subcommand: Find orphan collections ────────────────────────────
async function cmdOrphans() {
  log('\n' + '═'.repeat(70), 'bright');
  log('  ORPHAN COLLECTIONS (not in any menu)', 'bright');
  log('═'.repeat(70), 'bright');

  const configHandles = getConfigMenuHandles();
  const collections = await fetchAllCollections();

  const orphans = collections.filter(c => !configHandles.has(c.handle));
  orphans.sort((a, b) => (b.productsCount || 0) - (a.productsCount || 0));

  console.log(`\n${orphans.length} collections not linked from any menu:\n`);
  console.log(`${'Handle'.padEnd(40)} ${'Title'.padEnd(30)} Products`);
  console.log(`${'─'.repeat(40)} ${'─'.repeat(30)} ${'─'.repeat(8)}`);

  for (const col of orphans) {
    const count = col.productsCount ?? '?';
    const countStr = String(count).padStart(8);
    const color = count === 0 ? C.red : count >= 20 ? C.yellow : C.dim;
    console.log(`${color}${col.handle.padEnd(40)} ${col.title.substring(0, 30).padEnd(30)} ${countStr}${C.reset}`);
  }

  const large = orphans.filter(c => (c.productsCount || 0) >= 20);
  if (large.length > 0) {
    log(`\n${large.length} orphans with 20+ products — consider adding to menus:`, 'yellow');
    for (const col of large) {
      console.log(`  ${C.yellow}→${C.reset} ${col.handle} (${col.productsCount} products)`);
    }
  }

  return orphans;
}

// ─── Subcommand: Suggest improvements ───────────────────────────────
async function cmdSuggest() {
  log('\n' + '═'.repeat(70), 'bright');
  log('  SUGGESTIONS', 'bright');
  log('═'.repeat(70), 'bright');

  const configHandles = getConfigMenuHandles();
  const collections = await fetchAllCollections();
  const collectionMap = new Map(collections.map(c => [c.handle, c]));

  const suggestions = [];

  // 1. Thin collections in menus (< 5 products)
  for (const handle of configHandles) {
    const col = collectionMap.get(handle);
    if (col && (col.productsCount || 0) < 5 && (col.productsCount || 0) > 0) {
      suggestions.push({
        type: 'thin',
        handle,
        products: col.productsCount,
        message: `"${col.title}" has only ${col.productsCount} products — consider merging or removing from menu`,
      });
    }
    if (col && col.productsCount === 0) {
      suggestions.push({
        type: 'empty',
        handle,
        products: 0,
        message: `"${col.title}" has 0 products — remove from menu or add products`,
      });
    }
  }

  // 2. Large orphan collections (>= 20 products, not in menu)
  const orphans = collections.filter(c => !configHandles.has(c.handle) && (c.productsCount || 0) >= 20);
  for (const col of orphans) {
    suggestions.push({
      type: 'orphan',
      handle: col.handle,
      products: col.productsCount,
      message: `"${col.title}" has ${col.productsCount} products but isn't linked from any menu`,
    });
  }

  // 3. Collections scheduled for deletion that are still live
  const toDelete = config.collections?.toDelete || [];
  for (const handle of toDelete) {
    if (collectionMap.has(handle)) {
      suggestions.push({
        type: 'pending-delete',
        handle,
        products: collectionMap.get(handle).productsCount,
        message: `"${handle}" is marked for deletion in config but still exists in store`,
      });
    }
  }

  if (suggestions.length === 0) {
    log('\nNo suggestions — everything looks good!', 'green');
  } else {
    console.log(`\n${suggestions.length} suggestion(s):\n`);
    for (const s of suggestions) {
      const icon = s.type === 'empty' ? `${C.red}✗` :
                   s.type === 'thin' ? `${C.yellow}⚠` :
                   s.type === 'orphan' ? `${C.magenta}?` :
                   `${C.cyan}⌛`;
      console.log(`  ${icon}${C.reset} [${s.type}] ${s.message}`);
    }
  }

  return suggestions;
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (!STORE_URL || !ACCESS_TOKEN) {
    log('\nError: SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN must be set in .env', 'red');
    process.exit(1);
  }

  const mode = args.find(a => a.startsWith('--'))?.replace('--', '') || 'full';

  try {
    switch (mode) {
      case 'collections':
        await cmdCollections();
        break;
      case 'menus':
        await cmdMenus();
        break;
      case 'validate':
        await cmdValidate();
        break;
      case 'orphans':
        await cmdOrphans();
        break;
      case 'suggest':
        await cmdSuggest();
        break;
      case 'full':
      default:
        await cmdCollections();
        await cmdMenus();
        await cmdValidate();
        await cmdOrphans();
        await cmdSuggest();
        break;
    }
  } catch (error) {
    log(`\nError: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();
