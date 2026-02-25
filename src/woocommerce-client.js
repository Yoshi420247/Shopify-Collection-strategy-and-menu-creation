// WooCommerce REST API client for wholesaler product/stock data
// Uses the WooCommerce REST API v3 with consumer key/secret authentication
import 'dotenv/config';

const WC_BASE_URL = process.env.WC_STORE_URL;
const WC_CONSUMER_KEY = process.env.WC_CONSUMER_KEY;
const WC_CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET;

const MIN_REQUEST_INTERVAL = 300; // ms between requests

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function validateConfig() {
  const missing = [];
  if (!WC_BASE_URL) missing.push('WC_STORE_URL');
  if (!WC_CONSUMER_KEY) missing.push('WC_CONSUMER_KEY');
  if (!WC_CONSUMER_SECRET) missing.push('WC_CONSUMER_SECRET');
  if (missing.length > 0) {
    throw new Error(
      `Missing WooCommerce config: ${missing.join(', ')}\n` +
      `Set these in your .env file. The wholesaler generates API keys at:\n` +
      `  WordPress Admin → WooCommerce → Settings → Advanced → REST API`
    );
  }
}

// Build the WooCommerce API URL with authentication params
function buildUrl(endpoint, params = {}) {
  const url = new URL(`/wp-json/wc/v3/${endpoint}`, WC_BASE_URL);
  url.searchParams.set('consumer_key', WC_CONSUMER_KEY);
  url.searchParams.set('consumer_secret', WC_CONSUMER_SECRET);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

let lastRequestTime = 0;

async function wcRequest(endpoint, params = {}, retries = 3) {
  validateConfig();

  const now = Date.now();
  const timeSince = now - lastRequestTime;
  if (timeSince < MIN_REQUEST_INTERVAL) {
    await sleep(MIN_REQUEST_INTERVAL - timeSince);
  }
  lastRequestTime = Date.now();

  const url = buildUrl(endpoint, params);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`WooCommerce API ${response.status}: ${text.substring(0, 300)}`);
      }

      const data = await response.json();

      // Return data along with pagination headers
      const totalProducts = parseInt(response.headers.get('x-wp-total') || '0', 10);
      const totalPages = parseInt(response.headers.get('x-wp-totalpages') || '1', 10);

      return { data, totalProducts, totalPages };
    } catch (error) {
      if (attempt < retries) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`  WC API retry ${attempt}/${retries} after ${waitTime / 1000}s...`);
        await sleep(waitTime);
      } else {
        throw error;
      }
    }
  }
}

// Fetch all products from WooCommerce with stock data (handles pagination)
export async function getAllWcProducts() {
  validateConfig();
  const allProducts = [];
  let page = 1;
  let totalPages = 1;

  console.log('Fetching all products from WooCommerce...');

  while (page <= totalPages) {
    const result = await wcRequest('products', {
      per_page: 100,
      page: page.toString(),
      orderby: 'id',
      order: 'asc',
    });

    totalPages = result.totalPages;
    const batch = result.data;

    if (!batch || batch.length === 0) break;

    allProducts.push(...batch);
    console.log(`  Page ${page}/${totalPages}: fetched ${batch.length} (total: ${allProducts.length})`);
    page++;
  }

  console.log(`Fetched ${allProducts.length} total WooCommerce products.`);
  return allProducts;
}

// Fetch a single product by ID
export async function getWcProduct(productId) {
  const result = await wcRequest(`products/${productId}`);
  return result.data;
}

// Extract the relevant stock info from a WooCommerce product
export function extractStockInfo(wcProduct) {
  return {
    id: wcProduct.id,
    name: wcProduct.name,
    sku: wcProduct.sku || '',
    status: wcProduct.status, // 'publish', 'draft', 'pending', 'private'
    stock_status: wcProduct.stock_status, // 'instock', 'outofstock', 'onbackorder'
    stock_quantity: wcProduct.stock_quantity ?? null,
    manage_stock: wcProduct.manage_stock,
    price: wcProduct.price,
    permalink: wcProduct.permalink,
    images: (wcProduct.images || []).map(img => img.src),
  };
}

// Fetch only products that have stock management enabled (most useful for sync)
export async function getStockManagedProducts() {
  const allProducts = await getAllWcProducts();
  return allProducts.map(extractStockInfo);
}

// Quick stock check for specific product IDs (for targeted polling)
export async function checkStockLevels(productIds) {
  const results = [];
  for (const id of productIds) {
    try {
      const product = await getWcProduct(id);
      results.push(extractStockInfo(product));
    } catch (error) {
      console.error(`  Failed to check stock for WC product ${id}: ${error.message}`);
      results.push({ id, error: error.message });
    }
  }
  return results;
}

export default {
  getAllWcProducts,
  getWcProduct,
  extractStockInfo,
  getStockManagedProducts,
  checkStockLevels,
};
