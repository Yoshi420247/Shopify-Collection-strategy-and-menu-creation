#!/usr/bin/env node
/**
 * Profit Margin Audit for "What You Need" Products
 *
 * 1. Fetches all products from Shopify
 * 2. Cross-references with YHS Supply spreadsheet for supplier cost
 * 3. Checks Shopify cost field vs retail price
 * 4. Flags anything below 30% margin
 * 5. Outputs a full audit report
 */

import 'dotenv/config';
import XLSX from 'xlsx';
import { paginateAll, getInventoryItem } from './shopify-api.js';
import { calculateCost } from './pricing-engine.js';
import { writeFileSync } from 'fs';

// ── Read supplier spreadsheet ────────────────────────────────────────
function readSupplierCosts(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const dataRows = rawData.slice(4); // Skip header rows

  const products = {};

  for (const row of dataRows) {
    if (!row || !row[0] || !row[1]) continue;

    const productName = String(row[0]).trim();
    const sku = String(row[1]).trim();
    let cost = row[5];

    if (productName === 'Product' || sku === 'SKU' || sku === 'No.') continue;

    if (cost) {
      cost = String(cost).replace(/[$,]/g, '');
      cost = parseFloat(cost);
    } else {
      cost = 0;
    }

    if (sku && cost > 0) {
      products[sku.toUpperCase()] = {
        name: productName,
        sku,
        wynLandedCost: cost,
      };
    }
  }

  console.log(`Loaded ${Object.keys(products).length} supplier products from spreadsheet`);
  return products;
}

// ── Fetch Shopify cost for an inventory item ─────────────────────────
async function getShopifyCost(inventoryItemId) {
  try {
    const data = await getInventoryItem(inventoryItemId);
    return data?.inventory_item?.cost ? parseFloat(data.inventory_item.cost) : null;
  } catch (err) {
    console.log(`  Warning: Could not fetch inventory item ${inventoryItemId}: ${err.message}`);
    return null;
  }
}

