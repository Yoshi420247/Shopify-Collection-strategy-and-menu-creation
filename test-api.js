import 'dotenv/config';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

const baseUrl = `https://${STORE_URL}/admin/api/${API_VERSION}`;

async function makeRequest(endpoint, method = 'GET') {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      'X-Shopify-Access-Token': ACCESS_TOKEN,
      'Content-Type': 'application/json',
    },
  });

  return {
    status: response.status,
    ok: response.ok,
    data: response.ok ? await response.json() : await response.text(),
  };
}

async function testApiAccess() {
  console.log('='.repeat(60));
  console.log('SHOPIFY API ACCESS TEST');
  console.log('='.repeat(60));
  console.log(`Store: ${STORE_URL}`);
  console.log(`API Version: ${API_VERSION}`);
  console.log('='.repeat(60));
  console.log('');

  const tests = [
    { name: 'Shop Info', endpoint: '/shop.json', scope: 'read_shop' },
    { name: 'Products', endpoint: '/products.json?limit=1', scope: 'read_products' },
    { name: 'Collections (Custom)', endpoint: '/custom_collections.json?limit=1', scope: 'read_products' },
    { name: 'Collections (Smart)', endpoint: '/smart_collections.json?limit=1', scope: 'read_products' },
    { name: 'Pages', endpoint: '/pages.json?limit=1', scope: 'read_content' },
    { name: 'Blogs', endpoint: '/blogs.json?limit=1', scope: 'read_content' },
    { name: 'Themes', endpoint: '/themes.json', scope: 'read_themes' },
    { name: 'Redirects', endpoint: '/redirects.json?limit=1', scope: 'read_online_store_navigation' },
    { name: 'Script Tags', endpoint: '/script_tags.json?limit=1', scope: 'read_script_tags' },
    { name: 'Customers', endpoint: '/customers.json?limit=1', scope: 'read_customers' },
    { name: 'Orders', endpoint: '/orders.json?limit=1&status=any', scope: 'read_orders' },
    { name: 'Inventory Locations', endpoint: '/locations.json', scope: 'read_inventory' },
    { name: 'Metafields', endpoint: '/metafields.json?limit=1', scope: 'read_metafields' },
  ];

  const results = {
    passed: [],
    failed: [],
  };

  for (const test of tests) {
    try {
      const result = await makeRequest(test.endpoint);

      if (result.ok) {
        console.log(`✓ ${test.name.padEnd(25)} - ACCESS GRANTED (${test.scope})`);
        results.passed.push(test);
      } else if (result.status === 403) {
        console.log(`✗ ${test.name.padEnd(25)} - NO ACCESS (missing ${test.scope})`);
        results.failed.push({ ...test, reason: 'forbidden' });
      } else if (result.status === 401) {
        console.log(`✗ ${test.name.padEnd(25)} - UNAUTHORIZED (invalid token)`);
        results.failed.push({ ...test, reason: 'unauthorized' });
      } else {
        console.log(`? ${test.name.padEnd(25)} - STATUS ${result.status}`);
        results.failed.push({ ...test, reason: `status_${result.status}` });
      }
    } catch (error) {
      console.log(`✗ ${test.name.padEnd(25)} - ERROR: ${error.message}`);
      results.failed.push({ ...test, reason: error.message });
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Access granted: ${results.passed.length}/${tests.length} endpoints`);
  console.log(`Access denied:  ${results.failed.length}/${tests.length} endpoints`);
  console.log('');

  if (results.passed.length > 0) {
    // Get shop details if we have access
    const shopResult = await makeRequest('/shop.json');
    if (shopResult.ok) {
      const shop = shopResult.data.shop;
      console.log('SHOP DETAILS:');
      console.log(`  Name: ${shop.name}`);
      console.log(`  Domain: ${shop.domain}`);
      console.log(`  Email: ${shop.email}`);
      console.log(`  Plan: ${shop.plan_display_name}`);
      console.log(`  Currency: ${shop.currency}`);
      console.log('');
    }
  }

  if (results.failed.length > 0 && results.failed[0].reason === 'unauthorized') {
    console.log('⚠️  Your access token appears to be invalid.');
    console.log('   Please check your token in the Shopify Admin.');
  } else if (results.failed.length > 0) {
    console.log('Missing scopes (add these in your Shopify app settings):');
    const missingScopes = [...new Set(results.failed.map(f => f.scope))];
    missingScopes.forEach(scope => console.log(`  - ${scope}`));
  }

  console.log('='.repeat(60));

  return results;
}

// Test GraphQL access for navigation menus
async function testGraphQLAccess() {
  console.log('');
  console.log('GRAPHQL API TEST (for Navigation Menus)');
  console.log('='.repeat(60));

  const graphqlUrl = `https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`;

  const query = `
    query {
      menus(first: 5) {
        edges {
          node {
            id
            title
            handle
            itemsCount
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    const result = await response.json();

    if (result.data && result.data.menus) {
      console.log('✓ GraphQL Menu Access - GRANTED');
      console.log('');
      console.log('Existing Menus:');
      if (result.data.menus.edges.length === 0) {
        console.log('  (No menus found)');
      } else {
        result.data.menus.edges.forEach(({ node }) => {
          console.log(`  - ${node.title} (handle: ${node.handle}, items: ${node.itemsCount})`);
        });
      }
    } else if (result.errors) {
      console.log('✗ GraphQL Menu Access - DENIED');
      console.log('  Errors:', result.errors.map(e => e.message).join(', '));
    }
  } catch (error) {
    console.log('✗ GraphQL Access - ERROR:', error.message);
  }

  console.log('='.repeat(60));
}

// Run tests
testApiAccess()
  .then(() => testGraphQLAccess())
  .catch(console.error);
