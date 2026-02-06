// Shopify API wrapper using child_process for curl (more reliable in some environments)
// Supports adaptive rate limiting based on Shopify's X-Shopify-Shop-Api-Call-Limit header
import { config } from './config.js';
import { execSync } from 'child_process';

const BASE_URL = `https://${config.shopify.storeUrl}/admin/api/${config.shopify.apiVersion}`;
const GRAPHQL_URL = `${BASE_URL}/graphql.json`;

// Adaptive rate limiting state
let lastRequestTime = 0;
let minInterval = 550; // Default conservative interval (ms)
const MIN_INTERVAL_FLOOR = 200;  // Fastest we'll go when bucket is nearly empty
const MIN_INTERVAL_CEIL = 1000;  // Slowest we'll go when bucket is nearly full

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Adjust request interval based on Shopify's rate limit header.
 * Header format: "used/available" (e.g. "32/40")
 */
function adjustRateLimit(callLimitHeader) {
  if (!callLimitHeader) return;
  const parts = callLimitHeader.split('/');
  if (parts.length !== 2) return;

  const used = parseInt(parts[0], 10);
  const available = parseInt(parts[1], 10);
  if (isNaN(used) || isNaN(available) || available === 0) return;

  const usageRatio = used / available;

  if (usageRatio > 0.9) {
    // Over 90% used — slow down significantly
    minInterval = MIN_INTERVAL_CEIL;
  } else if (usageRatio > 0.7) {
    // 70-90% used — moderate pacing
    minInterval = 700;
  } else if (usageRatio > 0.5) {
    // 50-70% used — default pace
    minInterval = 550;
  } else {
    // Under 50% used — speed up
    minInterval = MIN_INTERVAL_FLOOR;
  }
}

async function rateLimitedRequest(url, method = 'GET', body = null, retries = 3) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < minInterval) {
    await sleep(minInterval - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();

  // Build curl command — use -i to include response headers
  let curlCmd = `curl -s -i --max-time 30 -X ${method} "${url}" `;
  curlCmd += `-H "X-Shopify-Access-Token: ${config.shopify.accessToken}" `;
  curlCmd += `-H "Content-Type: application/json" `;

  if (body) {
    const escapedBody = JSON.stringify(body).replace(/'/g, "'\\''");
    curlCmd += `-d '${escapedBody}'`;
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const rawResult = execSync(curlCmd, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });

      // Split headers from body (blank line separates them)
      const headerBodySplit = rawResult.indexOf('\r\n\r\n');
      let headers = '';
      let bodyStr = rawResult;

      if (headerBodySplit !== -1) {
        headers = rawResult.substring(0, headerBodySplit);
        bodyStr = rawResult.substring(headerBodySplit + 4);
      }

      // Parse rate limit header
      const callLimitMatch = headers.match(/x-shopify-shop-api-call-limit:\s*(\S+)/i);
      if (callLimitMatch) {
        adjustRateLimit(callLimitMatch[1]);
      }

      // Parse HTTP status from headers
      const statusMatch = headers.match(/HTTP\/[\d.]+ (\d{3})/);
      const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 200;

      // Handle 429 Too Many Requests — mandatory backoff
      if (statusCode === 429) {
        const retryAfter = headers.match(/retry-after:\s*(\d+)/i);
        const waitTime = retryAfter ? parseInt(retryAfter[1], 10) * 1000 : Math.pow(2, attempt) * 2000;
        console.log(`  Rate limited (429). Waiting ${waitTime / 1000}s before retry...`);
        minInterval = MIN_INTERVAL_CEIL; // Slow down for subsequent requests
        await sleep(waitTime);
        continue;
      }

      // Parse JSON body
      const parsed = JSON.parse(bodyStr);

      // Check for API-level errors
      if (parsed.errors) {
        throw new Error(JSON.stringify(parsed.errors));
      }

      return parsed;
    } catch (error) {
      if (attempt < retries) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`  Retry ${attempt}/${retries} after ${waitTime / 1000}s...`);
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

// GraphQL API methods
export async function graphqlQuery(query, variables = {}) {
  return rateLimitedRequest(
    GRAPHQL_URL,
    'POST',
    { query, variables }
  );
}

// Get menus via GraphQL with cursor-based pagination
export async function getMenus({ menuLimit = 50, itemLimit = 50, subItemLimit = 50 } = {}) {
  let allMenus = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const afterClause = cursor ? `, after: "${cursor}"` : '';
    const query = `
      query {
        menus(first: ${menuLimit}${afterClause}) {
          edges {
            cursor
            node {
              id
              title
              handle
              items(first: ${itemLimit}) {
                edges {
                  node {
                    id
                    title
                    url
                    type
                    items(first: ${subItemLimit}) {
                      edges {
                        node {
                          id
                          title
                          url
                          type
                        }
                      }
                      pageInfo { hasNextPage }
                    }
                  }
                }
                pageInfo { hasNextPage }
              }
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
    `;

    const result = await graphqlQuery(query);

    if (result.errors) return result; // Pass errors through

    const edges = result.data?.menus?.edges || [];
    allMenus.push(...edges);

    hasNextPage = result.data?.menus?.pageInfo?.hasNextPage || false;
    if (hasNextPage && edges.length > 0) {
      cursor = edges[edges.length - 1].cursor;
    }
  }

  // Return in the same shape as the old single-query response
  return {
    data: {
      menus: {
        edges: allMenus,
      },
    },
  };
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

export default {
  getProducts,
  getProduct,
  updateProduct,
  getCollections,
  createSmartCollection,
  updateSmartCollection,
  deleteSmartCollection,
  getAllProductsByVendor,
  graphqlQuery,
  getMenus,
  createMenu,
  get,
  put,
  post,
  getInventoryItem,
  updateInventoryItem,
  getRedirects,
  createRedirect,
  deleteRedirect,
};