// ── Main audit ───────────────────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  PROFIT MARGIN AUDIT — What You Need Products');
  console.log('═'.repeat(70) + '\n');

  // Step 1: Read supplier costs
  const supplierCosts = readSupplierCosts('yhs_supply_products.xlsx');

  // Step 2: Fetch ALL products from Shopify (paginated)
  console.log('\nFetching products from Shopify...');
  const allProducts = await paginateAll('products.json', 'products', { limit: 250 });
  console.log(`Total products in store: ${allProducts.length}\n`);

  // Step 3: Process each product
  const auditResults = [];
  let processedCount = 0;

  for (const product of allProducts) {
    for (const variant of product.variants || []) {
      processedCount++;
      const sku = (variant.sku || '').trim();
      const retailPrice = parseFloat(variant.price) || 0;
      const inventoryItemId = variant.inventory_item_id;

      // Get Shopify cost field
      const shopifyCost = await getShopifyCost(inventoryItemId);

      // Look up supplier cost
      const supplierData = sku
        ? supplierCosts[sku.toUpperCase()] || supplierCosts[sku]
        : null;

      const wynLandedCost = supplierData?.wynLandedCost || null;

      // Calculate what the Shopify cost SHOULD be using pricing engine tiers
      const expectedShopifyCost = wynLandedCost ? calculateCost(wynLandedCost) : null;

      // Calculate margin using Shopify cost field
      let marginFromShopifyCost = null;
      if (shopifyCost !== null && shopifyCost > 0 && retailPrice > 0) {
        marginFromShopifyCost = ((retailPrice - shopifyCost) / retailPrice) * 100;
      }

      // Calculate margin using WYN landed cost directly
      let marginFromWynCost = null;
      if (wynLandedCost && retailPrice > 0) {
        marginFromWynCost = ((retailPrice - wynLandedCost) / retailPrice) * 100;
      }

      // Calculate margin using expected Shopify cost
      let marginFromExpectedCost = null;
      if (expectedShopifyCost && retailPrice > 0) {
        marginFromExpectedCost = ((retailPrice - expectedShopifyCost) / retailPrice) * 100;
      }

      const result = {
        productTitle: product.title,
        variantTitle: variant.title !== 'Default Title' ? variant.title : '',
        sku: sku || 'N/A',
        retailPrice,
        shopifyCost,
        wynLandedCost,
        expectedShopifyCost,
        marginFromShopifyCost: marginFromShopifyCost !== null ? Math.round(marginFromShopifyCost * 100) / 100 : null,
        marginFromWynCost: marginFromWynCost !== null ? Math.round(marginFromWynCost * 100) / 100 : null,
        marginFromExpectedCost: marginFromExpectedCost !== null ? Math.round(marginFromExpectedCost * 100) / 100 : null,
        vendor: product.vendor,
        productId: product.id,
        variantId: variant.id,
        inventoryItemId,
        tags: product.tags,
      };

      // Flag issues
      result.issues = [];

      if (shopifyCost === null || shopifyCost === 0) {
        result.issues.push('NO_SHOPIFY_COST');
      }

      if (marginFromShopifyCost !== null && marginFromShopifyCost < 30) {
        result.issues.push('LOW_MARGIN_SHOPIFY_COST');
      }

      if (marginFromExpectedCost !== null && marginFromExpectedCost < 30) {
        result.issues.push('LOW_MARGIN_EXPECTED_COST');
      }

      if (shopifyCost !== null && expectedShopifyCost !== null) {
        const diff = Math.abs(shopifyCost - expectedShopifyCost);
        if (diff > 1.0) {
          result.issues.push('COST_MISMATCH');
        }
      }

      if (!supplierData && sku) {
        result.issues.push('NO_SUPPLIER_MATCH');
      }

      if (retailPrice === 0) {
        result.issues.push('ZERO_RETAIL_PRICE');
      }

      auditResults.push(result);

      if (processedCount % 20 === 0) {
        console.log(`  Processed ${processedCount} variants...`);
      }
    }
  }

  console.log(`\nProcessed ${processedCount} total variants across ${allProducts.length} products`);

  // Step 4: Generate report
  generateReport(auditResults, supplierCosts);
}

