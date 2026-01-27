#!/usr/bin/env node
/**
 * Update Product Costs from Cloud YHS Spreadsheet
 *
 * This script reads the yhs_supply_products.xlsx spreadsheet and updates
 * the "cost" field for all matching products in Shopify.
 *
 * Cost is stored on inventory items in Shopify, not directly on variants.
 *
 * Usage:
 *   node src/update-product-costs.js          # Dry run
 *   node src/update-product-costs.js --execute # Apply changes
 */

import 'dotenv/config';
import XLSX from 'xlsx';
import { config } from './config.js';
import api from './shopify-api.js';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'bright');
  console.log('='.repeat(70));
}

/**
 * Read the Cloud YHS Excel file and extract product costs
 */
function readExcelCosts(filePath) {
  logSection('READING EXCEL SPREADSHEET');

  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON, skipping first 3 header rows
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  // Find the header row (should be row 4, index 3)
  // Headers are: Product, SKU, Picture, Weight, Specs, Cost, Stock
  const dataRows = rawData.slice(4); // Skip header rows

  const products = [];

  for (const row of dataRows) {
    if (!row || !row[0] || !row[1]) continue; // Skip empty rows

    const productName = String(row[0]).trim();
    const sku = String(row[1]).trim();
    let cost = row[5]; // Cost column (index 5)

    // Skip header rows that might have slipped through
    if (productName === 'Product' || sku === 'SKU') continue;

    // Parse cost - remove $ and commas
    if (cost) {
      cost = String(cost).replace(/[$,]/g, '');
      cost = parseFloat(cost);
    } else {
      cost = 0;
    }

    if (sku && cost > 0) {
      products.push({
        name: productName,
        sku: sku,
        cost: cost,
        retailPrice: (cost * 2).toFixed(2)
      });
    }
  }

  log(`Found ${products.length} products with costs in spreadsheet`, 'cyan');

  // Show first few for verification
  console.log('\nSample products from spreadsheet:');
  for (const p of products.slice(0, 5)) {
    console.log(`  ${p.sku}: $${p.cost.toFixed(2)} cost → $${p.retailPrice} retail | ${p.name.substring(0, 40)}`);
  }

  return products;
}

/**
 * Get all Cloud YHS products from Shopify
 */
async function getCloudYHSProducts() {
  logSection('FETCHING CLOUD YHS PRODUCTS FROM SHOPIFY');

  const allProducts = [];
  let pageInfo = null;
  let page = 1;

  do {
    const url = pageInfo
      ? `products.json?limit=250&page_info=${pageInfo}`
      : `products.json?limit=250&vendor=Cloud%20YHS`;

    const response = await api.get(url);
    const products = response.products || [];
    allProducts.push(...products);

    console.log(`  Fetched page ${page}: ${products.length} products`);
    page++;

    // Check for pagination
    pageInfo = null; // Simple pagination - may need link header parsing for more

  } while (pageInfo);

  log(`Found ${allProducts.length} Cloud YHS products in Shopify`, 'cyan');

  return allProducts;
}

/**
 * Update inventory item cost
 */
async function updateInventoryItemCost(inventoryItemId, cost) {
  return await api.updateInventoryItem(inventoryItemId, {
    id: inventoryItemId,
    cost: cost.toFixed(2)
  });
}

/**
 * Main function to update all costs
 */
async function updateProductCosts(spreadsheetProducts, shopifyProducts, dryRun = true) {
  logSection('UPDATING PRODUCT COSTS');

  if (dryRun) {
    log('DRY RUN MODE - No changes will be made', 'yellow');
  }

  // Create SKU lookup from spreadsheet
  const costBySku = {};
  for (const p of spreadsheetProducts) {
    costBySku[p.sku] = p.cost;
    // Also try with common SKU variations
    costBySku[p.sku.toUpperCase()] = p.cost;
    costBySku[p.sku.toLowerCase()] = p.cost;
  }

  let updated = 0;
  let notFound = 0;
  let errors = 0;
  let skipped = 0;

  const notFoundProducts = [];

  for (const product of shopifyProducts) {
    for (const variant of product.variants || []) {
      const sku = variant.sku;

      if (!sku) {
        skipped++;
        continue;
      }

      // Look up cost from spreadsheet
      const cost = costBySku[sku] || costBySku[sku.toUpperCase()] || costBySku[sku.toLowerCase()];

      if (!cost) {
        notFound++;
        notFoundProducts.push({ title: product.title, sku: sku });
        continue;
      }

      const inventoryItemId = variant.inventory_item_id;
      const currentPrice = parseFloat(variant.price);
      const expectedPrice = (cost * 2).toFixed(2);

      console.log(`\n  ${product.title.substring(0, 50)}`);
      console.log(`    SKU: ${sku}`);
      console.log(`    Cost: $${cost.toFixed(2)} (from spreadsheet)`);
      console.log(`    Current price: $${currentPrice} | Expected: $${expectedPrice}`);

      if (!dryRun) {
        try {
          await updateInventoryItemCost(inventoryItemId, cost);
          log(`    ✓ Cost updated!`, 'green');
          updated++;
        } catch (error) {
          log(`    ✗ Error: ${error.message}`, 'red');
          errors++;
        }
      } else {
        log(`    Would update cost to $${cost.toFixed(2)}`, 'yellow');
        updated++;
      }
    }
  }

  // Summary
  logSection('SUMMARY');
  log(`Products updated: ${updated}`, 'green');
  log(`Products not found in spreadsheet: ${notFound}`, 'yellow');
  log(`Products skipped (no SKU): ${skipped}`, 'blue');
  if (errors > 0) log(`Errors: ${errors}`, 'red');

  if (notFoundProducts.length > 0 && notFoundProducts.length <= 20) {
    console.log('\nProducts not found in spreadsheet:');
    for (const p of notFoundProducts) {
      console.log(`  - ${p.sku}: ${p.title}`);
    }
  }

  return { updated, notFound, errors, skipped };
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  const excelPath = args.find(a => a.endsWith('.xlsx')) || 'yhs_supply_products.xlsx';

  console.log('\n' + '═'.repeat(70));
  log('  CLOUD YHS PRODUCT COST UPDATER', 'bright');
  log(`  Store: ${config.shopify.storeUrl}`, 'cyan');
  log(`  Spreadsheet: ${excelPath}`, 'cyan');
  log(`  Mode: ${dryRun ? 'DRY RUN (use --execute to apply changes)' : 'EXECUTING CHANGES'}`, dryRun ? 'yellow' : 'green');
  console.log('═'.repeat(70));

  try {
    // Step 1: Read costs from Excel
    const spreadsheetProducts = readExcelCosts(excelPath);

    // Step 2: Get Cloud YHS products from Shopify
    const shopifyProducts = await getCloudYHSProducts();

    // Step 3: Update costs
    await updateProductCosts(spreadsheetProducts, shopifyProducts, dryRun);

    logSection('COMPLETE');
    if (dryRun) {
      log('\nThis was a DRY RUN. To apply changes:', 'yellow');
      console.log('  node src/update-product-costs.js --execute');
    } else {
      log('\nAll costs have been updated!', 'green');
    }

  } catch (error) {
    log(`\nFatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();
