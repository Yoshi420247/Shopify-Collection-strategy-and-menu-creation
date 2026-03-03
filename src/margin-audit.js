#!/usr/bin/env node
/**
 * Comprehensive Margin Audit for "What You Need" vendor products
 *
 * Scans every WYN product on Shopify, checks that:
 *   1. Cost is set on the inventory item
 *   2. Retail price meets the 40% minimum margin threshold
 *   3. If not, auto-fixes the price to meet the margin floor
 *
 * Also reports products with missing costs, $0 prices, or other data issues.
 *
 * Usage:
 *   node src/margin-audit.js               # Dry-run report
 *   node src/margin-audit.js --execute     # Fix under-margin prices
 *   node src/margin-audit.js --report      # JSON report to stdout
 *   node src/margin-audit.js --verbose     # Show every product
 */
import 'dotenv/config';
import { config } from './config.js';
import {
  paginateAll,
  getInventoryItem,
  updateProductVariant,
} from './shopify-api.js';
import { enforceMinMargin, MIN_MARGIN } from './pricing-engine.js';
import fs from 'fs';
import path from 'path';

const VENDOR = config.vendor || 'What You Need';
const AUDIT_LOG_FILE = path.join(process.cwd(), 'data', 'margin-audit-log.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Calculate margin: (price - cost) / price
function calcMargin(price, cost) {
  if (!price || price <= 0) return 0;
  return (price - cost) / price;
}

// ── Load / save audit log ────────────────────────────────────────────
function loadAuditLog() {
  try {
    if (fs.existsSync(AUDIT_LOG_FILE)) {
      return JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf8'));
    }
  } catch { /* ignore */ }
  return { runs: [] };
}

function saveAuditLog(log) {
  // Keep last 52 runs (~1 year of weekly audits)
  if (log.runs.length > 52) {
    log.runs = log.runs.slice(-52);
  }
  const dir = path.dirname(AUDIT_LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(AUDIT_LOG_FILE, JSON.stringify(log, null, 2));
}

// ── Main audit ───────────────────────────────────────────────────────
export async function runMarginAudit(options = {}) {
  const { dryRun = true, verbose = false, jsonReport = false } = options;
  const startTime = Date.now();

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          Margin Audit — "What You Need" Products        ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will fix under-margin prices)'}`);
  console.log(`Vendor: ${VENDOR}`);
  console.log(`Min margin: ${(MIN_MARGIN * 100).toFixed(0)}%`);
  console.log('');

  // 1. Fetch all WYN products
  console.log('Fetching all products...');
  const products = await paginateAll('products.json', 'products', {
    vendor: VENDOR,
    limit: 250,
    status: 'active',
    fields: 'id,title,vendor,variants,status,tags',
  });
  console.log(`Found ${products.length} active "${VENDOR}" products\n`);

  // Also fetch drafts so we audit everything
  const draftProducts = await paginateAll('products.json', 'products', {
    vendor: VENDOR,
    limit: 250,
    status: 'draft',
    fields: 'id,title,vendor,variants,status,tags',
  });
  console.log(`Found ${draftProducts.length} draft "${VENDOR}" products\n`);

  const allProducts = [...products, ...draftProducts];

  // 2. Audit each variant
  const issues = {
    underMargin: [],   // Price set but margin < 40%
    noCost: [],        // No cost data on inventory item
    noPrice: [],       // $0 or missing price
    healthy: [],       // Meeting margin requirements
  };

  let totalVariants = 0;
  let costFetchErrors = 0;

  for (const product of allProducts) {
    for (const variant of product.variants || []) {
      totalVariants++;

      const price = parseFloat(variant.price) || 0;
      const inventoryItemId = variant.inventory_item_id;

      // Fetch the inventory item to get cost
      let cost = 0;
      try {
        const invData = await getInventoryItem(inventoryItemId);
        cost = parseFloat(invData.inventory_item?.cost) || 0;
      } catch (err) {
        costFetchErrors++;
        if (verbose) {
          console.log(`  ! Could not fetch cost for "${product.title}" variant ${variant.id}: ${err.message}`);
        }
      }

      const entry = {
        productId: product.id,
        productTitle: product.title,
        variantId: variant.id,
        variantTitle: variant.title,
        sku: variant.sku || '',
        status: product.status,
        price,
        cost,
        margin: calcMargin(price, cost),
        inventoryItemId,
      };

      if (cost <= 0) {
        issues.noCost.push(entry);
        if (verbose) console.log(`  ? NO COST: "${product.title}" — price $${price.toFixed(2)}, no cost set`);
      } else if (price <= 0) {
        issues.noPrice.push(entry);
        if (verbose) console.log(`  ? NO PRICE: "${product.title}" — cost $${cost.toFixed(2)}, price $0`);
      } else if (entry.margin < MIN_MARGIN) {
        const minPrice = enforceMinMargin(price, cost);
        entry.requiredPrice = Math.round(minPrice * 100) / 100;
        issues.underMargin.push(entry);
        if (verbose || !jsonReport) {
          console.log(`  ✗ UNDER MARGIN: "${product.title}" — cost $${cost.toFixed(2)}, price $${price.toFixed(2)}, margin ${(entry.margin * 100).toFixed(1)}% → needs $${entry.requiredPrice.toFixed(2)}`);
        }
      } else {
        issues.healthy.push(entry);
        if (verbose) {
          console.log(`  ✓ OK: "${product.title}" — cost $${cost.toFixed(2)}, price $${price.toFixed(2)}, margin ${(entry.margin * 100).toFixed(1)}%`);
        }
      }

      // Rate limit: ~2 req/sec (already handled by shopify-api, but add small buffer)
      if (totalVariants % 50 === 0) {
        console.log(`  ... audited ${totalVariants} variants so far`);
      }
    }
  }

  // 3. Print summary
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  Total products:        ${allProducts.length}`);
  console.log(`  Total variants:        ${totalVariants}`);
  console.log(`  Healthy (≥${(MIN_MARGIN * 100).toFixed(0)}%):      ${issues.healthy.length}`);
  console.log(`  Under margin (<${(MIN_MARGIN * 100).toFixed(0)}%):  ${issues.underMargin.length}`);
  console.log(`  Missing cost:          ${issues.noCost.length}`);
  console.log(`  Missing price ($0):    ${issues.noPrice.length}`);
  console.log(`  Cost fetch errors:     ${costFetchErrors}`);
  console.log('══════════════════════════════════════════════════════════\n');

  // 4. Show worst offenders
  if (issues.underMargin.length > 0) {
    // Sort by margin ascending (worst first)
    issues.underMargin.sort((a, b) => a.margin - b.margin);

    console.log('── Top 20 Worst Margin Violations ──');
    for (const item of issues.underMargin.slice(0, 20)) {
      const lost = item.requiredPrice - item.price;
      console.log(`  ${(item.margin * 100).toFixed(1)}% margin | "$${item.price.toFixed(2)}" → "$${item.requiredPrice.toFixed(2)}" (+$${lost.toFixed(2)}) | ${item.productTitle}`);
    }
    console.log('');
  }

  // 5. Fix under-margin prices (if --execute)
  const fixes = { fixed: [], failed: [] };

  if (!dryRun && issues.underMargin.length > 0) {
    console.log(`Fixing ${issues.underMargin.length} under-margin variants...\n`);

    for (const item of issues.underMargin) {
      try {
        await updateProductVariant(item.variantId, {
          price: item.requiredPrice.toFixed(2),
        });
        console.log(`  ✔ Fixed: "${item.productTitle}" $${item.price.toFixed(2)} → $${item.requiredPrice.toFixed(2)}`);
        fixes.fixed.push(item);
      } catch (err) {
        console.error(`  ✘ Failed: "${item.productTitle}": ${err.message}`);
        fixes.failed.push({ ...item, error: err.message });
      }
      await sleep(300);
    }

    console.log(`\nFixed ${fixes.fixed.length} variants, ${fixes.failed.length} failures.`);
  } else if (dryRun && issues.underMargin.length > 0) {
    const totalRevenueDelta = issues.underMargin.reduce((sum, i) => sum + (i.requiredPrice - i.price), 0);
    console.log(`DRY RUN — ${issues.underMargin.length} variants would be fixed.`);
    console.log(`Total price increase if applied: +$${totalRevenueDelta.toFixed(2)}`);
    console.log('Run with --execute to apply fixes.\n');
  } else {
    console.log('All variants meet the minimum margin. No fixes needed.\n');
  }

  // 6. Save audit log
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const logEntry = {
    timestamp: new Date().toISOString(),
    dryRun,
    duration: `${duration}s`,
    vendor: VENDOR,
    minMargin: MIN_MARGIN,
    totalProducts: allProducts.length,
    totalVariants,
    healthy: issues.healthy.length,
    underMargin: issues.underMargin.length,
    noCost: issues.noCost.length,
    noPrice: issues.noPrice.length,
    costFetchErrors,
    fixed: fixes.fixed.length,
    failed: fixes.failed.length,
  };

  const auditLog = loadAuditLog();
  auditLog.runs.push(logEntry);
  saveAuditLog(auditLog);

  console.log(`Audit completed in ${duration}s. Log saved to ${AUDIT_LOG_FILE}`);

  // 7. JSON report mode
  if (jsonReport) {
    const report = {
      ...logEntry,
      underMarginProducts: issues.underMargin.map(i => ({
        productId: i.productId,
        title: i.productTitle,
        sku: i.sku,
        price: i.price,
        cost: i.cost,
        margin: Math.round(i.margin * 1000) / 10,
        requiredPrice: i.requiredPrice,
      })),
      noCostProducts: issues.noCost.map(i => ({
        productId: i.productId,
        title: i.productTitle,
        sku: i.sku,
        price: i.price,
      })),
      noPriceProducts: issues.noPrice.map(i => ({
        productId: i.productId,
        title: i.productTitle,
        sku: i.sku,
        cost: i.cost,
      })),
    };
    console.log('\n── JSON REPORT ──');
    console.log(JSON.stringify(report, null, 2));
  }

  return logEntry;
}

// ── CLI entry point ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = !args.includes('--execute');
const verbose = args.includes('--verbose');
const jsonReport = args.includes('--report');

runMarginAudit({ dryRun, verbose, jsonReport }).catch(err => {
  console.error('Margin audit failed:', err.message);
  process.exit(1);
});