function generateReport(results, supplierCosts) {
  const now = new Date().toISOString().split('T')[0];

  // Separate into categories
  const lowMarginProducts = results.filter(r =>
    r.issues.includes('LOW_MARGIN_SHOPIFY_COST') ||
    r.issues.includes('LOW_MARGIN_EXPECTED_COST')
  );

  const costMismatches = results.filter(r => r.issues.includes('COST_MISMATCH'));
  const noCostSet = results.filter(r => r.issues.includes('NO_SHOPIFY_COST'));
  const noSupplierMatch = results.filter(r => r.issues.includes('NO_SUPPLIER_MATCH'));
  const healthyProducts = results.filter(r => r.issues.length === 0);

  // Build report
  let report = '';
  report += `# Shopify Profit Margin Audit Report\n`;
  report += `**Date:** ${now}\n`;
  report += `**Store:** oil-slick-pad.myshopify.com\n`;
  report += `**Scope:** All products (What You Need & Cloud YHS)\n\n`;

  report += `---\n\n`;

  // Executive summary
  report += `## Executive Summary\n\n`;
  report += `| Metric | Count |\n`;
  report += `|--------|-------|\n`;
  report += `| Total variants audited | ${results.length} |\n`;
  report += `| Healthy (margin >= 30%) | ${healthyProducts.length} |\n`;
  report += `| **LOW MARGIN (< 30%)** | **${lowMarginProducts.length}** |\n`;
  report += `| Missing Shopify cost field | ${noCostSet.length} |\n`;
  report += `| Cost mismatch (Shopify vs expected) | ${costMismatches.length} |\n`;
  report += `| No supplier spreadsheet match | ${noSupplierMatch.length} |\n\n`;

  // Pricing engine tiers reference
  report += `## Pricing Engine Reference (WYN → Shopify Cost Tiers)\n\n`;
  report += `| WYN Landed Price | Multiplier | Example: WYN $10 → Shopify Cost |\n`;
  report += `|-----------------|------------|----------------------------------|\n`;
  report += `| $0.50 – $4.00 | 2.5x | $2.50 → $6.25 |\n`;
  report += `| $4.01 – $20.00 | 2.0x | $10.00 → $20.00 |\n`;
  report += `| $20.01 – $40.00 | 1.8x | $25.00 → $45.00 |\n`;
  report += `| $40.01 – $100.00 | 1.6x | $50.00 → $80.00 |\n`;
  report += `| $100.01 – $200.00 | 1.5x | $150.00 → $225.00 |\n`;
  report += `| $200.01+ | 1.4x | $250.00 → $350.00 |\n\n`;

  report += `> **Margin formula:** \`(retail_price - cost) / retail_price × 100\`\n`;
  report += `> A 30% margin means the cost is 70% of the retail price.\n\n`;

  report += `---\n\n`;

  // Section 1: LOW MARGIN PRODUCTS (critical)
  report += `## CRITICAL: Products Below 30% Margin\n\n`;
  report += `These products need immediate price or cost review.\n\n`;

  if (lowMarginProducts.length === 0) {
    report += `*No products found below 30% margin — all pricing looks healthy.*\n\n`;
  } else {
    report += `| # | Product | SKU | Retail | Shopify Cost | WYN Cost | Expected Cost | Margin (Shopify) | Margin (WYN) | Issues |\n`;
    report += `|---|---------|-----|--------|-------------|----------|---------------|-----------------|-------------|--------|\n`;

    lowMarginProducts
      .sort((a, b) => (a.marginFromShopifyCost ?? 999) - (b.marginFromShopifyCost ?? 999))
      .forEach((r, i) => {
        const displayName = r.variantTitle
          ? `${r.productTitle} (${r.variantTitle})`
          : r.productTitle;
        report += `| ${i + 1} | ${displayName.substring(0, 50)} | ${r.sku} | $${r.retailPrice.toFixed(2)} | ${r.shopifyCost !== null ? '$' + r.shopifyCost.toFixed(2) : 'NOT SET'} | ${r.wynLandedCost ? '$' + r.wynLandedCost.toFixed(2) : 'N/A'} | ${r.expectedShopifyCost ? '$' + r.expectedShopifyCost.toFixed(2) : 'N/A'} | ${r.marginFromShopifyCost !== null ? r.marginFromShopifyCost.toFixed(1) + '%' : 'N/A'} | ${r.marginFromWynCost !== null ? r.marginFromWynCost.toFixed(1) + '%' : 'N/A'} | ${r.issues.join(', ')} |\n`;
      });

    report += `\n`;

    // Detailed breakdown per product
    report += `### Detailed Breakdown — Low Margin Products\n\n`;

    for (const r of lowMarginProducts.sort((a, b) => (a.marginFromShopifyCost ?? 999) - (b.marginFromShopifyCost ?? 999))) {
      const displayName = r.variantTitle
        ? `${r.productTitle} (${r.variantTitle})`
        : r.productTitle;
      report += `#### ${displayName}\n\n`;
      report += `- **SKU:** ${r.sku}\n`;
      report += `- **Product ID:** ${r.productId} | **Variant ID:** ${r.variantId}\n`;
      report += `- **Retail Price:** $${r.retailPrice.toFixed(2)}\n`;
      report += `- **Shopify Cost Field:** ${r.shopifyCost !== null ? '$' + r.shopifyCost.toFixed(2) : 'NOT SET'}\n`;
      report += `- **WYN Landed Cost (from spreadsheet):** ${r.wynLandedCost ? '$' + r.wynLandedCost.toFixed(2) : 'Not found in spreadsheet'}\n`;
      report += `- **Expected Shopify Cost (pricing engine):** ${r.expectedShopifyCost ? '$' + r.expectedShopifyCost.toFixed(2) : 'N/A'}\n`;
      report += `- **Margin (from Shopify cost):** ${r.marginFromShopifyCost !== null ? r.marginFromShopifyCost.toFixed(1) + '%' : 'Cannot calculate'}\n`;
      report += `- **Margin (from WYN landed cost):** ${r.marginFromWynCost !== null ? r.marginFromWynCost.toFixed(1) + '%' : 'N/A'}\n`;

      // Diagnosis
      report += `- **Diagnosis:**\n`;
      for (const issue of r.issues) {
        switch (issue) {
          case 'LOW_MARGIN_SHOPIFY_COST':
            report += `  - The Shopify cost ($${r.shopifyCost?.toFixed(2)}) relative to retail ($${r.retailPrice.toFixed(2)}) yields only ${r.marginFromShopifyCost?.toFixed(1)}% margin. Need to either raise retail price or verify cost is correct.\n`;
            break;
          case 'LOW_MARGIN_EXPECTED_COST':
            report += `  - Even using the pricing engine expected cost ($${r.expectedShopifyCost?.toFixed(2)}), margin is only ${r.marginFromExpectedCost?.toFixed(1)}%. The retail price may need to increase.\n`;
            break;
          case 'COST_MISMATCH':
            report += `  - Shopify cost ($${r.shopifyCost?.toFixed(2)}) doesn't match expected ($${r.expectedShopifyCost?.toFixed(2)}). The pricing engine tier may not have been applied correctly.\n`;
            break;
          case 'NO_SHOPIFY_COST':
            report += `  - No cost is set in Shopify. Cannot track true profitability.\n`;
            break;
          case 'NO_SUPPLIER_MATCH':
            report += `  - SKU "${r.sku}" not found in YHS supplier spreadsheet. Cost needs manual verification.\n`;
            break;
        }
      }

      // Recommendation
      if (r.marginFromShopifyCost !== null && r.marginFromShopifyCost < 30) {
        const neededRetail = r.shopifyCost / 0.7; // 30% margin target
        report += `- **Recommendation:** To achieve 30% margin at current cost ($${r.shopifyCost.toFixed(2)}), retail should be at least **$${neededRetail.toFixed(2)}** (currently $${r.retailPrice.toFixed(2)})\n`;
      }

      report += `\n`;
    }
  }

  report += `---\n\n`;

  // Section 2: Cost mismatches
  report += `## Cost Mismatches (Shopify vs Pricing Engine)\n\n`;
  report += `These products have a Shopify cost that differs from the expected cost by more than $1.00.\n\n`;

  if (costMismatches.length === 0) {
    report += `*No significant cost mismatches found.*\n\n`;
  } else {
    report += `| Product | SKU | Shopify Cost | Expected Cost | Difference | WYN Landed |\n`;
    report += `|---------|-----|-------------|---------------|------------|------------|\n`;
    for (const r of costMismatches) {
      const diff = r.shopifyCost - r.expectedShopifyCost;
      report += `| ${r.productTitle.substring(0, 45)} | ${r.sku} | $${r.shopifyCost.toFixed(2)} | $${r.expectedShopifyCost.toFixed(2)} | ${diff > 0 ? '+' : ''}$${diff.toFixed(2)} | $${r.wynLandedCost?.toFixed(2) || 'N/A'} |\n`;
    }
    report += `\n`;
  }

  report += `---\n\n`;

  // Section 3: Missing cost
  report += `## Missing Shopify Cost Field\n\n`;
  report += `These products have no cost set in Shopify. Profitability cannot be tracked.\n\n`;

  if (noCostSet.length === 0) {
    report += `*All products have costs set in Shopify.*\n\n`;
  } else {
    report += `| Product | SKU | Retail Price | WYN Landed | Expected Cost |\n`;
    report += `|---------|-----|-------------|------------|---------------|\n`;
    for (const r of noCostSet) {
      report += `| ${r.productTitle.substring(0, 45)} | ${r.sku} | $${r.retailPrice.toFixed(2)} | ${r.wynLandedCost ? '$' + r.wynLandedCost.toFixed(2) : 'N/A'} | ${r.expectedShopifyCost ? '$' + r.expectedShopifyCost.toFixed(2) : 'N/A'} |\n`;
    }
    report += `\n`;
  }

  report += `---\n\n`;

  // Section 4: No supplier match
  report += `## Products Not Found in Supplier Spreadsheet\n\n`;
  report += `These SKUs exist in Shopify but have no matching entry in yhs_supply_products.xlsx.\n\n`;

  if (noSupplierMatch.length === 0) {
    report += `*All Shopify products matched to supplier spreadsheet.*\n\n`;
  } else {
    report += `| Product | SKU | Retail Price | Shopify Cost | Margin |\n`;
    report += `|---------|-----|-------------|-------------|--------|\n`;
    for (const r of noSupplierMatch) {
      report += `| ${r.productTitle.substring(0, 45)} | ${r.sku} | $${r.retailPrice.toFixed(2)} | ${r.shopifyCost !== null ? '$' + r.shopifyCost.toFixed(2) : 'NOT SET'} | ${r.marginFromShopifyCost !== null ? r.marginFromShopifyCost.toFixed(1) + '%' : 'N/A'} |\n`;
    }
    report += `\n`;
  }

  report += `---\n\n`;

  // Section 5: Healthy products summary
  report += `## Healthy Products (Margin >= 30%)\n\n`;
  report += `${healthyProducts.length} variants are at or above the 30% margin target.\n\n`;

  if (healthyProducts.length > 0) {
    report += `| Product | SKU | Retail | Cost | Margin |\n`;
    report += `|---------|-----|--------|------|--------|\n`;
    for (const r of healthyProducts.sort((a, b) => (a.marginFromShopifyCost ?? 0) - (b.marginFromShopifyCost ?? 0))) {
      report += `| ${r.productTitle.substring(0, 45)} | ${r.sku} | $${r.retailPrice.toFixed(2)} | ${r.shopifyCost !== null ? '$' + r.shopifyCost.toFixed(2) : 'N/A'} | ${r.marginFromShopifyCost !== null ? r.marginFromShopifyCost.toFixed(1) + '%' : 'N/A'} |\n`;
    }
    report += `\n`;
  }

  report += `---\n\n`;
  report += `## Next Steps\n\n`;
  report += `1. **Low Margin Products:** Review each product's retail price and cost. Either raise the price or verify the cost is correct with the supplier.\n`;
  report += `2. **Cost Mismatches:** Run \`npm run costs:execute\` to sync Shopify costs with the supplier spreadsheet, or manually correct individual items.\n`;
  report += `3. **Missing Costs:** Set the cost field in Shopify for accurate profit tracking. Use \`npm run costs:execute\` to bulk-set from the spreadsheet.\n`;
  report += `4. **No Supplier Match:** Verify these products' SKUs against the supplier. They may need manual cost entry.\n\n`;

  report += `---\n`;
  report += `*Report generated by margin-audit.js on ${now}*\n`;

  // Save report
  const reportPath = `MARGIN_AUDIT_REPORT_${now}.md`;
  writeFileSync(reportPath, report);
  console.log(`\n✓ Report saved to: ${reportPath}`);

  // Also save raw JSON data
  const jsonPath = `margin_audit_data_${now}.json`;
  writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`✓ Raw data saved to: ${jsonPath}`);

  // Print summary to console
  console.log('\n' + '═'.repeat(70));
  console.log('  AUDIT SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  Total variants:        ${results.length}`);
  console.log(`  Healthy (>= 30%):      ${healthyProducts.length}`);
  console.log(`  LOW MARGIN (< 30%):    ${lowMarginProducts.length}`);
  console.log(`  Missing cost:          ${noCostSet.length}`);
  console.log(`  Cost mismatch:         ${costMismatches.length}`);
  console.log(`  No supplier match:     ${noSupplierMatch.length}`);
  console.log('═'.repeat(70) + '\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
