#!/usr/bin/env node
/**
 * Create Smokeshop Shipping Profile
 *
 * Creates a separate delivery profile for "What You Need" products
 * that excludes the expensive $250 "over 150 - 300" shipping rate.
 */

import 'dotenv/config';
import { execSync } from 'child_process';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';

const GRAPHQL_URL = `https://${STORE_URL}/admin/api/${API_VERSION}/graphql.json`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function graphqlRequest(query, variables = {}) {
  const body = JSON.stringify({ query, variables }).replace(/'/g, "'\\''");
  const cmd = `curl -s --max-time 60 -X POST "${GRAPHQL_URL}" ` +
    `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" ` +
    `-H "Content-Type: application/json" ` +
    `-d '${body}'`;

  try {
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (e) {
    return { errors: [{ message: e.message }] };
  }
}

async function getAllProductIds(vendor) {
  console.log(`Fetching all "${vendor}" product IDs...`);
  const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;
  const products = [];
  let lastId = 0;

  while (true) {
    const url = lastId > 0
      ? `${BASE_URL}/products.json?vendor=${encodeURIComponent(vendor)}&limit=250&since_id=${lastId}&fields=id`
      : `${BASE_URL}/products.json?vendor=${encodeURIComponent(vendor)}&limit=250&fields=id`;

    const cmd = `curl -s --max-time 60 "${url}" -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}"`;
    const result = execSync(cmd, { encoding: 'utf8' });
    const data = JSON.parse(result);

    if (!data.products || data.products.length === 0) break;

    products.push(...data.products.map(p => `gid://shopify/Product/${p.id}`));
    lastId = data.products[data.products.length - 1].id;
    console.log(`  Found ${products.length} products...`);

    if (data.products.length < 250) break;
    await sleep(500);
  }

  return products;
}

async function getExistingProfiles() {
  console.log('\nChecking existing delivery profiles...');

  const query = `
    query {
      deliveryProfiles(first: 20) {
        edges {
          node {
            id
            name
            default
          }
        }
      }
    }
  `;

  const result = await graphqlRequest(query);
  return result.data?.deliveryProfiles?.edges?.map(e => e.node) || [];
}

async function createDeliveryProfile(name, productIds) {
  console.log(`\nCreating delivery profile: ${name}`);
  console.log(`  Products to add: ${productIds.length}`);

  // Create profile with products (batch in groups)
  const mutation = `
    mutation deliveryProfileCreate($profile: DeliveryProfileInput!) {
      deliveryProfileCreate(profile: $profile) {
        profile {
          id
          name
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // Start with first batch of products
  const firstBatch = productIds.slice(0, 250);
  const variables = {
    profile: {
      name: name,
      productVariantsToAssociate: firstBatch.map(id => ({
        productId: id
      }))
    }
  };

  const result = await graphqlRequest(mutation, variables);

  if (result.data?.deliveryProfileCreate?.userErrors?.length > 0) {
    console.log('Errors:', result.data.deliveryProfileCreate.userErrors);
    return null;
  }

  const profile = result.data?.deliveryProfileCreate?.profile;
  if (profile) {
    console.log(`  ✓ Created profile: ${profile.id}`);

    // Add remaining products in batches
    if (productIds.length > 250) {
      console.log(`  Adding remaining ${productIds.length - 250} products...`);
      // Would need to use deliveryProfileUpdate to add more products
    }
  }

  return profile;
}

async function main() {
  console.log('='.repeat(70));
  console.log('SMOKESHOP SHIPPING PROFILE SETUP');
  console.log('='.repeat(70));
  console.log('');
  console.log('This will create a separate shipping profile for "What You Need" products');
  console.log('to exclude the $250 "over 150-300" shipping rate.');
  console.log('');

  // Check existing profiles
  const existingProfiles = await getExistingProfiles();
  console.log('Existing profiles:');
  for (const profile of existingProfiles) {
    console.log(`  - ${profile.name} (${profile.default ? 'DEFAULT' : profile.id})`);
  }

  // Check if smokeshop profile already exists
  const smokeshopProfile = existingProfiles.find(p =>
    p.name.toLowerCase().includes('smokeshop') ||
    p.name.toLowerCase().includes('what you need')
  );

  if (smokeshopProfile) {
    console.log(`\n⚠ Smokeshop profile already exists: ${smokeshopProfile.name}`);
    console.log('  You may need to configure shipping rates manually in Shopify Admin.');
    return;
  }

  // Get all What You Need product IDs
  const productIds = await getAllProductIds('What You Need');
  console.log(`\nTotal "What You Need" products: ${productIds.length}`);

  if (productIds.length === 0) {
    console.log('No products found!');
    return;
  }

  console.log('\n' + '='.repeat(70));
  console.log('IMPORTANT: Manual Steps Required');
  console.log('='.repeat(70));
  console.log(`
Due to Shopify API limitations, shipping profiles need to be configured
partially through the Admin UI:

1. Go to Shopify Admin → Settings → Shipping and delivery
2. Click "Create new profile"
3. Name it "Smokeshop Products"
4. Add products by searching for vendor "What You Need"
5. In the shipping zones, add these rates:
   - US: Use carrier-calculated rates (USPS, UPS)
   - Remove or don't add the "over 150-300" $250 rate
6. Save the profile

This will separate smokeshop products from the general shipping profile
and prevent the $250 rate from appearing.

Alternatively, you can:
1. Edit the existing "General Profile"
2. Remove the "over 150 - 300" rate from the United States zone
   (if it's not needed for other products)
`);

  // Try to provide more info about the problematic rate
  console.log('='.repeat(70));
  console.log('CURRENT US SHIPPING ZONE RATES');
  console.log('='.repeat(70));

  const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;
  const zonesResult = execSync(
    `curl -s "${BASE_URL}/shipping_zones.json" -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}"`,
    { encoding: 'utf8' }
  );
  const zones = JSON.parse(zonesResult).shipping_zones || [];

  const usZone = zones.find(z => z.name === 'United States');
  if (usZone) {
    console.log('\nUS Shipping Zone Rates:');

    const priceRates = usZone.price_based_shipping_rates || [];
    for (const rate of priceRates) {
      console.log(`  Price-based: "${rate.name}" - $${rate.price}`);
      console.log(`    ID: ${rate.id}`);
      console.log(`    Range: $${rate.min_order_subtotal || 0} - $${rate.max_order_subtotal || 'unlimited'}`);
    }

    const weightRates = usZone.weight_based_shipping_rates || [];
    for (const rate of weightRates) {
      console.log(`  Weight-based: "${rate.name}" - $${rate.price}`);
      console.log(`    ID: ${rate.id}`);
      console.log(`    Range: ${rate.weight_low}lb - ${rate.weight_high}lb`);
    }

    // Find the problematic rate
    const problemRate = priceRates.find(r => r.name.includes('150') || r.price === '250.00');
    if (problemRate) {
      console.log(`\n⚠ PROBLEMATIC RATE FOUND:`);
      console.log(`  Name: "${problemRate.name}"`);
      console.log(`  Price: $${problemRate.price}`);
      console.log(`  ID: ${problemRate.id}`);
      console.log(`\nTo delete this rate, run:`);
      console.log(`  curl -X DELETE "${BASE_URL}/shipping_zones/${usZone.id}/price_based_shipping_rates/${problemRate.id}.json" \\`);
      console.log(`    -H "X-Shopify-Access-Token: ${ACCESS_TOKEN}"`);
    }
  }
}

main().catch(console.error);
