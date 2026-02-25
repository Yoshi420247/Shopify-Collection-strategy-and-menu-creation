// Wholesaler Stock Sync Engine
// Monitors WooCommerce (wholesaler) stock levels and updates Shopify product status:
//   - Stock ≤ 3 on wholesaler → Set Shopify product to "draft" (hidden)
//   - Stock > 3 on wholesaler AND Shopify status is "draft" → Set to "active" (visible)
import 'dotenv/config';
import { checkStockLevels, getAllWcProducts, extractStockInfo } from './woocommerce-client.js';
import { getProduct, updateProduct, paginateAll } from './shopify-api.js';
import { loadMapping } from './product-matcher.js';
import fs from 'fs';
import path from 'path';

const STOCK_THRESHOLD = 3; // Products with stock ≤ this get drafted
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

// ── Core sync logic ────────────────────────────────────────────────────
export async function runStockSync(options = {}) {
  const { dryRun = true, verbose = false } = options;
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║         Wholesaler → Shopify Stock Sync                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update Shopify)'}`);
  console.log(`Stock threshold: ≤ ${STOCK_THRESHOLD} → draft | > ${STOCK_THRESHOLD} → active`);
  console.log('');

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

  // 2. Fetch current stock from WooCommerce
  console.log('Checking wholesaler stock levels...');
  const wcProductIds = approvedMappings.map(m => m.wc_id);
  const wcStockData = await checkStockLevels(wcProductIds);

  // Build a map of WC ID → stock info
  const wcStockMap = new Map();
  for (const item of wcStockData) {
    if (!item.error) {
      wcStockMap.set(item.id, item);
    }
  }

  // 3. Fetch current Shopify product statuses
  console.log('Fetching current Shopify product statuses...\n');

  // 4. Determine required actions
  const actions = [];
  const errors = [];

  for (const pair of approvedMappings) {
    const wcStock = wcStockMap.get(pair.wc_id);

    if (!wcStock) {
      errors.push({
        wc_id: pair.wc_id,
        wc_name: pair.wc_name,
        error: 'Could not fetch WC stock data',
      });
      continue;
    }

    // Get current Shopify product status
    let shopifyProduct;
    try {
      const result = await getProduct(pair.shopify_id);
      shopifyProduct = result.product;
    } catch (err) {
      errors.push({
        shopify_id: pair.shopify_id,
        shopify_title: pair.shopify_title,
        error: `Could not fetch Shopify product: ${err.message}`,
      });
      continue;
    }

    const currentStatus = shopifyProduct.status; // 'active', 'draft', 'archived'
    const stockQty = wcStock.stock_quantity;
    const stockStatus = wcStock.stock_status;

    // Determine if stock is effectively low
    // stock_quantity could be null if manage_stock is false — use stock_status as fallback
    let isLowStock;
    if (stockQty !== null) {
      isLowStock = stockQty <= STOCK_THRESHOLD;
    } else {
      // No quantity tracking — go by stock_status
      isLowStock = stockStatus === 'outofstock';
    }

    if (verbose) {
      console.log(`  ${pair.wc_name}`);
      console.log(`    WC stock: ${stockQty !== null ? stockQty : stockStatus} | Shopify status: ${currentStatus}`);
    }

    if (isLowStock && currentStatus === 'active') {
      // LOW STOCK → draft the product on Shopify
      actions.push({
        type: 'set_draft',
        shopify_id: pair.shopify_id,
        shopify_title: pair.shopify_title,
        wc_id: pair.wc_id,
        wc_name: pair.wc_name,
        wc_stock: stockQty,
        wc_stock_status: stockStatus,
        current_status: currentStatus,
        new_status: 'draft',
        reason: stockQty !== null
          ? `Wholesaler stock (${stockQty}) ≤ ${STOCK_THRESHOLD}`
          : `Wholesaler stock status: ${stockStatus}`,
      });
    } else if (!isLowStock && currentStatus === 'draft') {
      // STOCK RECOVERED → activate the product on Shopify
      actions.push({
        type: 'set_active',
        shopify_id: pair.shopify_id,
        shopify_title: pair.shopify_title,
        wc_id: pair.wc_id,
        wc_name: pair.wc_name,
        wc_stock: stockQty,
        wc_stock_status: stockStatus,
        current_status: currentStatus,
        new_status: 'active',
        reason: stockQty !== null
          ? `Wholesaler stock recovered (${stockQty} > ${STOCK_THRESHOLD})`
          : `Wholesaler stock status: ${stockStatus}`,
      });
    }
  }

  // 5. Report planned actions
  const draftActions = actions.filter(a => a.type === 'set_draft');
  const activateActions = actions.filter(a => a.type === 'set_active');

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Products to DRAFT (low stock):    ${draftActions.length}`);
  console.log(`  Products to ACTIVATE (restocked):  ${activateActions.length}`);
  console.log(`  Products unchanged:                ${approvedMappings.length - actions.length - errors.length}`);
  console.log(`  Errors/skipped:                    ${errors.length}`);
  console.log('══════════════════════════════════════════════════════════\n');

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

  // 6. Execute updates (if not dry run)
  const results = { drafted: [], activated: [], failed: [] };

  if (!dryRun && actions.length > 0) {
    console.log('Applying changes to Shopify...\n');

    for (const action of actions) {
      try {
        await updateProduct(action.shopify_id, { status: action.new_status });
        console.log(`  ✔ ${action.type === 'set_draft' ? 'Drafted' : 'Activated'}: "${action.shopify_title}"`);

        if (action.type === 'set_draft') {
          results.drafted.push(action);
        } else {
          results.activated.push(action);
        }
      } catch (err) {
        console.error(`  ✘ Failed to update "${action.shopify_title}": ${err.message}`);
        results.failed.push({ ...action, error: err.message });
      }

      // Brief pause between updates
      await sleep(600);
    }
  } else if (dryRun && actions.length > 0) {
    console.log('DRY RUN — no changes made. Run with --execute to apply.');
  } else {
    console.log('No changes needed. All products are in sync.');
  }

  // 7. Save sync log
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const logEntry = {
    timestamp: new Date().toISOString(),
    dryRun,
    duration: `${duration}s`,
    productsChecked: approvedMappings.length,
    drafted: dryRun ? draftActions.length : results.drafted.length,
    activated: dryRun ? activateActions.length : results.activated.length,
    failed: results.failed.length,
    errors: errors.length,
    actions: dryRun ? actions : [...results.drafted, ...results.activated, ...results.failed],
  };

  const syncLog = loadSyncLog();
  syncLog.runs.push(logEntry);
  saveSyncLog(syncLog);

  console.log(`\nSync completed in ${duration}s. Log saved to ${SYNC_LOG_FILE}`);
  return logEntry;
}

// ── Status report ──────────────────────────────────────────────────────
export function showSyncHistory() {
  const log = loadSyncLog();
  if (log.runs.length === 0) {
    console.log('No sync history found.');
    return;
  }

  console.log('\n══ Wholesaler Sync History ══════════════════════════════');
  console.log(`Total runs: ${log.runs.length}\n`);

  // Show last 10 runs
  const recent = log.runs.slice(-10);
  for (const run of recent) {
    const mode = run.dryRun ? '[DRY]' : '[LIVE]';
    console.log(`  ${run.timestamp} ${mode} — checked: ${run.productsChecked}, drafted: ${run.drafted}, activated: ${run.activated}, failed: ${run.failed}`);
  }

  // Summary stats
  const liveRuns = log.runs.filter(r => !r.dryRun);
  const totalDrafted = liveRuns.reduce((s, r) => s + r.drafted, 0);
  const totalActivated = liveRuns.reduce((s, r) => s + r.activated, 0);
  console.log(`\nLifetime (live runs): ${liveRuns.length} syncs, ${totalDrafted} drafted, ${totalActivated} activated`);
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
