#!/usr/bin/env node
/**
 * Price Manager - Snapshot, Audit & Rollback Product Prices
 *
 * This script manages product prices across all vendors (Oil Slick, What You Need, Cloud YHS).
 * It can snapshot current prices, detect recent changes, and rollback to previous values.
 *
 * Usage:
 *   node src/price-manager.js                         # Snapshot all current prices to JSON
 *   node src/price-manager.js --snapshot              # Same as above
 *   node src/price-manager.js --audit                 # Show recent price-related events from Shopify
 *   node src/price-manager.js --diff <file>           # Compare current prices against a snapshot file
 *   node src/price-manager.js --rollback <file>       # Dry run: show what would revert
 *   node src/price-manager.js --rollback <file> --execute  # Actually revert prices from snapshot
 *   node src/price-manager.js --vendor "Oil Slick"    # Filter to a specific vendor
 *   node src/price-manager.js --vendor "What You Need"
 *   node src/price-manager.js --vendor "Cloud YHS"
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

// ANSI colors
const C = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  cyan: '\x1b[36m', red: '\x1b[31m', magenta: '\x1b[35m',
};

function log(msg, color = 'reset') {
  console.log(`${C[color]}${msg}${C.reset}`);
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
    if (!result || result.trim() === '') return null;
    const parsed = JSON.parse(result);
    if (parsed.errors) {
      console.error(`  API Error: ${JSON.stringify(parsed.errors)}`);
      return null;
    }
    return parsed;
  } catch (e) {
    console.error(`  Request error: ${e.message}`);
    return null;
  }
}

// ============================================================
// FETCH ALL PRODUCTS WITH PRICES
// ============================================================

async function fetchAllProducts(vendorFilter = null) {
  const allProducts = [];
  const vendors = vendorFilter ? [vendorFilter] : ['Oil Slick', 'What You Need', 'Cloud YHS'];

  for (const vendor of vendors) {
    logSection(`FETCHING "${vendor}" PRODUCTS`);
    let lastId = 0;

    while (true) {
      const url = lastId > 0
        ? `${BASE_URL}/products.json?vendor=${encodeURIComponent(vendor)}&limit=250&since_id=${lastId}&fields=id,title,vendor,status,variants,tags`
        : `${BASE_URL}/products.json?vendor=${encodeURIComponent(vendor)}&limit=250&fields=id,title,vendor,status,variants,tags`;

      const data = curlRequest(url);
      if (!data || !data.products || data.products.length === 0) break;

      allProducts.push(...data.products);
      lastId = data.products[data.products.length - 1].id;
      console.log(`  Fetched ${allProducts.length} products so far...`);

      if (data.products.length < 250) break;
      await sleep(550);
    }

    const vendorCount = allProducts.filter(p => p.vendor === vendor).length;
    log(`  Found ${vendorCount} "${vendor}" products`, 'cyan');
  }

  return allProducts;
}

// ============================================================
// SNAPSHOT - Save current prices to file
// ============================================================

async function snapshotPrices(vendorFilter) {
  const products = await fetchAllProducts(vendorFilter);

  logSection('BUILDING PRICE SNAPSHOT');

  const snapshot = {
    timestamp: new Date().toISOString(),
    store: STORE_URL,
    vendorFilter: vendorFilter || 'all',
    productCount: 0,
    variantCount: 0,
    products: [],
  };

  for (const product of products) {
    const productEntry = {
      id: product.id,
      title: product.title,
      vendor: product.vendor,
      status: product.status,
      variants: [],
    };

    for (const variant of product.variants || []) {
      productEntry.variants.push({
        id: variant.id,
        title: variant.title,
        sku: variant.sku || '',
        price: variant.price,
        compare_at_price: variant.compare_at_price,
        inventory_item_id: variant.inventory_item_id,
      });
      snapshot.variantCount++;
    }

    snapshot.products.push(productEntry);
    snapshot.productCount++;
  }

  // Generate filename with timestamp
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
  const vendorSlug = vendorFilter ? vendorFilter.toLowerCase().replace(/\s+/g, '-') : 'all';
  const filename = `price-snapshot-${vendorSlug}-${dateStr}.json`;

  writeFileSync(filename, JSON.stringify(snapshot, null, 2));

  logSection('SNAPSHOT COMPLETE');
  log(`Products: ${snapshot.productCount}`, 'cyan');
  log(`Variants: ${snapshot.variantCount}`, 'cyan');
  log(`Saved to: ${filename}`, 'green');

  // Print price summary by vendor
  const vendorSummary = {};
  for (const p of snapshot.products) {
    if (!vendorSummary[p.vendor]) {
      vendorSummary[p.vendor] = { count: 0, totalValue: 0, minPrice: Infinity, maxPrice: 0 };
    }
    for (const v of p.variants) {
      const price = parseFloat(v.price);
      vendorSummary[p.vendor].count++;
      vendorSummary[p.vendor].totalValue += price;
      vendorSummary[p.vendor].minPrice = Math.min(vendorSummary[p.vendor].minPrice, price);
      vendorSummary[p.vendor].maxPrice = Math.max(vendorSummary[p.vendor].maxPrice, price);
    }
  }

  console.log('\nPrice Summary by Vendor:');
  for (const [vendor, stats] of Object.entries(vendorSummary)) {
    console.log(`\n  ${vendor}:`);
    console.log(`    Variants: ${stats.count}`);
    console.log(`    Price range: $${stats.minPrice.toFixed(2)} - $${stats.maxPrice.toFixed(2)}`);
    console.log(`    Avg price: $${(stats.totalValue / stats.count).toFixed(2)}`);
  }

  // Also print a quick table of all products with their prices
  logSection('PRICE TABLE');
  for (const p of snapshot.products) {
    for (const v of p.variants) {
      const variantLabel = v.title !== 'Default Title' ? ` [${v.title}]` : '';
      const sku = v.sku ? ` (${v.sku})` : '';
      const compareAt = v.compare_at_price ? ` was $${v.compare_at_price}` : '';
      console.log(`  $${String(v.price).padStart(8)} ${compareAt.padEnd(14)} | ${p.vendor.padEnd(14)} | ${p.title.substring(0, 45)}${variantLabel}${sku}`);
    }
  }

  return { filename, snapshot };
}

// ============================================================
// AUDIT - Check Shopify events for recent price changes
// ============================================================

async function auditPriceChanges() {
  logSection('AUDITING RECENT SHOPIFY EVENTS');
  log('Checking for recent product update events...', 'cyan');

  // Fetch recent product events
  const data = curlRequest(`${BASE_URL}/events.json?filter=Product&verb=update&limit=250`);

  if (!data || !data.events) {
    log('Could not fetch events from Shopify', 'red');
    return;
  }

  const events = data.events;
  log(`Found ${events.length} recent product update events`, 'cyan');

  if (events.length === 0) {
    log('No recent product update events found.', 'yellow');
    return;
  }

  // Group events by date
  const byDate = {};
  for (const event of events) {
    const date = event.created_at.split('T')[0];
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(event);
  }

  console.log('\nEvent timeline:');
  for (const [date, dateEvents] of Object.entries(byDate).sort()) {
    console.log(`\n  ${date}: ${dateEvents.length} product updates`);
    // Show first few
    for (const ev of dateEvents.slice(0, 5)) {
      const time = ev.created_at.split('T')[1].replace('Z', '').split('-')[0];
      console.log(`    ${time} - ${ev.message || ev.description || 'Product updated'}`);
      if (ev.subject_id) {
        console.log(`      Product ID: ${ev.subject_id}`);
      }
    }
    if (dateEvents.length > 5) {
      console.log(`    ... and ${dateEvents.length - 5} more`);
    }
  }

  // Also check for any events in the last 48 hours that specifically mention prices
  const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const recentData = curlRequest(`${BASE_URL}/events.json?filter=Product&created_at_min=${twoDaysAgo}&limit=250`);

  if (recentData && recentData.events) {
    logSection('EVENTS IN LAST 48 HOURS');
    log(`Found ${recentData.events.length} events`, 'cyan');

    for (const ev of recentData.events) {
      const time = ev.created_at.replace('T', ' ').replace('Z', '').split('-').slice(0, 3).join('-');
      const desc = ev.message || ev.description || `${ev.verb} ${ev.subject_type}`;
      console.log(`  ${time} | ${desc}`);
    }
  }
}

// ============================================================
// DIFF - Compare current prices against a snapshot
// ============================================================

async function diffPrices(snapshotFile, vendorFilter) {
  if (!existsSync(snapshotFile)) {
    log(`Snapshot file not found: ${snapshotFile}`, 'red');
    process.exit(1);
  }

  const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'));
  log(`Loaded snapshot from: ${snapshot.timestamp}`, 'cyan');
  log(`Snapshot contains: ${snapshot.productCount} products, ${snapshot.variantCount} variants`, 'cyan');

  // Build lookup from snapshot
  const snapshotPrices = {};
  for (const p of snapshot.products) {
    for (const v of p.variants) {
      snapshotPrices[v.id] = {
        price: v.price,
        compare_at_price: v.compare_at_price,
        title: p.title,
        vendor: p.vendor,
        sku: v.sku,
        variantTitle: v.title,
      };
    }
  }

  // Fetch current prices
  const currentProducts = await fetchAllProducts(vendorFilter);

  logSection('PRICE DIFFERENCES');

  let changed = 0;
  let unchanged = 0;
  let newProducts = 0;
  let missing = 0;
  const changes = [];

  for (const p of currentProducts) {
    for (const v of p.variants || []) {
      const prev = snapshotPrices[v.id];

      if (!prev) {
        newProducts++;
        continue;
      }

      const currentPrice = v.price;
      const prevPrice = prev.price;

      if (currentPrice !== prevPrice) {
        changed++;
        const diff = parseFloat(currentPrice) - parseFloat(prevPrice);
        const direction = diff > 0 ? 'UP' : 'DOWN';
        const dirColor = diff > 0 ? 'red' : 'green';

        changes.push({
          productTitle: p.title,
          vendor: p.vendor,
          sku: v.sku || '',
          variantId: v.id,
          previousPrice: prevPrice,
          currentPrice: currentPrice,
          diff: diff,
          direction: direction,
        });

        log(`  ${direction} $${Math.abs(diff).toFixed(2).padStart(7)} | $${prevPrice} → $${currentPrice} | ${p.vendor.padEnd(14)} | ${p.title.substring(0, 40)} ${v.sku ? '(' + v.sku + ')' : ''}`, dirColor);
      } else {
        unchanged++;
      }

      // Remove from snapshot lookup to track missing
      delete snapshotPrices[v.id];
    }
  }

  // Remaining in snapshotPrices are products that no longer exist
  missing = Object.keys(snapshotPrices).length;

  logSection('DIFF SUMMARY');
  log(`Prices changed: ${changed}`, changed > 0 ? 'red' : 'green');
  log(`Prices unchanged: ${unchanged}`, 'green');
  log(`New products (not in snapshot): ${newProducts}`, 'blue');
  log(`Missing products (in snapshot but not found): ${missing}`, 'yellow');

  if (changes.length > 0) {
    // Group changes by vendor
    const byVendor = {};
    for (const c of changes) {
      if (!byVendor[c.vendor]) byVendor[c.vendor] = [];
      byVendor[c.vendor].push(c);
    }

    console.log('\nChanges by vendor:');
    for (const [vendor, vendorChanges] of Object.entries(byVendor)) {
      const up = vendorChanges.filter(c => c.direction === 'UP').length;
      const down = vendorChanges.filter(c => c.direction === 'DOWN').length;
      console.log(`  ${vendor}: ${vendorChanges.length} changes (${up} up, ${down} down)`);
    }
  }

  return changes;
}

// ============================================================
// ROLLBACK - Revert prices from a snapshot file
// ============================================================

async function rollbackPrices(snapshotFile, vendorFilter, dryRun = true) {
  if (!existsSync(snapshotFile)) {
    log(`Snapshot file not found: ${snapshotFile}`, 'red');
    process.exit(1);
  }

  const snapshot = JSON.parse(readFileSync(snapshotFile, 'utf8'));

  logSection('PRICE ROLLBACK');
  log(`Snapshot from: ${snapshot.timestamp}`, 'cyan');
  log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTING'}`, dryRun ? 'yellow' : 'red');

  // Build lookup from snapshot
  const snapshotLookup = {};
  for (const p of snapshot.products) {
    if (vendorFilter && p.vendor !== vendorFilter) continue;
    for (const v of p.variants) {
      snapshotLookup[v.id] = {
        price: v.price,
        compare_at_price: v.compare_at_price,
        productId: p.id,
        title: p.title,
        vendor: p.vendor,
        sku: v.sku,
      };
    }
  }

  log(`Loaded ${Object.keys(snapshotLookup).length} variant prices from snapshot`, 'cyan');

  // Fetch current products
  const currentProducts = await fetchAllProducts(vendorFilter);

  // Find differences and revert
  let reverted = 0;
  let skipped = 0;
  let errors = 0;
  const revertActions = [];

  for (const p of currentProducts) {
    for (const v of p.variants || []) {
      const prev = snapshotLookup[v.id];
      if (!prev) continue;

      const currentPrice = v.price;
      const targetPrice = prev.price;

      if (currentPrice === targetPrice) {
        skipped++;
        continue;
      }

      revertActions.push({
        productId: p.id,
        productTitle: p.title,
        vendor: p.vendor,
        variantId: v.id,
        sku: v.sku || '',
        currentPrice,
        targetPrice,
        compare_at_price: prev.compare_at_price,
      });
    }
  }

  if (revertActions.length === 0) {
    logSection('NO CHANGES NEEDED');
    log('All prices already match the snapshot.', 'green');
    return;
  }

  logSection(`${dryRun ? 'WOULD REVERT' : 'REVERTING'} ${revertActions.length} PRICES`);

  for (let i = 0; i < revertActions.length; i++) {
    const action = revertActions[i];
    const diff = parseFloat(action.currentPrice) - parseFloat(action.targetPrice);

    console.log(`\n  [${i + 1}/${revertActions.length}] ${action.productTitle}`);
    console.log(`    Vendor: ${action.vendor} | SKU: ${action.sku}`);
    console.log(`    Current: $${action.currentPrice} → Revert to: $${action.targetPrice} (${diff > 0 ? '-' : '+'}$${Math.abs(diff).toFixed(2)})`);

    if (!dryRun) {
      try {
        const updateData = {
          variant: {
            id: action.variantId,
            price: action.targetPrice,
          }
        };
        if (action.compare_at_price) {
          updateData.variant.compare_at_price = action.compare_at_price;
        }

        const result = curlRequest(
          `${BASE_URL}/variants/${action.variantId}.json`,
          'PUT',
          updateData
        );

        if (result && result.variant) {
          log(`    Reverted to $${action.targetPrice}`, 'green');
          reverted++;
        } else {
          log(`    Failed to revert`, 'red');
          errors++;
        }

        await sleep(550); // Rate limiting
      } catch (err) {
        log(`    Error: ${err.message}`, 'red');
        errors++;
      }
    } else {
      log(`    Would revert to $${action.targetPrice}`, 'yellow');
      reverted++;
    }
  }

  // Summary
  logSection('ROLLBACK SUMMARY');
  log(`Prices to revert: ${revertActions.length}`, 'cyan');
  log(`${dryRun ? 'Would revert' : 'Reverted'}: ${reverted}`, 'green');
  log(`Already correct (skipped): ${skipped}`, 'blue');
  if (errors > 0) log(`Errors: ${errors}`, 'red');

  if (dryRun && revertActions.length > 0) {
    console.log('');
    log('This was a DRY RUN. To apply the rollback:', 'yellow');
    console.log(`  node src/price-manager.js --rollback ${snapshotFile} --execute`);
    if (vendorFilter) {
      console.log(`  (filtered to vendor: "${vendorFilter}")`);
    }
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const hasAudit = args.includes('--audit');
  const hasSnapshot = args.includes('--snapshot') || args.length === 0;
  const hasDiff = args.includes('--diff');
  const hasRollback = args.includes('--rollback');
  const hasExecute = args.includes('--execute');

  // Parse vendor filter
  let vendorFilter = null;
  const vendorIdx = args.indexOf('--vendor');
  if (vendorIdx !== -1 && args[vendorIdx + 1]) {
    vendorFilter = args[vendorIdx + 1];
  }

  // Parse file argument for diff/rollback
  let snapshotFile = null;
  if (hasDiff) {
    const idx = args.indexOf('--diff');
    snapshotFile = args[idx + 1];
  }
  if (hasRollback) {
    const idx = args.indexOf('--rollback');
    snapshotFile = args[idx + 1];
  }

  console.log('\n' + '\u2550'.repeat(70));
  log('  PRICE MANAGER', 'bright');
  log(`  Store: ${STORE_URL}`, 'cyan');
  if (vendorFilter) log(`  Vendor filter: ${vendorFilter}`, 'cyan');
  console.log('\u2550'.repeat(70));

  if (hasAudit) {
    await auditPriceChanges();
  } else if (hasDiff && snapshotFile) {
    await diffPrices(snapshotFile, vendorFilter);
  } else if (hasRollback && snapshotFile) {
    await rollbackPrices(snapshotFile, vendorFilter, !hasExecute);
  } else {
    // Default: snapshot
    await snapshotPrices(vendorFilter);
  }
}

main().catch(err => {
  log(`\nFatal error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
