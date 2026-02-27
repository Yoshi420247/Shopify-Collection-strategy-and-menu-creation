// Wholesaler → Shopify Exact Inventory Sync Engine
// Mirrors WyndDistribution (WooCommerce) stock quantities to Shopify:
//   1. Sets Shopify inventory_quantity to match the exact WC stock_quantity
//   2. Products with 0 stock → set to "draft" (hidden from storefront)
//   3. Products with stock > 0 that were drafted → set to "active" (visible)
//
// This replaces the old threshold-based draft/active toggle with true quantity mirroring.
import 'dotenv/config';
import { getAllWcProducts, extractStockInfo } from './woocommerce-client.js';
import { getProduct, updateProduct, getLocations, setInventoryLevel, paginateAll } from './shopify-api.js';
import { loadMapping } from './product-matcher.js';
import fs from 'fs';
import path from 'path';

const SYNC_LOG_FILE = path.join(process.cwd(), 'wholesaler-sync-log.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Logging ────────────────────────────────────────────────────────────
function loadSyncLog() {
  if (fs.existsSync(SYNC_LOG_FILE)) {
    return JSON.parse(fs.readFileSync(SYNC_LOG_FILE, 'utf8'));
  }
  return { runs: [] };
}

function saveSyncLog(log) {
  // Keep last 90 runs
  if (log.runs.length > 90) {
    log.runs = log.runs.slice(-90);
  }
  fs.writeFileSync(SYNC_LOG_FILE, JSON.stringify(log, null, 2));
}

// ── Fetch all WC products in bulk (much faster than one-by-one) ───────
async function fetchAllWcStock() {
  const allProducts = await getAllWcProducts();
  const stockMap = new Map();
  for (const product of allProducts) {
    const info = extractStockInfo(product);
    stockMap.set(info.id, info);
  }
  return stockMap;
}

// ── Get primary Shopify inventory location ────────────────────────────
async function getPrimaryLocationId() {
  const data = await getLocations();
  const locations = data.locations || [];
  if (locations.length === 0) {
    throw new Error('No inventory locations found in Shopify');
  }
  // Use the first active location (primary warehouse)
  const primary = locations.find(l => l.active) || locations[0];
  console.log(`  Shopify location: ${primary.name} (ID: ${primary.id})`);
  return primary.id;
}

// ── Core sync logic ────────────────────────────────────────────────────
export async function runStockSync(options = {}) {
  const { dryRun = true, verbose = false } = options;
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     WyndDistribution → Shopify Exact Inventory Sync        ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE — updating Shopify inventory'}`.padEnd(63) + '║');
  console.log('║  Syncs: exact quantities + draft/active status             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // 1. Load product mapping
  const mapping = loadMapping();
  if (!mapping.mappings || mapping.mappings.length === 0) {
    console.error('No product mappings found. Run product matching first:');
    console.error('  npm run wholesaler:match       (auto-match all)');
    console.error('  npm run wholesaler:match-review (match with review)');
    process.exit(1);
  }

  const approvedMappings = mapping.mappings.filter(m => m.approved !== false);
  console.log(`Loaded ${approvedMappings.length} product mappings (last updated: ${mapping.lastUpdated})\n`);

  // 2. Get Shopify inventory location
  console.log('Getting Shopify inventory location...');
  const locationId = await getPrimaryLocationId();
  console.log('');

  // 3. Fetch ALL WC products in bulk (much faster than one-by-one)
  console.log('Fetching all WyndDistribution stock levels (bulk)...');
  const wcStockMap = await fetchAllWcStock();
  console.log(`  Loaded stock data for ${wcStockMap.size} WC products\n`);

  // 4. Fetch all Shopify "What You Need" products with variant data
  console.log('Fetching Shopify products with inventory data...');
  const shopifyProducts = await paginateAll('products.json', 'products', {
    limit: 250,
    fields: 'id,title,status,variants,vendor',
  });
  // Build a lookup by product ID
  const shopifyMap = new Map();
  for (const p of shopifyProducts) {
    shopifyMap.set(p.id, p);
  }
  console.log(`  Loaded ${shopifyProducts.length} Shopify products\n`);

  // 5. Determine required actions for each mapped product
  const inventoryActions = [];
  const statusActions = [];
  const errors = [];
  let alreadyInSync = 0;

  for (const pair of approvedMappings) {
    const wcStock = wcStockMap.get(pair.wc_id);

    if (!wcStock) {
      errors.push({
        wc_id: pair.wc_id,
        wc_name: pair.wc_name,
        error: 'WC product not found in bulk fetch',
      });
      continue;
    }

    const shopifyProduct = shopifyMap.get(pair.shopify_id);
    if (!shopifyProduct) {
      errors.push({
        shopify_id: pair.shopify_id,
        shopify_title: pair.shopify_title,
        error: 'Shopify product not found in bulk fetch',
      });
      continue;
    }

    const currentStatus = shopifyProduct.status;
    const wcQty = wcStock.stock_quantity;
    const wcStockStatus = wcStock.stock_status;

    // Determine the target quantity
    // If WC tracks quantity, use it. If not, use stock_status as a heuristic.
    let targetQty;
    if (wcQty !== null && wcQty !== undefined) {
      targetQty = Math.max(0, wcQty); // Clamp to 0 minimum
    } else {
      // No quantity tracking — infer from stock_status
      targetQty = wcStockStatus === 'instock' ? 10 : 0;
    }

    // Check each Shopify variant's inventory
    const variants = shopifyProduct.variants || [];
    let productNeedsInventoryUpdate = false;

    for (const variant of variants) {
      const currentShopifyQty = variant.inventory_quantity ?? 0;
      const inventoryItemId = variant.inventory_item_id;

      if (currentShopifyQty !== targetQty) {
        productNeedsInventoryUpdate = true;
        inventoryActions.push({
          shopify_id: pair.shopify_id,
          shopify_title: pair.shopify_title,
          variant_id: variant.id,
          variant_title: variant.title,
          inventory_item_id: inventoryItemId,
          wc_id: pair.wc_id,
          wc_name: pair.wc_name,
          wc_qty: wcQty,
          wc_stock_status: wcStockStatus,
          current_shopify_qty: currentShopifyQty,
          target_qty: targetQty,
        });
      }
    }

    // Determine status change (draft/active)
    const isOutOfStock = targetQty === 0;

    if (isOutOfStock && currentStatus === 'active') {
      statusActions.push({
        type: 'set_draft',
        shopify_id: pair.shopify_id,
        shopify_title: pair.shopify_title,
        wc_name: pair.wc_name,
        target_qty: targetQty,
        current_status: currentStatus,
        new_status: 'draft',
        reason: `Out of stock on WyndDistribution (qty: ${wcQty ?? wcStockStatus})`,
      });
    } else if (!isOutOfStock && currentStatus === 'draft') {
      statusActions.push({
        type: 'set_active',
        shopify_id: pair.shopify_id,
        shopify_title: pair.shopify_title,
        wc_name: pair.wc_name,
        target_qty: targetQty,
        current_status: currentStatus,
        new_status: 'active',
        reason: `Back in stock on WyndDistribution (qty: ${targetQty})`,
      });
    }

    if (!productNeedsInventoryUpdate && !isOutOfStock === (currentStatus === 'active') || (!isOutOfStock === (currentStatus !== 'draft') && !productNeedsInventoryUpdate)) {
      alreadyInSync++;
    }
  }

  // 6. Report planned actions
  const draftActions = statusActions.filter(a => a.type === 'set_draft');
  const activateActions = statusActions.filter(a => a.type === 'set_active');

  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Inventory updates needed:         ${inventoryActions.length} variant(s)`);
  console.log(`  Products to DRAFT (out of stock): ${draftActions.length}`);
  console.log(`  Products to ACTIVATE (restocked):  ${activateActions.length}`);
  console.log(`  Already in sync:                   ${alreadyInSync}`);
  console.log(`  Errors/skipped:                    ${errors.length}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  // Show inventory changes
  if (inventoryActions.length > 0) {
    console.log('── Inventory Quantity Changes ──');
    const shown = verbose ? inventoryActions : inventoryActions.slice(0, 50);
    for (const a of shown) {
      const variantLabel = a.variant_title !== 'Default Title' ? ` [${a.variant_title}]` : '';
      console.log(`  ${a.current_shopify_qty} → ${a.target_qty}  "${a.shopify_title}"${variantLabel}`);
    }
    if (!verbose && inventoryActions.length > 50) {
      console.log(`  ... and ${inventoryActions.length - 50} more (use --verbose to see all)`);
    }
    console.log('');
  }

  if (draftActions.length > 0) {
    console.log('── Products to DRAFT (hiding from store) ──');
    for (const a of draftActions) {
      console.log(`  ✗ "${a.shopify_title}" — ${a.reason}`);
    }
    console.log('');
  }

  if (activateActions.length > 0) {
    console.log('── Products to ACTIVATE (making visible) ──');
    for (const a of activateActions) {
      console.log(`  ✓ "${a.shopify_title}" — ${a.reason}`);
    }
    console.log('');
  }

  if (errors.length > 0) {
    console.log('── Errors ──');
    for (const e of errors) {
      console.log(`  ! ${e.wc_name || e.shopify_title}: ${e.error}`);
    }
    console.log('');
  }

  // 7. Execute updates (if not dry run)
  const results = {
    inventoryUpdated: 0,
    inventoryFailed: 0,
    drafted: 0,
    activated: 0,
    statusFailed: 0,
  };

  if (!dryRun) {
    // 7a. Update inventory quantities
    if (inventoryActions.length > 0) {
      console.log(`Updating ${inventoryActions.length} inventory levels on Shopify...\n`);

      for (let i = 0; i < inventoryActions.length; i++) {
        const action = inventoryActions[i];
        const variantLabel = action.variant_title !== 'Default Title' ? ` [${action.variant_title}]` : '';

        try {
          await setInventoryLevel(action.inventory_item_id, locationId, action.target_qty);
          results.inventoryUpdated++;

          if (verbose || i < 20 || i % 50 === 0) {
            console.log(`  [${i + 1}/${inventoryActions.length}] ✔ ${action.current_shopify_qty} → ${action.target_qty}  "${action.shopify_title}"${variantLabel}`);
          }
        } catch (err) {
          results.inventoryFailed++;
          console.error(`  [${i + 1}/${inventoryActions.length}] ✘ Failed: "${action.shopify_title}"${variantLabel}: ${err.message}`);
        }

        // Rate limiting: ~2 req/sec
        await sleep(550);
      }
      console.log('');
    }

    // 7b. Update product status (draft/active)
    if (statusActions.length > 0) {
      console.log(`Updating ${statusActions.length} product statuses...\n`);

      for (const action of statusActions) {
        try {
          await updateProduct(action.shopify_id, { status: action.new_status });
          if (action.type === 'set_draft') {
            results.drafted++;
            console.log(`  ✔ Drafted: "${action.shopify_title}"`);
          } else {
            results.activated++;
            console.log(`  ✔ Activated: "${action.shopify_title}"`);
          }
        } catch (err) {
          results.statusFailed++;
          console.error(`  ✘ Failed: "${action.shopify_title}": ${err.message}`);
        }
        await sleep(600);
      }
      console.log('');
    }

    if (inventoryActions.length === 0 && statusActions.length === 0) {
      console.log('All products are already in sync. No changes needed.\n');
    }
  } else if (inventoryActions.length > 0 || statusActions.length > 0) {
    console.log('DRY RUN — no changes made. Run with --execute to apply.\n');
  } else {
    console.log('All products are already in sync. No changes needed.\n');
  }

  // 8. Save sync log
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const logEntry = {
    timestamp: new Date().toISOString(),
    dryRun,
    duration: `${duration}s`,
    productsChecked: approvedMappings.length,
    inventoryUpdated: dryRun ? inventoryActions.length : results.inventoryUpdated,
    inventoryFailed: results.inventoryFailed,
    drafted: dryRun ? draftActions.length : results.drafted,
    activated: dryRun ? activateActions.length : results.activated,
    statusFailed: results.statusFailed,
    errors: errors.length,
    alreadyInSync,
  };

  const syncLog = loadSyncLog();
  syncLog.runs.push(logEntry);
  saveSyncLog(syncLog);

  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Sync completed in ${duration}s`);
  console.log(`  Inventory updated: ${logEntry.inventoryUpdated} | Failed: ${logEntry.inventoryFailed}`);
  console.log(`  Drafted: ${logEntry.drafted} | Activated: ${logEntry.activated}`);
  console.log(`  Already in sync: ${alreadyInSync} | Errors: ${errors.length}`);
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`Log saved to ${SYNC_LOG_FILE}\n`);

  return logEntry;
}

// ── Status report ──────────────────────────────────────────────────────
export function showSyncHistory() {
  const log = loadSyncLog();
  if (log.runs.length === 0) {
    console.log('No sync history found.');
    return;
  }

  console.log('\n══ Wholesaler Inventory Sync History ════════════════════════');
  console.log(`Total runs: ${log.runs.length}\n`);

  // Show last 10 runs
  const recent = log.runs.slice(-10);
  for (const run of recent) {
    const mode = run.dryRun ? '[DRY]' : '[LIVE]';
    const inv = run.inventoryUpdated !== undefined ? `, inv: ${run.inventoryUpdated}` : '';
    console.log(`  ${run.timestamp} ${mode} — checked: ${run.productsChecked}${inv}, drafted: ${run.drafted}, activated: ${run.activated}`);
  }

  // Summary stats
  const liveRuns = log.runs.filter(r => !r.dryRun);
  const totalInvUpdated = liveRuns.reduce((s, r) => s + (r.inventoryUpdated || 0), 0);
  const totalDrafted = liveRuns.reduce((s, r) => s + r.drafted, 0);
  const totalActivated = liveRuns.reduce((s, r) => s + r.activated, 0);
  console.log(`\nLifetime (live runs): ${liveRuns.length} syncs, ${totalInvUpdated} inventory updates, ${totalDrafted} drafted, ${totalActivated} activated`);
}

// ── CLI entry point ────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--history')) {
  showSyncHistory();
} else {
  const dryRun = !args.includes('--execute');
  const verbose = args.includes('--verbose');
  runStockSync({ dryRun, verbose }).catch(err => {
    console.error('Stock sync failed:', err.message);
    process.exit(1);
  });
}
