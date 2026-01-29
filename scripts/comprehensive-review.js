#!/usr/bin/env node
/**
 * Comprehensive Website Review Script
 *
 * This script performs a thorough review of the Shopify store:
 * - Product coverage across vendors
 * - Collection health and product counts
 * - Tag completeness
 * - Product type accuracy
 * - Identifies any remaining issues
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';
import { config } from '../src/config.js';

async function getAllProducts() {
  console.log('Fetching all products...');
  const products = [];
  let cursor = null;
  let hasNextPage = true;

  const query = `
    query($cursor: String) {
      products(first: 250, after: $cursor) {
        pageInfo { hasNextPage, endCursor }
        edges {
          node {
            id
            title
            handle
            vendor
            productType
            tags
            status
            totalInventory
            priceRangeV2 {
              minVariantPrice { amount }
            }
          }
        }
      }
    }
  `;

  while (hasNextPage) {
    const result = await api.graphqlQuery(query, { cursor });
    if (result.data && result.data.products) {
      const batch = result.data.products.edges.map(e => e.node);
      products.push(...batch);
      hasNextPage = result.data.products.pageInfo.hasNextPage;
      cursor = result.data.products.pageInfo.endCursor;
    } else {
      hasNextPage = false;
    }
  }

  return products;
}

async function getAllCollections() {
  console.log('Fetching all collections...');
  const [smart, custom] = await Promise.all([
    api.getCollections('smart'),
    api.getCollections('custom')
  ]);

  return [
    ...(smart.smart_collections || []).map(c => ({ ...c, type: 'smart' })),
    ...(custom.custom_collections || []).map(c => ({ ...c, type: 'custom' }))
  ];
}

function analyzeProducts(products) {
  const stats = {
    total: products.length,
    byVendor: {},
    byStatus: {},
    byProductType: {},
    withFamilyTag: 0,
    withPillarTag: 0,
    withUseTag: 0,
    withMaterialTag: 0,
    missingTags: [],
    noProductType: [],
    badProductType: [],
    zeroInventory: 0,
    zeroPrice: 0
  };

  for (const product of products) {
    // By vendor
    const vendor = product.vendor || 'Unknown';
    stats.byVendor[vendor] = (stats.byVendor[vendor] || 0) + 1;

    // By status
    const status = product.status || 'UNKNOWN';
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

    // By product type
    const productType = product.productType || 'NONE';
    stats.byProductType[productType] = (stats.byProductType[productType] || 0) + 1;

    // Tags analysis
    const tags = Array.isArray(product.tags) ? product.tags : (product.tags || '').split(',');
    const tagStr = tags.join(' ').toLowerCase();

    if (tagStr.includes('family:')) stats.withFamilyTag++;
    if (tagStr.includes('pillar:')) stats.withPillarTag++;
    if (tagStr.includes('use:')) stats.withUseTag++;
    if (tagStr.includes('material:')) stats.withMaterialTag++;

    // Missing tags
    if (!tagStr.includes('family:')) {
      stats.missingTags.push({
        title: product.title,
        vendor: product.vendor,
        missing: 'family'
      });
    }

    // Product type issues
    if (!product.productType) {
      stats.noProductType.push({
        title: product.title,
        vendor: product.vendor
      });
    } else if (['What You Need', 'Cloud YHS', 'Oil Slick', 'YHS'].includes(product.productType)) {
      stats.badProductType.push({
        title: product.title,
        vendor: product.vendor,
        type: product.productType
      });
    }

    // Inventory and price
    if (product.totalInventory === 0) stats.zeroInventory++;
    const price = parseFloat(product.priceRangeV2?.minVariantPrice?.amount || 0);
    if (price === 0) stats.zeroPrice++;
  }

  return stats;
}

function analyzeCollections(collections) {
  const stats = {
    total: collections.length,
    smart: collections.filter(c => c.type === 'smart').length,
    custom: collections.filter(c => c.type === 'custom').length,
    empty: [],
    withVendorRule: [],
    byHandle: {}
  };

  for (const collection of collections) {
    stats.byHandle[collection.handle] = {
      title: collection.title,
      type: collection.type,
      productCount: collection.products_count || 0
    };

    if ((collection.products_count || 0) === 0) {
      stats.empty.push({
        handle: collection.handle,
        title: collection.title
      });
    }

    // Check for vendor rules (smart collections only)
    if (collection.rules) {
      const hasVendor = collection.rules.some(r => r.column === 'vendor');
      if (hasVendor) {
        stats.withVendorRule.push({
          handle: collection.handle,
          title: collection.title
        });
      }
    }
  }

  return stats;
}

async function main() {
  console.log('='.repeat(70));
  console.log('COMPREHENSIVE WEBSITE REVIEW');
  console.log('='.repeat(70));
  console.log(`Store: ${config.shopify.storeUrl}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('');

  // Fetch data
  const [products, collections] = await Promise.all([
    getAllProducts(),
    getAllCollections()
  ]);

  // Analyze
  const productStats = analyzeProducts(products);
  const collectionStats = analyzeCollections(collections);

  // REPORT
  console.log('\n' + '='.repeat(70));
  console.log('PRODUCT ANALYSIS');
  console.log('='.repeat(70));

  console.log(`\nTotal Products: ${productStats.total}`);

  console.log('\nBy Vendor:');
  for (const [vendor, count] of Object.entries(productStats.byVendor).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / productStats.total) * 100).toFixed(1);
    console.log(`  ${vendor.padEnd(25)} ${count.toString().padStart(4)} (${pct}%)`);
  }

  console.log('\nBy Status:');
  for (const [status, count] of Object.entries(productStats.byStatus)) {
    console.log(`  ${status.padEnd(15)} ${count}`);
  }

  console.log('\nTag Coverage:');
  console.log(`  With family: tag    ${productStats.withFamilyTag}/${productStats.total} (${((productStats.withFamilyTag/productStats.total)*100).toFixed(1)}%)`);
  console.log(`  With pillar: tag    ${productStats.withPillarTag}/${productStats.total} (${((productStats.withPillarTag/productStats.total)*100).toFixed(1)}%)`);
  console.log(`  With use: tag       ${productStats.withUseTag}/${productStats.total} (${((productStats.withUseTag/productStats.total)*100).toFixed(1)}%)`);
  console.log(`  With material: tag  ${productStats.withMaterialTag}/${productStats.total} (${((productStats.withMaterialTag/productStats.total)*100).toFixed(1)}%)`);

  console.log('\nProduct Types (Top 15):');
  const sortedTypes = Object.entries(productStats.byProductType).sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedTypes.slice(0, 15)) {
    console.log(`  ${(type || 'NONE').padEnd(25)} ${count}`);
  }

  console.log('\nInventory/Pricing:');
  console.log(`  Zero inventory: ${productStats.zeroInventory}`);
  console.log(`  Zero price: ${productStats.zeroPrice}`);

  // ISSUES
  console.log('\n' + '='.repeat(70));
  console.log('ISSUES FOUND');
  console.log('='.repeat(70));

  if (productStats.missingTags.length > 0) {
    console.log(`\n[WARNING] Products missing family: tag (${productStats.missingTags.length}):`);
    for (const p of productStats.missingTags.slice(0, 10)) {
      console.log(`  - [${p.vendor}] ${p.title}`);
    }
    if (productStats.missingTags.length > 10) {
      console.log(`  ... and ${productStats.missingTags.length - 10} more`);
    }
  } else {
    console.log('\n[OK] All products have family: tags');
  }

  if (productStats.noProductType.length > 0) {
    console.log(`\n[WARNING] Products with no product type (${productStats.noProductType.length}):`);
    for (const p of productStats.noProductType.slice(0, 10)) {
      console.log(`  - [${p.vendor}] ${p.title}`);
    }
    if (productStats.noProductType.length > 10) {
      console.log(`  ... and ${productStats.noProductType.length - 10} more`);
    }
  } else {
    console.log('\n[OK] All products have product types');
  }

  if (productStats.badProductType.length > 0) {
    console.log(`\n[WARNING] Products with vendor as product type (${productStats.badProductType.length}):`);
    for (const p of productStats.badProductType.slice(0, 10)) {
      console.log(`  - [${p.vendor}] ${p.title} (type: ${p.type})`);
    }
    if (productStats.badProductType.length > 10) {
      console.log(`  ... and ${productStats.badProductType.length - 10} more`);
    }
  } else {
    console.log('\n[OK] No products have vendor as product type');
  }

  // COLLECTION ANALYSIS
  console.log('\n' + '='.repeat(70));
  console.log('COLLECTION ANALYSIS');
  console.log('='.repeat(70));

  console.log(`\nTotal Collections: ${collectionStats.total}`);
  console.log(`  Smart: ${collectionStats.smart}`);
  console.log(`  Custom: ${collectionStats.custom}`);

  if (collectionStats.withVendorRule.length > 0) {
    console.log(`\n[WARNING] Collections still with vendor filter (${collectionStats.withVendorRule.length}):`);
    for (const c of collectionStats.withVendorRule) {
      console.log(`  - ${c.title} (${c.handle})`);
    }
  } else {
    console.log('\n[OK] No collections have vendor restrictions');
  }

  if (collectionStats.empty.length > 0) {
    console.log(`\n[INFO] Empty collections (${collectionStats.empty.length}):`);
    for (const c of collectionStats.empty.slice(0, 15)) {
      console.log(`  - ${c.title} (${c.handle})`);
    }
    if (collectionStats.empty.length > 15) {
      console.log(`  ... and ${collectionStats.empty.length - 15} more`);
    }
  }

  // KEY COLLECTIONS CHECK
  console.log('\n' + '='.repeat(70));
  console.log('KEY COLLECTION STATUS');
  console.log('='.repeat(70));

  const keyCollections = [
    'bongs', 'dab-rigs', 'hand-pipes', 'bubblers', 'nectar-collectors',
    'quartz-bangers', 'carb-caps', 'dab-tools', 'flower-bowls', 'torches',
    'grinders', 'rolling-papers', 'silicone-rigs-bongs', 'accessories',
    'extraction-packaging', 'silicone-pads', 'mylar-bags', 'glass-jars'
  ];

  console.log('\nCollection              Products');
  console.log('-'.repeat(40));
  for (const handle of keyCollections) {
    const col = collectionStats.byHandle[handle];
    if (col) {
      console.log(`${handle.padEnd(24)} ${(col.productCount || 0).toString().padStart(4)}`);
    } else {
      console.log(`${handle.padEnd(24)} [NOT FOUND]`);
    }
  }

  // SUMMARY
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  const issues = [];
  if (productStats.missingTags.length > 0) issues.push(`${productStats.missingTags.length} products missing family tags`);
  if (productStats.noProductType.length > 0) issues.push(`${productStats.noProductType.length} products missing product type`);
  if (productStats.badProductType.length > 0) issues.push(`${productStats.badProductType.length} products with vendor as type`);
  if (collectionStats.withVendorRule.length > 0) issues.push(`${collectionStats.withVendorRule.length} collections with vendor filter`);

  if (issues.length === 0) {
    console.log('\n[SUCCESS] No critical issues found!');
    console.log('');
    console.log('Summary:');
    console.log(`  - ${productStats.total} products across ${Object.keys(productStats.byVendor).length} vendors`);
    console.log(`  - ${collectionStats.total} collections`);
    console.log(`  - ${((productStats.withFamilyTag/productStats.total)*100).toFixed(1)}% tag coverage`);
  } else {
    console.log('\n[ATTENTION] Issues to address:');
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('REVIEW COMPLETE');
  console.log('='.repeat(70));
}

main().catch(console.error);
