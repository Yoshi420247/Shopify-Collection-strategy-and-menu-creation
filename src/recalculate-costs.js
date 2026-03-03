#!/usr/bin/env node
/**
 * Recalculate Shopify Costs from WooCommerce Wholesale Prices
 *
 * Pulls every mapped WYN product's WooCommerce price (the wholesale baseline),
 * applies the current COST_TIERS multiplier to get the correct Shopify unit cost,
 * and updates the inventory item cost field on Shopify.
 *
 * This ensures all Shopify costs reflect the latest pricing rules.
 *
 * Usage:
 *   node src/recalculate-costs.js              # Dry-run report
 *   node src/recalculate-costs.js --execute    # Apply cost updates
 *   node src/recalculate-costs.js --verbose    # Show every product
 */
import 'dotenv/config';
import { getWcProduct } from './woocommerce-client.js';
import {
  paginateAll,
  getProduct,
  getInventoryItem,
  updateInventoryItem,
} from './shopify-api.js';
import { calculateCost, COST_TIERS } from './pricing-engine.js';
import { loadMapping } from './product-matcher.js';
import { config } from './config.js';
import fs from 'fs';
import path from 'path';

const VENDOR = config.vendor || 'What You Need';
const LOG_FILE = path.join(process.cwd(), 'data', 'cost-recalc-log.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function loadLog() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    }
  } catch { /* ignore */ }
  return { runs: [] };
}

