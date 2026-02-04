#!/usr/bin/env node
/**
 * Fix Ash Catcher Tags
 *
 * Removes the incorrect 'family:glass-bong' tag from ash catcher products.
 * Ash catchers should only have 'family:ash-catcher', not 'family:glass-bong'.
 *
 * Usage:
 *   node src/fix-ash-catcher-tags.js          # Dry run
 *   node src/fix-ash-catcher-tags.js --execute # Apply changes
 */

import 'dotenv/config';
import { execSync } from 'child_process';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

function log(msg, color = '') {
  const colors = {
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
  };
  console.log(`${colors[color] || ''}${msg}${colors.reset}`);
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

async function updateProductTags(productId, newTags) {
  return curlRequest(
    `${BASE_URL}/products/${productId}.json`,
    'PUT',
    {
      product: {
        id: productId,
        tags: newTags,
      },
    }
  );
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('\n' + '═'.repeat(70));
  log('  FIX ASH CATCHER TAGS', 'cyan');
  log(`  Store: ${STORE_URL}`, 'cyan');
  log(`  Mode: ${dryRun ? 'DRY RUN' : 'EXECUTING CHANGES'}`, dryRun ? 'yellow' : 'green');
  console.log('═'.repeat(70));

  // Get all What You Need products
  console.log('\nFetching all "What You Need" products...');
  const products = await getAllProducts('What You Need');
  log(`Found ${products.length} total products`, 'cyan');

  // Find ash catchers with incorrect glass-bong tag
  const mistagged = products.filter(p => {
    const tags = p.tags || '';
    return tags.includes('family:ash-catcher') && tags.includes('family:glass-bong');
  });

  console.log('\n' + '='.repeat(70));
  log(`Found ${mistagged.length} ash catchers with incorrect 'family:glass-bong' tag:`, 'yellow');
  console.log('='.repeat(70));

  if (mistagged.length === 0) {
    log('\nNo products need fixing!', 'green');
    return;
  }

  let fixed = 0;
  let errors = 0;

  for (let i = 0; i < mistagged.length; i++) {
    const p = mistagged[i];
    const oldTags = p.tags;

    // Remove family:glass-bong from tags
    const newTags = oldTags
      .split(', ')
      .filter(tag => tag !== 'family:glass-bong')
      .join(', ');

    console.log(`\n[${i + 1}/${mistagged.length}] ${p.title}`);
    console.log(`  ID: ${p.id}`);
    console.log(`  Removing: family:glass-bong`);

    if (!dryRun) {
      const result = await updateProductTags(p.id, newTags);

      if (result && result.product) {
        log(`  ✓ Fixed`, 'green');
        fixed++;
      } else {
        log(`  ✗ Failed`, 'red');
        errors++;
      }

      await sleep(550);
    } else {
      log(`  → Would fix (dry run)`, 'yellow');
      fixed++;
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  log('SUMMARY', 'cyan');
  console.log('═'.repeat(70));
  log(`Ash catchers found with wrong tag: ${mistagged.length}`, 'yellow');
  log(`Fixed: ${fixed}`, 'green');
  if (errors > 0) log(`Errors: ${errors}`, 'red');

  if (dryRun) {
    console.log('\nThis was a DRY RUN. Run with --execute to apply changes.');
  }
}

main().catch(err => {
  log(`\nFatal error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
