// Shopify API wrapper using child_process for curl (more reliable in some environments)
import { config } from './config.js';
import { execSync } from 'child_process';

const BASE_URL = `https://${config.shopify.storeUrl}/admin/api/${config.shopify.apiVersion}`;
const GRAPHQL_URL = `${BASE_URL}/graphql.json`;

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 550;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function rateLimitedRequest(url, method = 'GET', body = null) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await sleep(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }
  lastRequestTime = Date.now();

  // Build curl command
  let curlCmd = `curl -s -X ${method} "${url}" `;
  curlCmd += `-H "X-Shopify-Access-Token: ${config.shopify.accessToken}" `;
  curlCmd += `-H "Content-Type: application/json" `;

  if (body) {
    // Escape the body for shell
    const escapedBody = JSON.stringify(body).replace(/'/g, "'\\''");
    curlCmd += `-d '${escapedBody}'`;
  }

  try {
    const result = execSync(curlCmd, {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large responses
    });
    return JSON.parse(result);
  } catch (error) {
    console.error(`API Error: ${error.message}`);
    throw error;
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
};
