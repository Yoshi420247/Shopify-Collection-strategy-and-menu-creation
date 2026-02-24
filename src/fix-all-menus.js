#!/usr/bin/env node
/**
 * Comprehensive Menu Fix Script
 *
 * Fixes ALL issues found in the full menu audit:
 * - Removes empty collections (0 products): silicone-pads, glass-jars, joint-tubes, elements
 * - Fixes 4 broken links (404s): silicone-pipes, rolling-papers, non-stick-containers, non-stick-paper-and-ptfe
 * - Removes Vapes & Electronics duplicate from sidebar Accessories
 * - Fixes Online Headshop parent links (Brands→raw, Featured→heady-glass)
 * - Adds New Arrivals, Best Sellers, On Sale to Featured sections
 */
import 'dotenv/config';
import { execSync } from 'child_process';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const GRAPHQL_URL = `https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`;

const DRY_RUN = !process.argv.includes('--execute');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function gql(query, variables = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const body = JSON.stringify({ query, variables }).replace(/'/g, "'\\''");
      const cmd = `curl -s --max-time 30 -X POST "${GRAPHQL_URL}" ` +
        `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" ` +
        `-H "Content-Type: application/json" ` +
        `-d '${body}'`;
      const raw = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
      const result = JSON.parse(raw);
      if (result.errors) throw new Error(JSON.stringify(result.errors));
      return result;
    } catch (e) {
      if (attempt < retries) { await sleep(2000 * attempt); continue; }
      throw e;
    }
  }
}

// Collection ID cache
const collectionIds = {};
async function getCollectionId(handle) {
  if (collectionIds[handle]) return collectionIds[handle];
  const r = await gql(`{ collectionByHandle(handle: "${handle}") { id } }`);
  const id = r.data?.collectionByHandle?.id || null;
  collectionIds[handle] = id;
  return id;
}

// Build a menu item for the mutation
function buildItem(title, url, children = []) {
  return { title, url, children };
}

// Convert our simple item format to Shopify mutation input
async function toShopifyItem(item) {
  const result = { title: item.title };

  // Determine if this is a collection link
  const collMatch = item.url?.match(/\/collections\/(.+)/);
  if (collMatch && collMatch[1] !== 'all') {
    const handle = collMatch[1];
    const colId = await getCollectionId(handle);
    if (colId) {
      result.resourceId = colId;
      result.type = 'COLLECTION';
    } else {
      // Collection doesn't exist - use HTTP fallback
      result.url = `https://${STORE_URL}${item.url}`;
      result.type = 'HTTP';
    }
  } else if (item.url === '/collections/all') {
    result.type = 'CATALOG';
  } else if (item.url === '#' || !item.url) {
    result.url = '#';
    result.type = 'HTTP';
  } else {
    result.url = item.url.startsWith('http') ? item.url : `https://${STORE_URL}${item.url}`;
    result.type = 'HTTP';
  }

  if (item.children && item.children.length > 0) {
    result.items = [];
    for (const child of item.children) {
      result.items.push(await toShopifyItem(child));
    }
  }

  return result;
}

async function updateMenu(menuId, title, items) {
  // Convert all items to Shopify format
  const shopifyItems = [];
  for (const item of items) {
    shopifyItems.push(await toShopifyItem(item));
  }

  if (DRY_RUN) {
    console.log(`\n  [DRY RUN] Would update "${title}" with ${items.length} top-level items:`);
    function printPreview(items, depth = 0) {
      for (const item of items) {
        const indent = '    '.repeat(depth + 1);
        console.log(`${indent}${item.title} → ${item.resourceId || item.url || '?'} [${item.type}]`);
        if (item.items) printPreview(item.items, depth + 1);
      }
    }
    printPreview(shopifyItems);
    return true;
  }

  const mutation = `
    mutation menuUpdate($id: ID!, $title: String!, $items: [MenuItemUpdateInput!]!) {
      menuUpdate(id: $id, title: $title, items: $items) {
        menu { id title }
        userErrors { field message }
      }
    }
  `;

  const result = await gql(mutation, { id: menuId, title, items: shopifyItems });
  const errors = result.data?.menuUpdate?.userErrors;
  if (errors && errors.length > 0) {
    console.log(`  ❌ ERRORS updating "${title}":`, errors);
    return false;
  }
  console.log(`  ✅ Updated "${title}" successfully`);
  return true;
}

