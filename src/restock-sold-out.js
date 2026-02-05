#!/usr/bin/env node
/**
 * Restock Sold-Out Products
 *
 * This script finds all "What You Need" vendor products that are sold out
 * (inventory_quantity = 0) and restocks them with 10 units.
 *
 * Usage:
 *   node src/restock-sold-out.js          # Dry run - shows what would be restocked
 *   node src/restock-sold-out.js --execute # Apply changes
 */

import { STORE_URL, BASE_URL, log, logSection, sleep, curlRequest, getAllProducts } from './utils.js';

const RESTOCK_QUANTITY = 10;

/**
 * Get the primary inventory location ID
 */
async function getLocationId() {
  const data = curlRequest(`${BASE_URL}/locations.json`);
  if (data && data.locations && data.locations.length > 0) {
    const location = data.locations[0];
    log(`  Location: ${location.name} (ID: ${location.id})`, 'cyan');
    return location.id;
  }
  throw new Error('Could not find any inventory locations');
}

/**
 * Set inventory level for an item at a location
 */
async function setInventoryLevel(inventoryItemId, locationId, quantity) {
  return curlRequest(
    `${BASE_URL}/inventory_levels/set.json`,
    'POST',
    {
      location_id: locationId,
      inventory_item_id: inventoryItemId,
      available: quantity,
    }
  );
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('\n' + '═'.repeat(70));
  log('  RESTOCK SOLD-OUT PRODUCTS', 'bright');
  log(`  Store: ${STORE_URL}`, 'cyan');
  log(`  Restock quantity: ${RESTOCK_QUANTITY} units`, 'cyan');
  log(`  Mode: ${dryRun ? 'DRY RUN (use --execute to apply)' : 'EXECUTING CHANGES'}`, dryRun ? 'yellow' : 'green');
  console.log('═'.repeat(70));

  // Step 1: Get inventory location
  logSection('GETTING INVENTORY LOCATION');
  const locationId = await getLocationId();

  // Step 2: Fetch all "What You Need" products
  logSection('FETCHING "WHAT YOU NEED" PRODUCTS');
  const wynProducts = await getAllProducts('What You Need');
  log(`Found ${wynProducts.length} "What You Need" products`, 'cyan');

  // Step 3: Find sold-out variants
  logSection('SCANNING FOR SOLD-OUT ITEMS');

  const soldOutItems = [];
  const inStockItems = [];

  for (const product of wynProducts) {
    for (const variant of product.variants || []) {
      const qty = variant.inventory_quantity || 0;
      if (qty <= 0) {
        soldOutItems.push({
          productTitle: product.title,
          productId: product.id,
          variantId: variant.id,
          variantTitle: variant.title,
          sku: variant.sku || '(no SKU)',
          inventoryItemId: variant.inventory_item_id,
          currentQuantity: qty,
        });
      } else {
        inStockItems.push({
          productTitle: product.title,
          sku: variant.sku || '(no SKU)',
          currentQuantity: qty,
        });
      }
    }
  }

  log(`\nIn stock: ${inStockItems.length} variants`, 'green');
  log(`Sold out: ${soldOutItems.length} variants`, 'red');

  if (soldOutItems.length === 0) {
    logSection('NO SOLD-OUT ITEMS FOUND');
    log('All products are currently in stock!', 'green');
    return;
  }

  // Step 4: Restock sold-out items
  logSection(`RESTOCKING ${soldOutItems.length} SOLD-OUT ITEMS`);

  let restocked = 0;
  let errors = 0;

  for (let i = 0; i < soldOutItems.length; i++) {
    const item = soldOutItems[i];

    console.log(`\n  [${i + 1}/${soldOutItems.length}] ${item.productTitle}`);
    console.log(`    SKU: ${item.sku}`);
    if (item.variantTitle !== 'Default Title') {
      console.log(`    Variant: ${item.variantTitle}`);
    }
    console.log(`    Current qty: ${item.currentQuantity} → New qty: ${RESTOCK_QUANTITY}`);

    if (!dryRun) {
      const result = await setInventoryLevel(item.inventoryItemId, locationId, RESTOCK_QUANTITY);

      if (result && result.inventory_level) {
        log(`    ✓ Restocked to ${RESTOCK_QUANTITY} units`, 'green');
        restocked++;
      } else {
        log(`    ✗ Failed to restock`, 'red');
        if (result && result.errors) {
          console.log(`      Error: ${JSON.stringify(result.errors)}`);
        }
        errors++;
      }

      // Rate limiting
      await sleep(550);
    } else {
      log(`    → Would restock to ${RESTOCK_QUANTITY} units`, 'yellow');
      restocked++;
    }
  }

  // Summary
  logSection('SUMMARY');
  log(`Total "What You Need" products: ${wynProducts.length}`, 'blue');
  log(`Already in stock: ${inStockItems.length} variants`, 'green');
  log(`Sold-out found: ${soldOutItems.length} variants`, 'yellow');
  log(`Restocked: ${restocked} variants (${RESTOCK_QUANTITY} units each)`, 'green');
  if (errors > 0) log(`Errors: ${errors}`, 'red');

  if (dryRun) {
    console.log('');
    log('This was a DRY RUN. To apply changes:', 'yellow');
    console.log('  node src/restock-sold-out.js --execute');
  } else {
    console.log('');
    log('All sold-out items have been restocked!', 'green');
  }
}

main().catch(err => {
  log(`\nFatal error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
