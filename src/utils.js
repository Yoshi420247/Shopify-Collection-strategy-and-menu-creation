/**
 * Shared utilities for Shopify automation scripts
 *
 * Consolidates common functions that were duplicated across multiple scripts:
 * - ANSI color output helpers
 * - curl-based HTTP request wrapper
 * - Sleep/rate-limiting
 * - Paginated product fetching
 */

import 'dotenv/config';
import { execSync } from 'child_process';

// Environment config
export const STORE_URL = process.env.SHOPIFY_STORE_URL;
export const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
export const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
export const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

// ANSI colors for console output
export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

export function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

export function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'bright');
  console.log('='.repeat(70));
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make an HTTP request via curl
 * @param {string} url - Full URL to request
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
 * @param {object|null} body - Request body (will be JSON-stringified)
 * @returns {object|null} Parsed JSON response, or null on error
 */
export function curlRequest(url, method = 'GET', body = null) {
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
 * Fetch all products from a vendor with pagination (using since_id)
 * @param {string} vendor - Vendor name to filter by
 * @returns {Array} All products from that vendor
 */
export async function getAllProducts(vendor) {
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