// ─── MENU DEFINITIONS ──────────────────────────────────────────────

const FIXES = {
  // 1. MAIN MENU
  'main-menu': {
    id: 'gid://shopify/Menu/113750979',
    title: 'Main menu',
    items: [
      buildItem('Shop All', '/collections/all'),
      buildItem('Smoke & Vape', '/collections/smoke-and-vape', [
        buildItem('Bongs & Water Pipes', '/collections/bongs-water-pipes'),
        buildItem('Dab Rigs', '/collections/dab-rigs'),
        buildItem('Hand Pipes', '/collections/hand-pipes'),
        buildItem('Bubblers', '/collections/bubblers'),
        buildItem('Nectar Collectors', '/collections/nectar-collectors'),
        buildItem('One Hitters & Chillums', '/collections/one-hitters-chillums'),
        buildItem('Steamrollers', '/collections/steamrollers'),
        buildItem('Silicone Pieces', '/collections/silicone-rigs-bongs'),
        buildItem('Novelty & Character Pipes', '/collections/novelty-character-pipes'),
        buildItem('Vapes & Electronics', '/collections/vapes-electronics'),
        buildItem('Shop All Smoke & Vape', '/collections/smoke-and-vape'),
      ]),
      buildItem('Accessories', '/collections/accessories', [
        buildItem('Dab Accessories', '/collections/dab-accessories'),
        buildItem('Quartz Bangers', '/collections/quartz-bangers'),
        buildItem('Carb Caps', '/collections/carb-caps'),
        buildItem('Dab Tools', '/collections/dab-tools'),
        buildItem('Torches', '/collections/torches'),
        buildItem('Flower Accessories', '/collections/flower-accessories'),
        buildItem('Flower Bowls', '/collections/flower-bowls'),
        buildItem('Ash Catchers', '/collections/ash-catchers'),
        buildItem('Downstems', '/collections/downstems'),
        buildItem('Adapters & Drop Downs', '/collections/adapters'),
        buildItem('Ashtrays', '/collections/ashtrays'),
        buildItem('Grinders', '/collections/grinders'),
        buildItem('Rolling Papers & Cones', '/collections/rolling-papers-cones'),
        buildItem('Storage & Containers', '/collections/storage-containers'),
        buildItem('Trays & Work Surfaces', '/collections/trays-work-surfaces'),
        buildItem('Cleaning Supplies', '/collections/cleaning-supplies'),
      ]),
      buildItem('Extraction & Packaging', '/collections/extraction-packaging', [
        // REMOVED: silicone-pads (0 products), glass-jars (0 products), joint-tubes (0 products)
        buildItem('FEP Sheets & Rolls', '/collections/fep-sheets'),
        buildItem('PTFE Sheets & Rolls', '/collections/ptfe-sheets'),
        buildItem('Parchment Paper', '/collections/parchment-paper'),
        buildItem('Concentrate Containers', '/collections/concentrate-containers'),
        buildItem('Mylar Bags', '/collections/mylar-bags'),
        buildItem('Shop All Extraction', '/collections/extraction-packaging'),
      ]),
      buildItem('Brands', '#', [
        // REMOVED: elements (0 products)
        buildItem('RAW', '/collections/raw'),
        buildItem('Zig Zag', '/collections/zig-zag'),
        buildItem('Vibes', '/collections/vibes'),
        buildItem('Cookies', '/collections/cookies'),
        buildItem('Monark', '/collections/monark'),
        buildItem('Maven', '/collections/maven'),
        buildItem('Puffco', '/collections/puffco'),
        buildItem('Lookah', '/collections/lookah'),
        buildItem('G Pen', '/collections/g-pen'),
        buildItem('710 SCI', '/collections/710-sci'),
        buildItem('Scorch', '/collections/scorch'),
        buildItem('Peaselburg', '/collections/peaselburg'),
        buildItem('Only Quartz', '/collections/only-quartz'),
        buildItem('EO Vape', '/collections/eo-vape'),
      ]),
      buildItem('Featured', '#', [
        // ADDED: New Arrivals, Best Sellers, On Sale
        buildItem('New Arrivals', '/collections/new-arrivals'),
        buildItem('Best Sellers', '/collections/best-sellers'),
        buildItem('On Sale', '/collections/on-sale'),
        buildItem('Heady Glass', '/collections/heady-glass'),
        buildItem('Made In USA', '/collections/made-in-usa'),
        buildItem('Novelty & Character Pipes', '/collections/novelty-character-pipes'),
        buildItem('Glass Pendants', '/collections/glass-pendants'),
        buildItem('Pendants & Merch', '/collections/pendants-merch'),
        buildItem('Travel Friendly', '/collections/travel-friendly'),
        buildItem('Gifts', '/collections/gifts'),
        buildItem('Clearance', '/collections/clearance'),
      ]),
    ],
  },

  // 2. SIDEBAR MENU
  'sidebar-menu': {
    id: 'gid://shopify/Menu/306365923608',
    title: 'Sidebar Menu',
    items: [
      buildItem('Smoke & Vape', '/collections/smoke-and-vape', [
        buildItem('Shop All Smoke & Vape', '/collections/smoke-and-vape'),
        buildItem('Bongs & Water Pipes', '/collections/bongs-water-pipes'),
        buildItem('Dab Rigs', '/collections/dab-rigs'),
        buildItem('Hand Pipes', '/collections/hand-pipes'),
        buildItem('Bubblers', '/collections/bubblers'),
        buildItem('Nectar Collectors', '/collections/nectar-collectors'),
        buildItem('One Hitters & Chillums', '/collections/one-hitters-chillums'),
        buildItem('Steamrollers', '/collections/steamrollers'),
        buildItem('Silicone Pieces', '/collections/silicone-rigs-bongs'),
        buildItem('Novelty & Character Pipes', '/collections/novelty-character-pipes'),
        buildItem('Vapes & Electronics', '/collections/vapes-electronics'),
      ]),
      buildItem('Accessories', '/collections/accessories', [
        buildItem('Dab Accessories', '/collections/dab-accessories'),
        buildItem('Flower Accessories', '/collections/flower-accessories'),
        buildItem('Quartz Bangers', '/collections/quartz-bangers'),
        buildItem('Carb Caps', '/collections/carb-caps'),
        buildItem('Dab Tools', '/collections/dab-tools'),
        buildItem('Flower Bowls', '/collections/flower-bowls'),
        buildItem('Ash Catchers', '/collections/ash-catchers'),
        buildItem('Torches', '/collections/torches'),
        buildItem('Adapters & Drop Downs', '/collections/adapters'),
        buildItem('Ashtrays', '/collections/ashtrays'),
        buildItem('Grinders', '/collections/grinders'),
        buildItem('Rolling Papers & Cones', '/collections/rolling-papers-cones'),
        // REMOVED: Vapes & Electronics duplicate (already in Smoke & Vape)
        buildItem('Storage & Containers', '/collections/storage-containers'),
        buildItem('Trays & Work Surfaces', '/collections/trays-work-surfaces'),
        buildItem('Cleaning Supplies', '/collections/cleaning-supplies'),
      ]),
      buildItem('Extraction & Packaging', '/collections/extraction-packaging', [
        // REMOVED: silicone-pads (0), glass-jars (0), joint-tubes (0)
        buildItem('FEP Sheets & Rolls', '/collections/fep-sheets'),
        buildItem('PTFE Sheets & Rolls', '/collections/ptfe-sheets'),
        buildItem('Parchment Paper', '/collections/parchment-paper'),
        buildItem('Concentrate Containers', '/collections/concentrate-containers'),
        buildItem('Mylar Bags', '/collections/mylar-bags'),
      ]),
      buildItem('Brands', '#', [
        buildItem('RAW', '/collections/raw'),
        buildItem('Monark', '/collections/monark'),
        buildItem('Zig Zag', '/collections/zig-zag'),
        buildItem('Cookies', '/collections/cookies'),
        buildItem('Maven', '/collections/maven'),
        buildItem('Vibes', '/collections/vibes'),
        buildItem('Puffco', '/collections/puffco'),
        buildItem('Lookah', '/collections/lookah'),
        buildItem('G Pen', '/collections/g-pen'),
        buildItem('Peaselburg', '/collections/peaselburg'),
        buildItem('Only Quartz', '/collections/only-quartz'),
        buildItem('EO Vape', '/collections/eo-vape'),
      ]),
      buildItem('Featured', '#', [
        // ADDED: New Arrivals, Best Sellers, On Sale
        buildItem('New Arrivals', '/collections/new-arrivals'),
        buildItem('Best Sellers', '/collections/best-sellers'),
        buildItem('On Sale', '/collections/on-sale'),
        buildItem('Heady Glass', '/collections/heady-glass'),
        buildItem('Made In USA', '/collections/made-in-usa'),
        buildItem('Pendants & Merch', '/collections/pendants-merch'),
        buildItem('Travel Friendly', '/collections/travel-friendly'),
        buildItem('Clearance', '/collections/clearance'),
      ]),
    ],
  },

  // 3. ONLINE HEADSHOP MENU
  'online-headshop': {
    id: 'gid://shopify/Menu/302512701720',
    title: 'Online Headshop',
    items: [
      buildItem('Shop All', '/collections/all'),
      buildItem('Extraction & Packaging', '/collections/extraction-packaging', [
        // REMOVED: silicone-pads (0), glass-jars (0)
        buildItem('FEP Sheets & Rolls', '/collections/fep-sheets'),
        buildItem('PTFE Sheets & Rolls', '/collections/ptfe-sheets'),
        buildItem('Parchment Paper', '/collections/parchment-paper'),
        buildItem('Concentrate Containers', '/collections/concentrate-containers'),
        buildItem('Shop All Extraction', '/collections/extraction-packaging'),
      ]),
      buildItem('Accessories', '/collections/accessories', [
        buildItem('Quartz Bangers', '/collections/quartz-bangers'),
        buildItem('Carb Caps', '/collections/carb-caps'),
        buildItem('Dab Tools', '/collections/dab-tools'),
        buildItem('Torches', '/collections/torches'),
        buildItem('Flower Bowls', '/collections/flower-bowls'),
        buildItem('Grinders', '/collections/grinders'),
        buildItem('Rolling Papers & Cones', '/collections/rolling-papers-cones'),
        buildItem('Trays & Work Surfaces', '/collections/trays-work-surfaces'),
      ]),
      buildItem('Brands', '#', [
        // FIXED: parent link changed from raw → #
        // REMOVED: elements (0 products)
        buildItem('RAW', '/collections/raw'),
        buildItem('Zig Zag', '/collections/zig-zag'),
        buildItem('Vibes', '/collections/vibes'),
        buildItem('Cookies', '/collections/cookies'),
        buildItem('Puffco', '/collections/puffco'),
        buildItem('Lookah', '/collections/lookah'),
        buildItem('Maven', '/collections/maven'),
        buildItem('G Pen', '/collections/g-pen'),
      ]),
      buildItem('Featured', '#', [
        // FIXED: parent link changed from heady-glass → #
        // ADDED: New Arrivals, Best Sellers, On Sale
        buildItem('New Arrivals', '/collections/new-arrivals'),
        buildItem('Best Sellers', '/collections/best-sellers'),
        buildItem('On Sale', '/collections/on-sale'),
        buildItem('Heady Glass', '/collections/heady-glass'),
        buildItem('Silicone Pieces', '/collections/silicone-rigs-bongs'),
        buildItem('Travel Friendly', '/collections/travel-friendly'),
      ]),
    ],
  },

  // 4. SMOKE & VAPE DROPDOWN
  'smoke-vape': {
    id: 'gid://shopify/Menu/305216815384',
    title: 'Smoke & Vape Dropdown',
    items: [
      buildItem('Shop All Smoke & Vape', '/collections/smoke-and-vape'),
      buildItem('Bongs & Water Pipes', '/collections/bongs-water-pipes'),
      buildItem('Dab Rigs', '/collections/dab-rigs'),
      buildItem('Hand Pipes', '/collections/hand-pipes'),
      buildItem('Bubblers', '/collections/bubblers'),
      buildItem('Nectar Collectors', '/collections/nectar-collectors'),
      buildItem('One Hitters & Chillums', '/collections/one-hitters-chillums'),
      // FIXED: silicone-pipes (broken) → silicone-rigs-bongs
      buildItem('Silicone Pipes', '/collections/silicone-rigs-bongs'),
      // FIXED: rolling-papers (broken) → rolling-papers-cones
      buildItem('Rolling Papers & Trays', '/collections/rolling-papers-cones'),
      buildItem('Grinders', '/collections/grinders'),
      buildItem('Novelty Pipes', '/collections/novelty-character-pipes'),
    ],
  },

  // 5. EXTRACTION & PACKAGING DROPDOWN
  'extraction-packaging-dropdown': {
    id: 'gid://shopify/Menu/305301913880',
    title: 'Extraction & Packaging Dropdown',
    items: [
      buildItem('Shop All Extraction', '/collections/extraction-packaging'),
      // FIXED: concentrate-jars is valid (15 products)
      buildItem('Concentrate Jars', '/collections/concentrate-jars'),
      // FIXED: non-stick-containers (broken) → concentrate-containers
      buildItem('Concentrate Containers', '/collections/concentrate-containers'),
      // REMOVED: silicone-pads (0 products)
      buildItem('Parchment Paper', '/collections/parchment-paper'),
      // FIXED: non-stick-paper-and-ptfe (broken) → fep-sheets
      buildItem('FEP & PTFE Sheets', '/collections/fep-sheets'),
      buildItem('Rosin Extraction', '/collections/rosin-extraction'),
      buildItem('Mylar Bags', '/collections/mylar-bags'),
      buildItem('Custom Packaging', '/collections/custom-packaging-options'),
    ],
  },

  // 6. SILICONE PIPES DROPDOWN
  'silicone-pipes': {
    id: 'gid://shopify/Menu/305171628312',
    title: 'Silicone Pipes Dropdown',
    items: [
      // FIXED: silicone-pipes (broken) → silicone-products (111 products)
      buildItem('Shop All Silicone', '/collections/silicone-products'),
      buildItem('Silicone Bubblers', '/collections/silicone-bubblers'),
      buildItem('Silicone Hand Pipes', '/collections/silicone-hand-pipes'),
      buildItem('Silicone Nectar Collectors', '/collections/silicone-nectar-collectors'),
      buildItem('Silicone Rigs & Bongs', '/collections/silicone-rigs-bongs'),
    ],
  },

  // 7. QUICK LINKS
  'quick-links': {
    id: 'gid://shopify/Menu/119673716835',
    title: 'Quick Links',
    items: [
      // FIXED: silicone-pipes (broken) → silicone-rigs-bongs
      buildItem('Silicone Rigs & Bongs', '/collections/silicone-rigs-bongs', [
        buildItem('Silicone Nectar Collectors', '/collections/silicone-nectar-collectors'),
        buildItem('Quartz Bangers', '/collections/quartz-bangers'),
      ]),
      buildItem('Parchment Paper', '/collections/parchment-paper', [
        buildItem('FEP Sheets', '/collections/fep-sheets'),
      ]),
      buildItem('Ashtrays', '/collections/ashtrays'),
    ],
  },
};

// ─── MAIN ──────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  COMPREHENSIVE MENU FIX — ${DRY_RUN ? 'DRY RUN (preview)' : 'EXECUTING LIVE'}`);
  console.log(`${'═'.repeat(60)}`);

  if (DRY_RUN) {
    console.log('\n  Add --execute flag to apply changes to Shopify.\n');
  }

  let successCount = 0;
  let failCount = 0;

  for (const [handle, menuDef] of Object.entries(FIXES)) {
    console.log(`\n── ${menuDef.title} (${handle}) ──`);
    try {
      const ok = await updateMenu(menuDef.id, menuDef.title, menuDef.items);
      if (ok) successCount++; else failCount++;
    } catch (e) {
      console.log(`  ❌ Failed: ${e.message}`);
      failCount++;
    }
    // Throttle between menus
    if (!DRY_RUN) await sleep(1000);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  DONE: ${successCount} menus ${DRY_RUN ? 'previewed' : 'updated'}, ${failCount} failed`);
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
