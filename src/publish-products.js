#!/usr/bin/env node
/**
 * Publish Products to Online Store
 *
 * This script publishes all "What You Need" vendor products to the Online Store
 * sales channel so they appear on the storefront.
 */

import { execSync } from 'child_process';
import { STORE_URL, ACCESS_TOKEN, BASE_URL, sleep, getAllProducts } from './utils.js';

const GRAPHQL_URL = `${BASE_URL}/graphql.json`;

// Online Store publication ID - can override via env var if it changes
const ONLINE_STORE_PUB_ID = process.env.SHOPIFY_PUBLICATION_ID || 'gid://shopify/Publication/46793987';

async function publishProduct(productId) {
  const mutation = `
    mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable {
          ... on Product {
            id
            title
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    id: `gid://shopify/Product/${productId}`,
    input: [{ publicationId: ONLINE_STORE_PUB_ID }]
  };

  const body = { query: mutation, variables };
  const escapedBody = JSON.stringify(body).replace(/'/g, "'\\''");

  let cmd = `curl -s --max-time 30 -X POST "${GRAPHQL_URL}" `;
  cmd += `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" `;
  cmd += `-H "Content-Type: application/json" `;
  cmd += `-d '${escapedBody}'`;

  try {
    const result = execSync(cmd, { encoding: 'utf8' });
    return JSON.parse(result);
  } catch (e) {
    return { errors: [{ message: e.message }] };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('PUBLISHING PRODUCTS TO ONLINE STORE');
  console.log('='.repeat(70));
  console.log(`Publication: Online Store (${ONLINE_STORE_PUB_ID})`);
  console.log('');

  // Get all products
  const products = await getAllProducts('What You Need');
  console.log(`\nTotal products to publish: ${products.length}`);

  // Publish each product
  let published = 0;
  let failed = 0;
  let alreadyPublished = 0;

  console.log('\nPublishing products...');

  for (let i = 0; i < products.length; i++) {
    const product = products[i];

    const result = await publishProduct(product.id);

    if (result.data?.publishablePublish?.publishable) {
      published++;
    } else if (result.data?.publishablePublish?.userErrors?.length > 0) {
      const errors = result.data.publishablePublish.userErrors;
      if (errors.some(e => e.message.includes('already published'))) {
        alreadyPublished++;
      } else {
        failed++;
        console.log(`  ✗ ${product.title}: ${errors[0].message}`);
      }
    } else {
      failed++;
    }

    // Progress update every 50 products
    if ((i + 1) % 50 === 0) {
      console.log(`  Progress: ${i + 1}/${products.length} (${published} published, ${alreadyPublished} already published, ${failed} failed)`);
    }

    // Rate limiting
    await sleep(100);
  }

  console.log('\n' + '='.repeat(70));
  console.log('COMPLETE');
  console.log('='.repeat(70));
  console.log(`Published: ${published}`);
  console.log(`Already published: ${alreadyPublished}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total: ${products.length}`);
}

main().catch(console.error);
