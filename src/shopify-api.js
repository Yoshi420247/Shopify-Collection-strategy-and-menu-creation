// Shopify API wrapper using child_process for curl (more reliable in some environments)
import { config } from './config.js';
import { execSync } from 'child_process';

if (!config.shopify.storeUrl) {
  throw new Error('SHOPIFY_STORE_URL environment variable is not set. Set it to your store domain (e.g. "my-store.myshopify.com").');
}

const BASE_URL = `https://${config.shopify.storeUrl}/admin/api/${config.shopify.apiVersion}`;
const GRAPHQL_URL = `${BASE_URL}/graphql.json`;

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 550;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rateLimitedRequest(url, method = 'GET', body = null, retries = 3) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await sleep(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();

  // Build curl command
  let curlCmd = `curl -s --max-time 30 -X ${method} "${url}" `;
  curlCmd += `-H "X-Shopify-Access-Token: ${config.shopify.accessToken}" `;
  curlCmd += `-H "Content-Type: application/json" `;

  if (body) {
    // Escape the body for shell
    const escapedBody = JSON.stringify(body).replace(/'/g, "'\\''");
    curlCmd += `-d '${escapedBody}'`;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = execSync(curlCmd, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large responses
      });

      // Check for error responses
      if (result.includes('upstream connect error') || result.includes('error')) {
        const parsed = JSON.parse(result);
        if (parsed.errors) {
          throw new Error(JSON.stringify(parsed.errors));
        }
        return parsed;
      }

      return JSON.parse(result);
    } catch (error) {
      if (attempt < retries) {
        const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
        console.log(`  Retry ${attempt}/${retries} after ${waitTime/1000}s...`);
        await sleep(waitTime);
      } else {
        console.error(`API Error after ${retries} attempts: ${error.message}`);
        throw error;
      }
    }
  }
}

// REST API methods
export async function getProducts(params = {}) {
  const queryParams = new URLSearchParams(params);
  return rateLimitedRequest(`${BASE_URL}/products.json?${queryParams}`);
}

export async function getProduct(productId) {
  return rateLimitedRequest(`${BASE_URL}/products/${productId}.json`);
}

export async function updateProduct(productId, data) {
  return rateLimitedRequest(
    `${BASE_URL}/products/${productId}.json`,
    'PUT',
    { product: data }
  );
}

export async function getCollections(type = 'smart') {
  const endpoint = type === 'smart' ? 'smart_collections' : 'custom_collections';
  return rateLimitedRequest(`${BASE_URL}/${endpoint}.json?limit=250`);
}

export async function createSmartCollection(data) {
  return rateLimitedRequest(
    `${BASE_URL}/smart_collections.json`,
    'POST',
    { smart_collection: data }
  );
}

export async function updateSmartCollection(collectionId, data) {
  return rateLimitedRequest(
    `${BASE_URL}/smart_collections/${collectionId}.json`,
    'PUT',
    { smart_collection: data }
  );
}

export async function deleteSmartCollection(collectionId) {
  return rateLimitedRequest(
    `${BASE_URL}/smart_collections/${collectionId}.json`,
    'DELETE'
  );
}

// Fetch all products from a vendor (handles pagination)
export async function getAllProductsByVendor(vendor) {
  const products = [];
  let lastId = 0;
  let hasMore = true;

  while (hasMore) {
    const params = {
      vendor,
      limit: 250,
    };
    if (lastId > 0) {
      params.since_id = lastId;
    }

    const data = await getProducts(params);
    const batch = data.products || [];

    if (batch.length === 0) {
      hasMore = false;
    } else {
      products.push(...batch);
      lastId = batch[batch.length - 1].id;
      console.log(`  Fetched ${products.length} products...`);

      if (batch.length < 250) {
        hasMore = false;
      }
    }
  }

  return products;
}

