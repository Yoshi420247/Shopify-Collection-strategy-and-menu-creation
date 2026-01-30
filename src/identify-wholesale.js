#!/usr/bin/env node
/**
 * Identify Wholesale Products
 *
 * Scans all products from "What You Need" vendor and identifies those
 * that are sold in wholesale/multipack quantities.
 *
 * Wholesale indicators:
 * - Quantity >= 6 in title (e.g., "12-Pack", "40CT", "6PC")
 * - Display/jar/case products
 * - Bulk/wholesale keywords
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import fs from 'fs';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const REST_URL = `https://${STORE_URL}/admin/api/2024-01`;

function sleep(ms) {
  execSync(`sleep ${ms / 1000}`);
}

function fetchWithRetry(url, retries = 4) {
  const cmd = `curl -s --max-time 120 "${url}" -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}"`;

  for (let i = 0; i < retries; i++) {
    try {
      const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
      if (result && result.trim() && !result.includes('upstream connect error') && !result.includes('403 Forbidden')) {
        return JSON.parse(result);
      }
    } catch (e) {
      console.log(`  Retry ${i + 1}/${retries}...`);
    }
    sleep(Math.pow(2, i + 1) * 1000);
  }
  return null;
}

async function fetchAllProducts() {
  console.log('Fetching all products from "What You Need" vendor...\n');

  const allProducts = [];
  let sinceId = 0;
  let page = 1;

  while (true) {
    const url = `${REST_URL}/products.json?vendor=What+You+Need&limit=250&since_id=${sinceId}`;
    console.log(`  Page ${page}: fetching...`);

    const data = fetchWithRetry(url);
    if (!data || !data.products || data.products.length === 0) {
      break;
    }

    allProducts.push(...data.products);
    console.log(`  Page ${page}: got ${data.products.length} products (total: ${allProducts.length})`);

    if (data.products.length < 250) {
      break;
    }

    sinceId = data.products[data.products.length - 1].id;
    page++;
    sleep(1000);
  }

  console.log(`\nTotal products fetched: ${allProducts.length}`);
  return allProducts;
}

function analyzeProducts(products) {
  console.log('\nAnalyzing products for wholesale indicators...\n');

  // Patterns to detect wholesale quantities
  const quantityPatterns = [
    { regex: /\b(\d+)\s*[-–]?\s*(pack|pk)\b/i, type: 'pack' },
    { regex: /\b(\d+)\s*[-–]?\s*(pc|pcs|piece|pieces)\b/i, type: 'pieces' },
    { regex: /\b(\d+)\s*[-–]?\s*(ct|count)\b/i, type: 'count' },
    { regex: /\b(\d+)\s*[-–]?\s*(jar|box|case)\b/i, type: 'container' },
    { regex: /display\s*[-–]?\s*(\d+)/i, type: 'display' },
    { regex: /(\d+)\s*[-–]?\s*display/i, type: 'display' },
    { regex: /case\s+of\s+(\d+)/i, type: 'case' },
  ];

  const wholesaleProducts = [];
  const nonWholesaleProducts = [];

  for (const product of products) {
    const title = product.title || '';
    let isWholesale = false;
    let reason = '';
    let quantity = null;

    // Check for quantity patterns
    for (const { regex, type } of quantityPatterns) {
      const match = title.match(regex);
      if (match) {
        const qty = parseInt(match[1], 10);
        if (qty >= 6) {
          isWholesale = true;
          quantity = qty;
          reason = `${qty} ${type}`;
          break;
        }
      }
    }

    // Check for display keyword without explicit quantity (often wholesale)
    if (!isWholesale && /display\b/i.test(title)) {
      isWholesale = true;
      reason = 'display product';
    }

    // Check for wholesale keywords
    if (!isWholesale) {
      const wholesaleKeywords = ['wholesale', 'bulk pack', 'case lot', 'assorted lot'];
      for (const kw of wholesaleKeywords) {
        if (title.toLowerCase().includes(kw)) {
          isWholesale = true;
          reason = `keyword: ${kw}`;
          break;
        }
      }
    }

    if (isWholesale) {
      wholesaleProducts.push({
        id: product.id,
        title: product.title,
        handle: product.handle,
        quantity,
        reason,
        tags: product.tags,
        hasWholesaleTag: (product.tags || '').toLowerCase().includes('wholesale'),
      });
    } else {
      nonWholesaleProducts.push({
        id: product.id,
        title: product.title,
        handle: product.handle,
      });
    }
  }

  return { wholesaleProducts, nonWholesaleProducts };
}

async function main() {
  console.log('='.repeat(70));
  console.log('IDENTIFY WHOLESALE PRODUCTS');
  console.log('='.repeat(70));

  // Fetch all products
  const products = await fetchAllProducts();

  if (products.length === 0) {
    console.log('No products found!');
    return;
  }

  // Analyze products
  const { wholesaleProducts, nonWholesaleProducts } = analyzeProducts(products);

  // Display results
  console.log('='.repeat(70));
  console.log(`WHOLESALE PRODUCTS IDENTIFIED: ${wholesaleProducts.length}`);
  console.log('='.repeat(70));

  // Sort by quantity (highest first)
  wholesaleProducts.sort((a, b) => (b.quantity || 0) - (a.quantity || 0));

  for (let i = 0; i < wholesaleProducts.length; i++) {
    const p = wholesaleProducts[i];
    const alreadyTagged = p.hasWholesaleTag ? ' [ALREADY TAGGED]' : '';
    console.log(`\n${i + 1}. ${p.title}`);
    console.log(`   Reason: ${p.reason}${alreadyTagged}`);
    console.log(`   ID: ${p.id}`);
  }

  // Save results
  const results = {
    totalProducts: products.length,
    wholesaleCount: wholesaleProducts.length,
    nonWholesaleCount: nonWholesaleProducts.length,
    wholesaleProducts,
    nonWholesaleProducts: nonWholesaleProducts.slice(0, 50), // Sample of non-wholesale
  };

  fs.writeFileSync('/tmp/wholesale_analysis.json', JSON.stringify(results, null, 2));

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total products analyzed: ${products.length}`);
  console.log(`Wholesale products found: ${wholesaleProducts.length}`);
  console.log(`Non-wholesale products: ${nonWholesaleProducts.length}`);
  console.log(`\nResults saved to /tmp/wholesale_analysis.json`);

  // Count already tagged
  const alreadyTagged = wholesaleProducts.filter(p => p.hasWholesaleTag).length;
  if (alreadyTagged > 0) {
    console.log(`Already have wholesale tag: ${alreadyTagged}`);
  }

  console.log(`\nProducts to tag with "Wholesale Quantity": ${wholesaleProducts.length - alreadyTagged}`);
}

main();
