#!/usr/bin/env node
/**
 * Check what tags exist on jar products
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

async function main() {
  // Find products with 'jar' in title
  const query = `
    query {
      products(first: 50, query: "title:*jar*") {
        edges {
          node {
            id
            title
            vendor
            tags
          }
        }
      }
    }
  `;

  const result = await api.graphqlQuery(query, {});
  const products = result.data?.products?.edges || [];

  console.log('Products with jar in title:', products.length);
  for (const p of products.slice(0, 15)) {
    console.log('---');
    console.log('Title:', p.node.title.substring(0, 60));
    console.log('Vendor:', p.node.vendor);
    console.log('Tags:', p.node.tags.join(', '));
  }

  // Check for family tags
  const familyTags = new Set();
  for (const p of products) {
    for (const tag of p.node.tags) {
      if (tag.startsWith('family:')) {
        familyTags.add(tag);
      }
    }
  }

  console.log('\n---');
  console.log('Family tags found on jar products:');
  for (const tag of familyTags) {
    console.log(' ', tag);
  }
}

main().catch(console.error);