// Paginate through a REST endpoint using Shopify's cursor-based Link header.
// This replaces since_id pagination which is unreliable on large stores
// (can return fewer than `limit` records mid-stream, stopping pagination early).
export async function paginateAll(endpoint, resourceKey, params = {}, { pageLimit = Infinity } = {}) {
  const queryParams = new URLSearchParams(params);
  let url = `${BASE_URL}/${endpoint}?${queryParams}`;
  const allRecords = [];
  let page = 0;

  while (url && page < pageLimit) {
    page++;

    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
      await sleep(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
    }
    lastRequestTime = Date.now();

    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'X-Shopify-Access-Token': config.shopify.accessToken,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text.substring(0, 300)}`);
        }

        const data = await response.json();

        if (data.errors) {
          throw new Error(JSON.stringify(data.errors));
        }

        const batch = data[resourceKey] || [];
        if (batch.length === 0) return allRecords;

        allRecords.push(...batch);
        console.log(`  Page ${page}: fetched ${batch.length} (total: ${allRecords.length})`);

        // Follow cursor-based pagination via Link header
        const linkHeader = response.headers.get('link') || '';
        const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
        url = nextMatch ? nextMatch[1] : null;

        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.log(`  Retry ${attempt}/3 after ${waitTime / 1000}s...`);
          await sleep(waitTime);
        }
      }
    }

    if (lastError) {
      console.error(`API Error after 3 attempts: ${lastError.message}`);
      throw lastError;
    }
  }

  return allRecords;
}

// GraphQL API methods
export async function graphqlQuery(query, variables = {}) {
  return rateLimitedRequest(
    GRAPHQL_URL,
    'POST',
    { query, variables }
  );
}

// Get menus via GraphQL
export async function getMenus() {
  const query = `
    query {
      menus(first: 50) {
        edges {
          node {
            id
            title
            handle
            items(first: 50) {
              edges {
                node {
                  id
                  title
                  url
                  type
                  items(first: 20) {
                    edges {
                      node {
                        id
                        title
                        url
                        type
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
  return graphqlQuery(query);
}

// Create menu via GraphQL
export async function createMenu(handle, title, items) {
  const mutation = `
    mutation menuCreate($handle: String!, $title: String!, $items: [MenuItemCreateInput!]!) {
      menuCreate(handle: $handle, title: $title, items: $items) {
        menu {
          id
          handle
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;
  return graphqlQuery(mutation, { handle, title, items });
}

// Generic REST API methods
export async function get(endpoint) {
  return rateLimitedRequest(`${BASE_URL}/${endpoint}`);
}

export async function put(endpoint, data) {
  return rateLimitedRequest(`${BASE_URL}/${endpoint}`, 'PUT', data);
}

export async function post(endpoint, data) {
  return rateLimitedRequest(`${BASE_URL}/${endpoint}`, 'POST', data);
}

// Inventory item methods
export async function getInventoryItem(inventoryItemId) {
  return rateLimitedRequest(`${BASE_URL}/inventory_items/${inventoryItemId}.json`);
}

export async function updateInventoryItem(inventoryItemId, data) {
  return rateLimitedRequest(
    `${BASE_URL}/inventory_items/${inventoryItemId}.json`,
    'PUT',
    { inventory_item: data }
  );
}

// Variant methods
export async function getProductVariants(productId) {
  return rateLimitedRequest(`${BASE_URL}/products/${productId}/variants.json`);
}

export async function createProductVariant(productId, variantData) {
  return rateLimitedRequest(
    `${BASE_URL}/products/${productId}/variants.json`,
    'POST',
    { variant: variantData }
  );
}

export async function updateProductVariant(variantId, variantData) {
  return rateLimitedRequest(
    `${BASE_URL}/variants/${variantId}.json`,
    'PUT',
    { variant: variantData }
  );
}

export async function deleteProductVariant(productId, variantId) {
  return rateLimitedRequest(
    `${BASE_URL}/products/${productId}/variants/${variantId}.json`,
    'DELETE'
  );
}

// Location methods (needed for inventory operations)
export async function getLocations() {
  return rateLimitedRequest(`${BASE_URL}/locations.json`);
}

export async function setInventoryLevel(inventoryItemId, locationId, available) {
  return rateLimitedRequest(
    `${BASE_URL}/inventory_levels/set.json`,
    'POST',
    { location_id: locationId, inventory_item_id: inventoryItemId, available }
  );
}

// Redirect methods
export async function getRedirects(limit = 250) {
  return rateLimitedRequest(`${BASE_URL}/redirects.json?limit=${limit}`);
}

export async function createRedirect(path, target) {
  return rateLimitedRequest(
    `${BASE_URL}/redirects.json`,
    'POST',
    { redirect: { path, target } }
  );
}

export async function deleteRedirect(redirectId) {
  return rateLimitedRequest(
    `${BASE_URL}/redirects/${redirectId}.json`,
    'DELETE'
  );
}

// Customer methods
export async function getCustomers(params = {}) {
  const queryParams = new URLSearchParams(params);
  return rateLimitedRequest(`${BASE_URL}/customers.json?${queryParams}`);
}

export async function getCustomerCount(params = {}) {
  const queryParams = new URLSearchParams(params);
  return rateLimitedRequest(`${BASE_URL}/customers/count.json?${queryParams}`);
}

export async function getCustomerOrders(customerId, params = {}) {
  const queryParams = new URLSearchParams(params);
  return rateLimitedRequest(`${BASE_URL}/customers/${customerId}/orders.json?${queryParams}`);
}

// Order methods
export async function getOrders(params = {}) {
  const queryParams = new URLSearchParams(params);
  return rateLimitedRequest(`${BASE_URL}/orders.json?${queryParams}`);
}

export async function getOrderCount(params = {}) {
  const queryParams = new URLSearchParams(params);
  return rateLimitedRequest(`${BASE_URL}/orders/count.json?${queryParams}`);
}

// Abandoned checkout methods
export async function getAbandonedCheckouts(params = {}) {
  const queryParams = new URLSearchParams(params);
  return rateLimitedRequest(`${BASE_URL}/checkouts.json?${queryParams}`);
}

export async function getAbandonedCheckoutCount(params = {}) {
  const queryParams = new URLSearchParams(params);
  return rateLimitedRequest(`${BASE_URL}/checkouts/count.json?${queryParams}`);
}

export async function updateCustomer(customerId, data) {
  return rateLimitedRequest(
    `${BASE_URL}/customers/${customerId}.json`,
    'PUT',
    { customer: data }
  );
}

export default {
  getProducts,
  getProduct,
  updateProduct,
  getCollections,
  createSmartCollection,
  updateSmartCollection,
  deleteSmartCollection,
  getAllProductsByVendor,
  paginateAll,
  graphqlQuery,
  getMenus,
  createMenu,
  get,
  put,
  post,
  getInventoryItem,
  updateInventoryItem,
  getProductVariants,
  createProductVariant,
  updateProductVariant,
  deleteProductVariant,
  getLocations,
  setInventoryLevel,
  getRedirects,
  createRedirect,
  deleteRedirect,
  getCustomers,
  getCustomerCount,
  getCustomerOrders,
  getOrders,
  getOrderCount,
  getAbandonedCheckouts,
  getAbandonedCheckoutCount,
  updateCustomer,
};
