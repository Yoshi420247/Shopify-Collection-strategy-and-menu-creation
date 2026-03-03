#!/usr/bin/env node
/**
 * Margin Audit Tool
 *
 * Analyzes all Shopify products for margin health:
 *   1. Reads wholesaler costs from yhs_supply_products.xlsx
 *   2. Fetches all products from Shopify (all vendors)
 *   3. Cross-references SKU→cost to find missing/incorrect costs
 *   4. Identifies variants where one has cost but siblings don't
 *   5. Calculates margins and flags anomalies
 *   6. Generates MARGIN_AUDIT_REPORT.md and MARGIN_FIX_CHANGELOG.md
 *
 * Usage:
 *   node tools/margin-audit.js                # Audit only (dry run)
 *   node tools/margin-audit.js --fix          # Fix missing variant costs
 *   node tools/margin-audit.js --fix --execute # Apply fixes to Shopify
 */

import 'dotenv/config';
import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { paginateAll, getProduct, getInventoryItem, updateInventoryItem } from '../src/shopify-api.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Read wholesaler costs from Excel ─────────────────────────────────
function readExcelCosts(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const dataRows = rawData.slice(4);

  const products = [];
  for (const row of dataRows) {
    if (!row || !row[0] || !row[1]) continue;
    const productName = String(row[0]).trim();
    const sku = String(row[1]).trim();
    if (productName === 'Product' || sku === 'SKU') continue;

    let cost = row[5];
    if (cost) {
      cost = parseFloat(String(cost).replace(/[$,]/g, ''));
    } else {
      cost = 0;
    }

    products.push({
      name: productName,
      sku,
      cost,
      weight: row[3] ? String(row[3]).trim() : '',
      specs: row[4] ? String(row[4]).trim() : '',
      stock: row[6] ? String(row[6]).trim() : '',
    });
  }

  return products;
}

// ── Tiered cost multiplier (same as pricing-engine.js) ───────────────
const COST_TIERS = [
  { min: 0.50, max: 4.00, multiplier: 2.5 },
  { min: 4.01, max: 20.00, multiplier: 2.0 },
  { min: 20.01, max: 40.00, multiplier: 1.8 },
  { min: 40.01, max: 100.00, multiplier: 1.6 },
  { min: 100.01, max: 200.00, multiplier: 1.5 },
  { min: 200.01, max: Infinity, multiplier: 1.4 },
];

function calculateExpectedCost(wynPrice) {
  const price = parseFloat(wynPrice);
  if (!price || price <= 0) return 0;
  for (const tier of COST_TIERS) {
    if (price >= tier.min && price <= tier.max) {
      return Math.round(price * tier.multiplier * 100) / 100;
    }
  }
  return Math.round(price * 1.4 * 100) / 100;
}

