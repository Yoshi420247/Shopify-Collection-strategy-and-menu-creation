#!/usr/bin/env node
/**
 * Set Stock Quantity for All "What You Need" Products
 *
 * Sets ALL "What You Need" vendor product variants to a specified quantity.
 * Unlike restock-sold-out.js which only targets sold-out items, this script
 * updates every single variant regardless of current stock level.
 *
 * Usage:
 *   node src/set-stock-quantity.js --qty=25              # Dry run - shows what would change
 *   node src/set-stock-quantity.js --qty=25 --execute    # Apply changes
 *   node src/set-stock-quantity.js --qty=0 --execute     # Set everything to 0 (clear stock)
 */

import 'dotenv/config';
import { execSync } from 'child_process';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'bright');
  console.log('='.repeat(70));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function curlRequest(url, method = 'GET', body = null) {
  let cmd = `curl -s --max-time 60 -X ${method} "${url}" `;
  cmd += `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" `;
  cmd += `-H "Content-Type: application/json" `;

  if (body) {
    const escapedBody = JSON.stringify(body).replace(/'/g, "'\\''");
    cmd += `-d '${escapedBody}'`;
  }

  try {
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (e) {
    console.error(`  Request error: ${e.message}`);
    return null;
  }
}

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
 * Fetch all products from a vendor with pagination
 */
async function getAllProducts(vendor) {
  const products = [];
  let lastId = 0;

  while (true) {
    const url = lastId > 0
      ? `${BASE_URL}/products.json?vendor=${encodeURIComponent(vendor)}&limit=250&since_id=${lastId}`
      : `${BASE_URL}/products.json?vendor=${encodeURIComponent(vendor)}&limit=250`;

    const data = curlRequest(url);
    if (!data || !data.products || data.products.length === 0) break;

    products.push(...data.products);
    lastId = data.products[data.products.length - 1].id;
    console.log(`  Fetched ${products.length} products...`);

    if (data.products.length < 250) break;
    await sleep(500);
  }

  return products;
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
 * Parse --qty=N from command line args
 */
function parseQuantity(args) {
  const qtyArg = args.find(a => a.startsWith('--qty='));
  if (!qtyArg) return null;

  const val = parseInt(qtyArg.split('=')[1], 10);
  if (isNaN(val) || val < 0) return null;
  return val;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  const quantity = parseQuantity(args);

  if (quantity === null) {
    log('\nError: You must specify a quantity with --qty=N (where N >= 0)', 'red');
    console.log('\nUsage:');
    console.log('  node src/set-stock-quantity.js --qty=25              # Dry run');
    console.log('  node src/set-stock-quantity.js --qty=25 --execute    # Apply changes');
    console.log('  node src/set-stock-quantity.js --qty=0 --execute     # Set all to 0');
    process.exit(1);
  }

  console.log('\n' + '═'.repeat(70));
  log('  SET STOCK QUANTITY - ALL "WHAT YOU NEED" PRODUCTS', 'bright');
  log(`  Store: ${STORE_URL}`, 'cyan');
  log(`  Target quantity: ${quantity} units`, 'magenta');
  log(`  Mode: ${dryRun ? 'DRY RUN (use --execute to apply)' : 'EXECUTING CHANGES'}`, dryRun ? 'yellow' : 'green');
  console.log('═'.repeat(70));

  // Step 1: Get inventory location
  logSection('GETTING INVENTORY LOCATION');
  const locationId = await getLocationId();

  // Step 2: Fetch all "What You Need" products
  logSection('FETCHING "WHAT YOU NEED" PRODUCTS');
  const wynProducts = await getAllProducts('What You Need');
  log(`Found ${wynProducts.length} "What You Need" products`, 'cyan');

  // Step 3: Build the list of all variants
  logSection('BUILDING VARIANT LIST');

  const allVariants = [];
  let alreadyAtTarget = 0;
  let needsUpdate = 0;

  for (const product of wynProducts) {
    for (const variant of product.variants || []) {
      const currentQty = variant.inventory_quantity || 0;

      if (currentQty === quantity) {
        alreadyAtTarget++;
      } else {
        needsUpdate++;
        allVariants.push({
          productTitle: product.title,
          productId: product.id,
          variantId: variant.id,
          variantTitle: variant.title,
          sku: variant.sku || '(no SKU)',
          inventoryItemId: variant.inventory_item_id,
          currentQuantity: currentQty,
        });
      }
    }
  }

  log(`\nAlready at ${quantity}: ${alreadyAtTarget} variants (no change needed)`, 'green');
  log(`Need update: ${needsUpdate} variants`, 'yellow');

  if (allVariants.length === 0) {
    logSection('NO UPDATES NEEDED');
    log(`All variants are already at ${quantity} units!`, 'green');
    return;
  }

  // Step 4: Update inventory for all variants that need it
  logSection(`SETTING ${allVariants.length} VARIANTS TO ${quantity} UNITS`);

  let updated = 0;
  let errors = 0;

  for (let i = 0; i < allVariants.length; i++) {
    const item = allVariants[i];

    console.log(`\n  [${i + 1}/${allVariants.length}] ${item.productTitle}`);
    console.log(`    SKU: ${item.sku}`);
    if (item.variantTitle !== 'Default Title') {
      console.log(`    Variant: ${item.variantTitle}`);
    }
    console.log(`    Current qty: ${item.currentQuantity} → New qty: ${quantity}`);

    if (!dryRun) {
      const result = await setInventoryLevel(item.inventoryItemId, locationId, quantity);

      if (result && result.inventory_level) {
        log(`    ✓ Set to ${quantity} units`, 'green');
        updated++;
      } else {
        log(`    ✗ Failed to update`, 'red');
        if (result && result.errors) {
          console.log(`      Error: ${JSON.stringify(result.errors)}`);
        }
        errors++;
      }

      // Rate limiting
      await sleep(550);
    } else {
      log(`    → Would set to ${quantity} units`, 'yellow');
      updated++;
    }
  }

  // Summary
  logSection('SUMMARY');
  log(`Total "What You Need" products: ${wynProducts.length}`, 'blue');
  log(`Target quantity: ${quantity} units`, 'magenta');
  log(`Already at target: ${alreadyAtTarget} variants (skipped)`, 'green');
  log(`Updated: ${updated} variants`, 'green');
  if (errors > 0) log(`Errors: ${errors}`, 'red');

  if (dryRun) {
    console.log('');
    log('This was a DRY RUN. To apply changes:', 'yellow');
    console.log(`  node src/set-stock-quantity.js --qty=${quantity} --execute`);
  } else {
    console.log('');
    log(`All "What You Need" products set to ${quantity} units!`, 'green');
  }
}

main().catch(err => {
  log(`\nFatal error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