function saveLog(log) {
  if (log.runs.length > 52) log.runs = log.runs.slice(-52);
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

export async function recalculateCosts(options = {}) {
  const { dryRun = true, verbose = false } = options;
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║     Cost Recalculation — WC Prices → Shopify Costs     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update Shopify costs)'}`);
  console.log(`Vendor: ${VENDOR}`);
  console.log('');
  console.log('Current cost tiers:');
  for (const tier of COST_TIERS) {
    const maxStr = tier.max === Infinity ? '∞' : `$${tier.max.toFixed(2)}`;
    console.log(`  $${tier.min.toFixed(2)} – ${maxStr} → ${tier.multiplier}x`);
  }
  console.log('');

  // 1. Load product mapping (WC ↔ Shopify)
  const mapping = loadMapping();
  const approvedMappings = (mapping.mappings || []).filter(m => m.approved !== false);

  if (approvedMappings.length === 0) {
    console.log('No product mappings found. Run product matching first.');
    return { updated: 0, unchanged: 0, errors: 0 };
  }
  console.log(`Loaded ${approvedMappings.length} product mappings\n`);

  // 2. Also get all WYN Shopify products that may NOT be in the mapping
  //    (e.g., products created manually or from other sources)
  console.log('Fetching all Shopify products by vendor...');
  const shopifyProducts = await paginateAll('products.json', 'products', {
    vendor: VENDOR,
    limit: 250,
    fields: 'id,title,variants,status,vendor',
  });

  // Also fetch drafts
  const draftProducts = await paginateAll('products.json', 'products', {
    vendor: VENDOR,
    limit: 250,
    status: 'draft',
    fields: 'id,title,variants,status,vendor',
  });

  const allShopifyProducts = [...shopifyProducts, ...draftProducts];
  console.log(`Found ${allShopifyProducts.length} total "${VENDOR}" products on Shopify\n`);

  // Build mapping lookup: Shopify ID → WC ID
  const shopifyToWcMap = new Map();
  for (const m of approvedMappings) {
    shopifyToWcMap.set(m.shopify_id, m.wc_id);
  }

  // 3. Process each Shopify product
  const results = {
    updated: [],
    unchanged: [],
    noMapping: [],
    wcFetchError: [],
    costFetchError: [],
    costUpdateError: [],
  };

  let processed = 0;

  for (const product of allShopifyProducts) {
    processed++;
    const wcId = shopifyToWcMap.get(product.id);

    if (!wcId) {
      results.noMapping.push({ id: product.id, title: product.title });
      if (verbose) console.log(`  ? NO MAPPING: "${product.title}" — no WC product linked`);
      continue;
    }

    // Fetch WC product to get current wholesale price
    let wcProduct;
    try {
      wcProduct = await getWcProduct(wcId);
    } catch (err) {
      results.wcFetchError.push({ id: product.id, title: product.title, wcId, error: err.message });
      if (verbose) console.log(`  ! WC FETCH ERROR: "${product.title}" — ${err.message}`);
      continue;
    }

    const wynPrice = parseFloat(wcProduct.price || wcProduct.regular_price || 0);
    if (wynPrice <= 0) {
      if (verbose) console.log(`  ? SKIP: "${product.title}" — WC price is $0`);
      results.noMapping.push({ id: product.id, title: product.title, reason: 'WC price is $0' });
      continue;
    }

    // Calculate the correct cost using new tiers
    const correctCost = calculateCost(wynPrice);

    // Check and update each variant's inventory item cost
    for (const variant of product.variants || []) {
      const inventoryItemId = variant.inventory_item_id;
      if (!inventoryItemId) continue;

      // Get current cost from Shopify
      let currentCost = 0;
      try {
        const invData = await getInventoryItem(inventoryItemId);
        currentCost = parseFloat(invData.inventory_item?.cost) || 0;
      } catch (err) {
        results.costFetchError.push({
          productId: product.id,
          title: product.title,
          variantId: variant.id,
          error: err.message,
        });
        continue;
      }

      // Compare
      const costMatch = Math.abs(currentCost - correctCost) < 0.01;

      if (costMatch) {
        results.unchanged.push({
          productId: product.id,
          title: product.title,
          variantId: variant.id,
          wynPrice,
          cost: currentCost,
        });
        if (verbose) console.log(`  ✓ OK: "${product.title}" — WC $${wynPrice} → cost $${currentCost.toFixed(2)} (correct)`);
      } else {
        // Cost needs updating
        const entry = {
          productId: product.id,
          title: product.title,
          variantId: variant.id,
          inventoryItemId,
          wynPrice,
          oldCost: currentCost,
          newCost: correctCost,
        };

        if (!dryRun) {
          try {
            await updateInventoryItem(inventoryItemId, { cost: correctCost.toFixed(2) });
            results.updated.push(entry);
            console.log(`  ✔ UPDATED: "${product.title}" — WC $${wynPrice} → cost $${currentCost.toFixed(2)} → $${correctCost.toFixed(2)}`);
          } catch (err) {
            results.costUpdateError.push({ ...entry, error: err.message });
            console.error(`  ✘ FAILED: "${product.title}" — ${err.message}`);
          }
          await sleep(300);
        } else {
          results.updated.push(entry);
          console.log(`  ~ NEEDS UPDATE: "${product.title}" — WC $${wynPrice} → cost $${currentCost.toFixed(2)} → $${correctCost.toFixed(2)}`);
        }
      }
    }

    if (processed % 25 === 0) {
      console.log(`  ... processed ${processed}/${allShopifyProducts.length} products`);
    }
  }

  // 4. Summary
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Total products processed:  ${processed}`);
  console.log(`  Costs updated:             ${results.updated.length}`);
  console.log(`  Costs already correct:     ${results.unchanged.length}`);
  console.log(`  No WC mapping:             ${results.noMapping.length}`);
  console.log(`  WC fetch errors:           ${results.wcFetchError.length}`);
  console.log(`  Cost fetch errors:         ${results.costFetchError.length}`);
  console.log(`  Cost update errors:        ${results.costUpdateError.length}`);
  console.log('══════════════════════════════════════════════════════════\n');

  if (results.updated.length > 0) {
    console.log('── Cost Changes ──');
    for (const item of results.updated.slice(0, 30)) {
      const delta = item.newCost - item.oldCost;
      const sign = delta >= 0 ? '+' : '';
      console.log(`  $${item.oldCost.toFixed(2)} → $${item.newCost.toFixed(2)} (${sign}${delta.toFixed(2)}) | WC $${item.wynPrice} | ${item.title}`);
    }
    if (results.updated.length > 30) {
      console.log(`  ... and ${results.updated.length - 30} more`);
    }
    console.log('');
  }

  if (dryRun && results.updated.length > 0) {
    console.log(`DRY RUN — ${results.updated.length} costs would be updated. Run with --execute to apply.`);
  }

  // 5. Save log
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const logEntry = {
    timestamp: new Date().toISOString(),
    dryRun,
    duration: `${duration}s`,
    totalProcessed: processed,
    updated: results.updated.length,
    unchanged: results.unchanged.length,
    noMapping: results.noMapping.length,
    wcFetchErrors: results.wcFetchError.length,
    costFetchErrors: results.costFetchError.length,
    costUpdateErrors: results.costUpdateError.length,
    changes: results.updated.map(i => ({
      productId: i.productId,
      title: i.title,
      wynPrice: i.wynPrice,
      oldCost: i.oldCost,
      newCost: i.newCost,
    })),
  };

  const log = loadLog();
  log.runs.push(logEntry);
  saveLog(log);

  console.log(`\nCost recalculation completed in ${duration}s. Log saved to ${LOG_FILE}`);
  return logEntry;
}

// ── CLI entry point ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = !args.includes('--execute');
const verbose = args.includes('--verbose');

recalculateCosts({ dryRun, verbose }).catch(err => {
  console.error('Cost recalculation failed:', err.message);
  process.exit(1);
});