// ── Main audit ───────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const doFix = args.includes('--fix');
  const execute = args.includes('--execute');

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║              MARGIN AUDIT & REVIEW TOOL                 ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Mode: ${doFix ? (execute ? 'FIX + EXECUTE' : 'FIX (dry run)') : 'AUDIT ONLY'}`);

  // Step 1: Read wholesaler costs
  console.log('\n── Step 1: Reading wholesaler costs from Excel ──');
  const excelPath = path.join(process.cwd(), 'yhs_supply_products.xlsx');
  const wholesalerProducts = readExcelCosts(excelPath);
  console.log(`  Found ${wholesalerProducts.length} products in wholesaler spreadsheet`);

  // Build SKU→cost lookup (case-insensitive)
  const costBySku = new Map();
  for (const p of wholesalerProducts) {
    costBySku.set(p.sku.toUpperCase(), { cost: p.cost, name: p.name, expectedShopifyCost: calculateExpectedCost(p.cost) });
  }

  // Step 2: Fetch all Shopify products
  console.log('\n── Step 2: Fetching all Shopify products ──');
  const allProducts = await paginateAll('products.json', 'products', { limit: 250 });
  console.log(`  Found ${allProducts.length} total products in Shopify`);

  // Step 3: Analyze every product
  console.log('\n── Step 3: Analyzing margins ──');

  const audit = {
    totalProducts: allProducts.length,
    totalVariants: 0,
    byVendor: {},

    // Issues
    missingCost: [],          // variants with no cost at all
    zeroCost: [],             // variants with cost = $0.00
    negativMargin: [],        // selling below cost
    lowMargin: [],            // margin < 30%
    healthyMargin: [],        // margin 30-60%
    highMargin: [],           // margin > 60%
    noPriceSet: [],           // variant price = 0

    // Variant cost propagation candidates
    variantCostGaps: [],      // products where some variants have cost, others don't

    // SKU matching
    matchedToWholesaler: [],  // products matched by SKU to wholesaler spreadsheet
    unmatchedSkus: [],        // SKUs in Shopify not found in spreadsheet
    wholesalerNotInShopify: [], // SKUs in spreadsheet not found in Shopify

    // Cost accuracy
    costMismatches: [],       // cost in Shopify doesn't match expected from wholesaler
  };

  const shopifySkus = new Set();

  for (const product of allProducts) {
    const variants = product.variants || [];
    audit.totalVariants += variants.length;

    const vendor = product.vendor || 'Unknown';
    if (!audit.byVendor[vendor]) {
      audit.byVendor[vendor] = { products: 0, variants: 0, withCost: 0, withoutCost: 0 };
    }
    audit.byVendor[vendor].products++;
    audit.byVendor[vendor].variants += variants.length;

    // Check for variant cost gaps (some have cost, some don't)
    const variantsWithCost = [];
    const variantsWithoutCost = [];

    for (const variant of variants) {
      const sku = (variant.sku || '').trim();
      if (sku) shopifySkus.add(sku.toUpperCase());

      const price = parseFloat(variant.price) || 0;
      // Note: cost is on the inventory item, not directly on variant in REST API.
      // For this audit we'll look at variant-level data and inventory_item_id.

      const entry = {
        productId: product.id,
        productTitle: product.title,
        variantId: variant.id,
        variantTitle: variant.title,
        sku: sku,
        price: price,
        vendor: vendor,
        status: product.status,
        inventoryItemId: variant.inventory_item_id,
      };

      // Match to wholesaler by SKU
      const wholesalerMatch = sku ? costBySku.get(sku.toUpperCase()) : null;
      if (wholesalerMatch) {
        entry.wholesalerCost = wholesalerMatch.cost;
        entry.expectedShopifyCost = wholesalerMatch.expectedShopifyCost;
        entry.wholesalerName = wholesalerMatch.name;
        audit.matchedToWholesaler.push(entry);
      }

      // Price checks
      if (price === 0) {
        audit.noPriceSet.push(entry);
      }
    }

    // Check variant cost propagation opportunities
    // We need to fetch inventory item costs for this
    // For the audit report, we'll track products with multiple variants
    if (variants.length > 1) {
      audit.variantCostGaps.push({
        productId: product.id,
        productTitle: product.title,
        vendor: vendor,
        variantCount: variants.length,
        variants: variants.map(v => ({
          id: v.id,
          title: v.title,
          sku: v.sku || '',
          price: parseFloat(v.price) || 0,
          inventoryItemId: v.inventory_item_id,
        })),
      });
    }
  }

  // Check wholesaler products not in Shopify
  for (const [skuUpper, info] of costBySku) {
    if (!shopifySkus.has(skuUpper)) {
      audit.wholesalerNotInShopify.push({
        sku: skuUpper,
        name: info.name,
        cost: info.cost,
        expectedShopifyCost: info.expectedShopifyCost,
      });
    }
  }

  // Step 4: Fetch inventory item costs for multi-variant products + all matched products
  console.log('\n── Step 4: Fetching inventory item costs ──');

  const inventoryItemsToCheck = new Set();
  // Add all variant inventory items for cost-gap candidates
  for (const pg of audit.variantCostGaps) {
    for (const v of pg.variants) {
      if (v.inventoryItemId) inventoryItemsToCheck.add(v.inventoryItemId);
    }
  }
  // Add all single-variant product inventory items too
  for (const product of allProducts) {
    for (const v of product.variants || []) {
      if (v.inventory_item_id) inventoryItemsToCheck.add(v.inventory_item_id);
    }
  }

  console.log(`  Need to check ${inventoryItemsToCheck.size} inventory items for cost data`);

  // Fetch costs in batches (Shopify allows up to 250 IDs per request)
  const inventoryCosts = new Map(); // inventoryItemId → cost
  const inventoryItemIds = [...inventoryItemsToCheck];

  for (let i = 0; i < inventoryItemIds.length; i += 100) {
    const batch = inventoryItemIds.slice(i, i + 100);
    const idsParam = batch.join(',');

    try {
      const response = await paginateAll(
        `inventory_items.json`,
        'inventory_items',
        { ids: idsParam, limit: 100 },
        { pageLimit: 1 }
      );

      for (const item of response) {
        const cost = item.cost ? parseFloat(item.cost) : null;
        inventoryCosts.set(item.id, cost);
      }
    } catch (err) {
      console.log(`  Warning: failed to fetch batch ${i}: ${err.message}`);
    }

    if (i + 100 < inventoryItemIds.length) {
      process.stdout.write(`  Fetched ${Math.min(i + 100, inventoryItemIds.length)}/${inventoryItemIds.length}...\r`);
      await sleep(500);
    }
  }

  console.log(`  Fetched costs for ${inventoryCosts.size} inventory items`);

  // Step 5: Full margin analysis with actual costs
  console.log('\n── Step 5: Full margin analysis ──');

  const fixes = []; // Changes to apply

  for (const product of allProducts) {
    const variants = product.variants || [];
    const vendor = product.vendor || 'Unknown';

    // Collect costs for all variants of this product
    const variantData = variants.map(v => {
      const cost = inventoryCosts.get(v.inventory_item_id);
      const price = parseFloat(v.price) || 0;
      const sku = (v.sku || '').trim();

      return {
        productId: product.id,
        productTitle: product.title,
        variantId: v.id,
        variantTitle: v.title,
        sku,
        price,
        cost,
        vendor,
        status: product.status,
        inventoryItemId: v.inventory_item_id,
      };
    });

    // Classify each variant by margin
    for (const vd of variantData) {
      if (vd.cost === null || vd.cost === undefined) {
        audit.missingCost.push(vd);
        audit.byVendor[vendor].withoutCost++;
      } else if (vd.cost === 0) {
        audit.zeroCost.push(vd);
        audit.byVendor[vendor].withoutCost++;
      } else {
        audit.byVendor[vendor].withCost++;

        if (vd.price > 0) {
          const margin = ((vd.price - vd.cost) / vd.price) * 100;
          vd.margin = Math.round(margin * 10) / 10;

          if (margin < 0) {
            audit.negativMargin.push(vd);
          } else if (margin < 30) {
            audit.lowMargin.push(vd);
          } else if (margin <= 60) {
            audit.healthyMargin.push(vd);
          } else {
            audit.highMargin.push(vd);
          }
        }
      }

      // Check against wholesaler expected cost
      const wholesalerMatch = vd.sku ? costBySku.get(vd.sku.toUpperCase()) : null;
      if (wholesalerMatch && vd.cost !== null && vd.cost > 0) {
        const expectedCost = wholesalerMatch.expectedShopifyCost;
        const diff = Math.abs(vd.cost - expectedCost);
        if (diff > 0.02) { // More than 2 cents off
          audit.costMismatches.push({
            ...vd,
            expectedCost,
            wholesalerLandedPrice: wholesalerMatch.cost,
            difference: Math.round(diff * 100) / 100,
          });
        }
      }
    }

    // Variant cost propagation: if some variants have cost and others don't
    if (variants.length > 1) {
      const withCost = variantData.filter(v => v.cost !== null && v.cost > 0);
      const withoutCost = variantData.filter(v => v.cost === null || v.cost === 0);

      if (withCost.length > 0 && withoutCost.length > 0) {
        // Use the most common cost, or the first one found
        const donorCost = withCost[0].cost;

        for (const target of withoutCost) {
          fixes.push({
            action: 'copy_variant_cost',
            productId: product.id,
            productTitle: product.title,
            targetVariantId: target.variantId,
            targetVariantTitle: target.variantTitle,
            targetSku: target.sku,
            targetInventoryItemId: target.inventoryItemId,
            donorVariantId: withCost[0].variantId,
            donorVariantTitle: withCost[0].variantTitle,
            donorSku: withCost[0].sku,
            beforeCost: target.cost,
            afterCost: donorCost,
            price: target.price,
            newMargin: target.price > 0 ? Math.round(((target.price - donorCost) / target.price) * 1000) / 10 : null,
          });
        }
      }
    }
  }

  // Step 6: Apply fixes if requested
  console.log('\n── Step 6: Fix summary ──');
  console.log(`  Variant cost gaps to fix: ${fixes.length}`);

  if (doFix && fixes.length > 0) {
    if (execute) {
      console.log('  Applying fixes to Shopify...');
      let applied = 0;
      let failed = 0;

      for (const fix of fixes) {
        try {
          await updateInventoryItem(fix.targetInventoryItemId, { cost: fix.afterCost.toFixed(2) });
          fix.applied = true;
          applied++;
          console.log(`    ✓ ${fix.productTitle} / ${fix.targetVariantTitle}: cost set to $${fix.afterCost.toFixed(2)}`);
          await sleep(500);
        } catch (err) {
          fix.applied = false;
          fix.error = err.message;
          failed++;
          console.log(`    ✗ ${fix.productTitle} / ${fix.targetVariantTitle}: ${err.message}`);
        }
      }

      console.log(`\n  Applied: ${applied} | Failed: ${failed}`);
    } else {
      console.log('  DRY RUN — use --fix --execute to apply');
      for (const fix of fixes) {
        console.log(`    Would set cost on "${fix.productTitle}" / "${fix.targetVariantTitle}": $${fix.beforeCost ?? 'null'} → $${fix.afterCost.toFixed(2)}`);
      }
    }
  }

  // Step 7: Generate reports
  console.log('\n── Step 7: Generating reports ──');

  generateAuditReport(audit, fixes, inventoryCosts, costBySku, allProducts);
  generateChangeLog(fixes, execute);

  console.log('\n  Reports generated:');
  console.log('    MARGIN_AUDIT_REPORT.md');
  console.log('    MARGIN_FIX_CHANGELOG.md');
  console.log('\nDone!');
}

// ── Report generation ────────────────────────────────────────────────

function generateAuditReport(audit, fixes, inventoryCosts, costBySku, allProducts) {
  const lines = [];
  const now = new Date().toISOString().split('T')[0];

  lines.push('# Margin Audit Report');
  lines.push('');
  lines.push(`**Store:** Oil Slick Pad (oilslickpad.com)`);
  lines.push(`**Date:** ${now}`);
  lines.push(`**Generated by:** tools/margin-audit.js`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ── Executive Summary ──
  lines.push('## Executive Summary');
  lines.push('');
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total products | ${audit.totalProducts} |`);
  lines.push(`| Total variants | ${audit.totalVariants} |`);
  lines.push(`| Variants with cost set | ${audit.healthyMargin.length + audit.highMargin.length + audit.lowMargin.length + audit.negativMargin.length} |`);
  lines.push(`| Variants missing cost | ${audit.missingCost.length} |`);
  lines.push(`| Variants with $0 cost | ${audit.zeroCost.length} |`);
  lines.push(`| Variants with no price | ${audit.noPriceSet.length} |`);
  lines.push(`| Negative margin (selling below cost) | ${audit.negativMargin.length} |`);
  lines.push(`| Low margin (<30%) | ${audit.lowMargin.length} |`);
  lines.push(`| Healthy margin (30-60%) | ${audit.healthyMargin.length} |`);
  lines.push(`| High margin (>60%) | ${audit.highMargin.length} |`);
  lines.push(`| Variant cost gaps fixable | ${fixes.length} |`);
  lines.push(`| Wholesaler SKUs matched | ${audit.matchedToWholesaler.length} |`);
  lines.push(`| Wholesaler SKUs not in Shopify | ${audit.wholesalerNotInShopify.length} |`);
  lines.push(`| Cost mismatches vs wholesaler | ${audit.costMismatches.length} |`);
  lines.push('');

  // ── By Vendor ──
  lines.push('## Breakdown by Vendor');
  lines.push('');
  lines.push('| Vendor | Products | Variants | With Cost | Without Cost |');
  lines.push('|--------|----------|----------|-----------|--------------|');
  for (const [vendor, stats] of Object.entries(audit.byVendor).sort((a, b) => b[1].products - a[1].products)) {
    lines.push(`| ${vendor} | ${stats.products} | ${stats.variants} | ${stats.withCost} | ${stats.withoutCost} |`);
  }
  lines.push('');

  // ── CRITICAL: Negative Margins ──
  if (audit.negativMargin.length > 0) {
    lines.push('## CRITICAL: Negative Margins (Selling Below Cost)');
    lines.push('');
    lines.push('These products are losing money on every sale.');
    lines.push('');
    lines.push('| Product | Variant | SKU | Price | Cost | Margin | Vendor |');
    lines.push('|---------|---------|-----|-------|------|--------|--------|');
    for (const v of audit.negativMargin.sort((a, b) => a.margin - b.margin)) {
      lines.push(`| ${v.productTitle} | ${v.variantTitle} | ${v.sku || '—'} | $${v.price.toFixed(2)} | $${v.cost.toFixed(2)} | ${v.margin}% | ${v.vendor} |`);
    }
    lines.push('');
  }

  // ── WARNING: Low Margins ──
  if (audit.lowMargin.length > 0) {
    lines.push('## WARNING: Low Margins (<30%)');
    lines.push('');
    lines.push('These products have thin margins that may not cover overhead.');
    lines.push('');
    lines.push('| Product | Variant | SKU | Price | Cost | Margin | Vendor |');
    lines.push('|---------|---------|-----|-------|------|--------|--------|');
    for (const v of audit.lowMargin.sort((a, b) => a.margin - b.margin)) {
      lines.push(`| ${v.productTitle} | ${v.variantTitle} | ${v.sku || '—'} | $${v.price.toFixed(2)} | $${v.cost.toFixed(2)} | ${v.margin}% | ${v.vendor} |`);
    }
    lines.push('');
  }

  // ── Missing Costs ──
  if (audit.missingCost.length > 0) {
    lines.push('## Missing Costs (null / not set)');
    lines.push('');
    lines.push(`${audit.missingCost.length} variants have no cost data at all.`);
    lines.push('');
    lines.push('| Product | Variant | SKU | Price | Status | Vendor |');
    lines.push('|---------|---------|-----|-------|--------|--------|');
    for (const v of audit.missingCost.slice(0, 100)) { // Cap at 100 for readability
      lines.push(`| ${v.productTitle} | ${v.variantTitle} | ${v.sku || '—'} | $${v.price.toFixed(2)} | ${v.status} | ${v.vendor} |`);
    }
    if (audit.missingCost.length > 100) {
      lines.push(`| ... | ... | ... | ... | ... | ... |`);
      lines.push(`| *(${audit.missingCost.length - 100} more)* | | | | | |`);
    }
    lines.push('');
  }

  // ── Zero Costs ──
  if (audit.zeroCost.length > 0) {
    lines.push('## Zero Costs ($0.00)');
    lines.push('');
    lines.push(`${audit.zeroCost.length} variants have cost explicitly set to $0.00.`);
    lines.push('');
    lines.push('| Product | Variant | SKU | Price | Status | Vendor |');
    lines.push('|---------|---------|-----|-------|--------|--------|');
    for (const v of audit.zeroCost.slice(0, 100)) {
      lines.push(`| ${v.productTitle} | ${v.variantTitle} | ${v.sku || '—'} | $${v.price.toFixed(2)} | ${v.status} | ${v.vendor} |`);
    }
    if (audit.zeroCost.length > 100) {
      lines.push(`| ... | ... | ... | ... | ... | ... |`);
      lines.push(`| *(${audit.zeroCost.length - 100} more)* | | | | | |`);
    }
    lines.push('');
  }

  // ── Variant Cost Gaps (Fixable) ──
  if (fixes.length > 0) {
    lines.push('## Variant Cost Gaps (Fixable by Propagation)');
    lines.push('');
    lines.push('These products have at least one variant with a cost, but other variants are missing costs.');
    lines.push('The fix copies the known cost to the missing variants.');
    lines.push('');
    lines.push('| Product | Target Variant | Donor Variant | Cost to Copy | New Margin |');
    lines.push('|---------|---------------|---------------|-------------|------------|');
    for (const fix of fixes) {
      const margin = fix.newMargin !== null ? `${fix.newMargin}%` : '—';
      lines.push(`| ${fix.productTitle} | ${fix.targetVariantTitle} (${fix.targetSku || 'no SKU'}) | ${fix.donorVariantTitle} (${fix.donorSku || 'no SKU'}) | $${fix.afterCost.toFixed(2)} | ${margin} |`);
    }
    lines.push('');
  }

  // ── Cost Mismatches vs Wholesaler ──
  if (audit.costMismatches.length > 0) {
    lines.push('## Cost Mismatches (Shopify vs Wholesaler Expected)');
    lines.push('');
    lines.push('These SKUs have costs in Shopify that differ from the expected cost calculated from the wholesaler landed price.');
    lines.push('Expected cost = wholesaler landed price × tiered multiplier (see pricing-engine.js).');
    lines.push('');
    lines.push('| Product | SKU | Shopify Cost | Expected Cost | WYN Landed | Difference |');
    lines.push('|---------|-----|-------------|--------------|------------|------------|');
    for (const v of audit.costMismatches.sort((a, b) => b.difference - a.difference)) {
      lines.push(`| ${v.productTitle} | ${v.sku} | $${v.cost.toFixed(2)} | $${v.expectedCost.toFixed(2)} | $${v.wholesalerLandedPrice.toFixed(2)} | $${v.difference.toFixed(2)} |`);
    }
    lines.push('');
  }

  // ── Wholesaler SKUs Not in Shopify ──
  if (audit.wholesalerNotInShopify.length > 0) {
    lines.push('## Wholesaler SKUs Not Yet in Shopify');
    lines.push('');
    lines.push(`${audit.wholesalerNotInShopify.length} products from the wholesaler spreadsheet have no matching SKU in Shopify.`);
    lines.push('');
    lines.push('| SKU | Product Name | WYN Landed Price | Expected Shopify Cost |');
    lines.push('|-----|-------------|-----------------|----------------------|');
    for (const p of audit.wholesalerNotInShopify) {
      lines.push(`| ${p.sku} | ${p.name} | $${p.cost.toFixed(2)} | $${p.expectedShopifyCost.toFixed(2)} |`);
    }
    lines.push('');
  }

  // ── Healthy Products ──
  lines.push('## Healthy Margin Products (30-60%)');
  lines.push('');
  lines.push(`${audit.healthyMargin.length} variants have healthy margins.`);
  lines.push('');
  if (audit.healthyMargin.length > 0) {
    lines.push('<details><summary>Click to expand full list</summary>');
    lines.push('');
    lines.push('| Product | Variant | Price | Cost | Margin |');
    lines.push('|---------|---------|-------|------|--------|');
    for (const v of audit.healthyMargin.sort((a, b) => a.margin - b.margin)) {
      lines.push(`| ${v.productTitle} | ${v.variantTitle} | $${v.price.toFixed(2)} | $${v.cost.toFixed(2)} | ${v.margin}% |`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // ── High Margin Products ──
  lines.push('## High Margin Products (>60%)');
  lines.push('');
  lines.push(`${audit.highMargin.length} variants have high margins.`);
  lines.push('');
  if (audit.highMargin.length > 0) {
    lines.push('<details><summary>Click to expand full list</summary>');
    lines.push('');
    lines.push('| Product | Variant | Price | Cost | Margin |');
    lines.push('|---------|---------|-------|------|--------|');
    for (const v of audit.highMargin.sort((a, b) => b.margin - a.margin)) {
      lines.push(`| ${v.productTitle} | ${v.variantTitle} | $${v.price.toFixed(2)} | $${v.cost.toFixed(2)} | ${v.margin}% |`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // ── Pricing Engine Reference ──
  lines.push('## Reference: Pricing Engine Tiers');
  lines.push('');
  lines.push('The wholesaler-to-Shopify cost multiplier (from `src/pricing-engine.js`):');
  lines.push('');
  lines.push('| WYN Landed Price | Multiplier | Example: $10 WYN → |');
  lines.push('|-----------------|-----------|-------------------|');
  lines.push('| $0.50 – $4.00 | 2.5x | $2.50 → $6.25 |');
  lines.push('| $4.01 – $20.00 | 2.0x | $10.00 → $20.00 |');
  lines.push('| $20.01 – $40.00 | 1.8x | $25.00 → $45.00 |');
  lines.push('| $40.01 – $100.00 | 1.6x | $50.00 → $80.00 |');
  lines.push('| $100.01 – $200.00 | 1.5x | $150.00 → $225.00 |');
  lines.push('| $200.01+ | 1.4x | $250.00 → $350.00 |');
  lines.push('');
  lines.push('Retail pricing uses an additional markup on top of cost (formula-based or AI-grounded competitor research).');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`*Report generated ${new Date().toISOString()}*`);

  fs.writeFileSync(path.join(process.cwd(), 'MARGIN_AUDIT_REPORT.md'), lines.join('\n'));
}

function generateChangeLog(fixes, executed) {
  const lines = [];
  const now = new Date().toISOString().split('T')[0];

  lines.push('# Margin Fix Changelog');
  lines.push('');
  lines.push(`**Date:** ${now}`);
  lines.push(`**Mode:** ${executed ? 'EXECUTED (changes applied to Shopify)' : 'DRY RUN (no changes applied)'}`);
  lines.push(`**Generated by:** tools/margin-audit.js`);
  lines.push('');
  lines.push('---');
  lines.push('');

  if (fixes.length === 0) {
    lines.push('## No Changes Needed');
    lines.push('');
    lines.push('All variants with sibling costs already have their costs set correctly.');
    lines.push('No variant cost propagation was necessary.');
  } else {
    lines.push('## Variant Cost Propagation');
    lines.push('');
    lines.push('For products where one variant has a cost established and the others do not,');
    lines.push('the known cost was copied to the other variants.');
    lines.push('');
    lines.push(`**Total fixes:** ${fixes.length}`);
    if (executed) {
      const applied = fixes.filter(f => f.applied).length;
      const failed = fixes.filter(f => f.applied === false).length;
      lines.push(`**Applied:** ${applied}`);
      lines.push(`**Failed:** ${failed}`);
    }
    lines.push('');

    // Group fixes by product
    const byProduct = {};
    for (const fix of fixes) {
      if (!byProduct[fix.productId]) {
        byProduct[fix.productId] = {
          title: fix.productTitle,
          fixes: [],
        };
      }
      byProduct[fix.productId].fixes.push(fix);
    }

    lines.push('### Changes by Product');
    lines.push('');

    for (const [productId, data] of Object.entries(byProduct)) {
      lines.push(`#### ${data.title} (Product #${productId})`);
      lines.push('');
      lines.push('| Variant | SKU | Before Cost | After Cost | Price | New Margin | Status |');
      lines.push('|---------|-----|-------------|------------|-------|------------|--------|');

      for (const fix of data.fixes) {
        const beforeCost = fix.beforeCost !== null && fix.beforeCost !== undefined ? `$${fix.beforeCost.toFixed(2)}` : 'null';
        const margin = fix.newMargin !== null ? `${fix.newMargin}%` : '—';
        const status = executed ? (fix.applied ? 'Applied' : `Failed: ${fix.error}`) : 'Pending';
        lines.push(`| ${fix.targetVariantTitle} | ${fix.targetSku || '—'} | ${beforeCost} | $${fix.afterCost.toFixed(2)} | $${fix.price.toFixed(2)} | ${margin} | ${status} |`);
      }

      lines.push('');
      lines.push(`> Donor: "${data.fixes[0].donorVariantTitle}" (${data.fixes[0].donorSku || 'no SKU'}) — cost: $${data.fixes[0].afterCost.toFixed(2)}`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(`*Changelog generated ${new Date().toISOString()}*`);

  fs.writeFileSync(path.join(process.cwd(), 'MARGIN_FIX_CHANGELOG.md'), lines.join('\n'));
}

main().catch(err => {
  console.error('Margin audit failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
