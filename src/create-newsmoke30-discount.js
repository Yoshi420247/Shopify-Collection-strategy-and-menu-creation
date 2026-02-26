#!/usr/bin/env node
// ============================================================================
// Create NEWSMOKE30 Discount Code
// 30% off all products with vendor "What You Need"
//
// Strategy:
//   1. Find or create a smart collection for vendor "What You Need"
//   2. Create a price rule for 30% off that collection
//   3. Create discount code "NEWSMOKE30" linked to the price rule
// ============================================================================

import 'dotenv/config';
import { execSync } from 'child_process';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

const DISCOUNT_CODE = 'NEWSMOKE30';
const DISCOUNT_PERCENT = -30;
const VENDOR = 'What You Need';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function curlRequest(endpoint, method = 'GET', body = null) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}/${endpoint}`;
  const args = [
    'curl', '-s', '-X', method,
    '-H', `"X-Shopify-Access-Token: ${ACCESS_TOKEN}"`,
    '-H', '"Content-Type: application/json"',
  ];
  if (body) {
    // Escape for shell
    const jsonStr = JSON.stringify(body).replace(/'/g, "'\\''");
    args.push('-d', `'${jsonStr}'`);
  }
  args.push(`"${url}"`);

  const cmd = args.join(' ');
  const result = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
  if (!result || result.trim() === '') return {};
  return JSON.parse(result);
}

// Step 1: Find or create a smart collection for "What You Need" vendor
function findOrCreateVendorCollection() {
  console.log('\n--- Step 1: Find/Create "What You Need" vendor collection ---');

  const data = curlRequest('smart_collections.json?limit=250');
  const collections = data.smart_collections || [];

  const existing = collections.find(c =>
    c.rules && c.rules.some(r => r.column === 'vendor' && r.condition === VENDOR)
  );

  if (existing) {
    console.log(`  Found existing collection: "${existing.title}" (ID: ${existing.id})`);
    return existing.id;
  }

  console.log('  No existing vendor collection found. Creating one...');
  const result = curlRequest('smart_collections.json', 'POST', {
    smart_collection: {
      title: 'What You Need - All Products',
      rules: [
        {
          column: 'vendor',
          relation: 'equals',
          condition: VENDOR,
        },
      ],
      published: false,
    },
  });

  const newCollection = result.smart_collection;
  console.log(`  Created collection: "${newCollection.title}" (ID: ${newCollection.id})`);
  return newCollection.id;
}

// Step 2: Check if discount code already exists
function checkExistingDiscount() {
  console.log('\n--- Step 2: Check for existing NEWSMOKE30 discount ---');

  const data = curlRequest('price_rules.json?limit=250');
  const rules = data.price_rules || [];

  for (const rule of rules) {
    const codesData = curlRequest(`price_rules/${rule.id}/discount_codes.json`);
    const codes = codesData.discount_codes || [];
    const match = codes.find(c => c.code.toUpperCase() === DISCOUNT_CODE);
    if (match) {
      console.log(`  Discount code "${DISCOUNT_CODE}" already exists (Price Rule ID: ${rule.id})`);
      return { priceRuleId: rule.id, codeId: match.id };
    }
  }

  console.log(`  No existing "${DISCOUNT_CODE}" discount found.`);
  return null;
}

// Step 3: Create price rule + discount code
function createDiscount(collectionId) {
  console.log('\n--- Step 3: Create price rule and discount code ---');

  console.log('  Creating price rule...');
  const priceRuleResult = curlRequest('price_rules.json', 'POST', {
    price_rule: {
      title: `${DISCOUNT_CODE} - 30% Off What You Need Products`,
      target_type: 'line_item',
      target_selection: 'entitled',
      allocation_method: 'each',
      value_type: 'percentage',
      value: String(DISCOUNT_PERCENT),
      customer_selection: 'all',
      entitled_collection_ids: [collectionId],
      starts_at: new Date().toISOString(),
      usage_limit: null,
      once_per_customer: false,
    },
  });

  const priceRule = priceRuleResult.price_rule;
  console.log(`  Price rule created (ID: ${priceRule.id})`);

  console.log(`  Creating discount code "${DISCOUNT_CODE}"...`);
  const codeResult = curlRequest(
    `price_rules/${priceRule.id}/discount_codes.json`,
    'POST',
    {
      discount_code: {
        code: DISCOUNT_CODE,
      },
    }
  );

  const code = codeResult.discount_code;
  console.log(`  Discount code created: "${code.code}" (ID: ${code.id})`);

  return { priceRuleId: priceRule.id, codeId: code.id };
}

// Main
function main() {
  console.log('===========================================');
  console.log('  Creating NEWSMOKE30 Discount Code');
  console.log(`  Store: ${STORE_URL}`);
  console.log(`  Code: ${DISCOUNT_CODE}`);
  console.log(`  Discount: 30% off all "${VENDOR}" products`);
  console.log('===========================================');

  try {
    const existing = checkExistingDiscount();
    if (existing) {
      console.log('\n  Discount already exists — no action needed.');
      console.log('  Done!');
      return;
    }

    const collectionId = findOrCreateVendorCollection();
    const result = createDiscount(collectionId);

    console.log('\n===========================================');
    console.log('  SUCCESS!');
    console.log(`  Discount Code: ${DISCOUNT_CODE}`);
    console.log(`  Value: 30% off`);
    console.log(`  Applies to: All "${VENDOR}" products`);
    console.log(`  Price Rule ID: ${result.priceRuleId}`);
    console.log(`  Discount Code ID: ${result.codeId}`);
    console.log('===========================================\n');
  } catch (error) {
    console.error('\nFailed to create discount:', error.message);
    process.exit(1);
  }
}

main();
