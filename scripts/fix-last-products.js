#!/usr/bin/env node
/**
 * Fix the last 3 unidentified products manually
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';

const MANUAL_FIXES = {
  'CUSTOM MATCHES': {
    tags: 'family:promotional-item, pillar:merch, use:branding',
    product_type: 'Promotional Item'
  },
  '11.5" Pvc Backpack Rabbit | Glass + PVC': {
    tags: 'family:glass-bong, pillar:smokeshop-device, use:flower-smoking, material:glass, style:novelty',
    product_type: 'Novelty Water Pipe'
  }
  // Skip "test" - it's just a test product
};

async function main() {
  console.log('Fixing last unidentified products...\n');

  const query = `
    query {
      products(first: 250, query: "title:CUSTOM MATCHES OR title:Backpack Rabbit") {
        edges {
          node {
            id
            title
            handle
          }
        }
      }
    }
  `;

  const result = await api.graphqlQuery(query, {});

  if (result.data && result.data.products) {
    for (const edge of result.data.products.edges) {
      const product = edge.node;
      const restId = product.id.replace('gid://shopify/Product/', '');

      // Find matching fix
      for (const [titleMatch, fix] of Object.entries(MANUAL_FIXES)) {
        if (product.title.includes(titleMatch) || titleMatch.includes(product.title.substring(0, 20))) {
          try {
            await api.updateProduct(restId, fix);
            console.log(`[FIXED] ${product.title} -> ${fix.product_type}`);
          } catch (error) {
            console.log(`[ERROR] ${product.title}: ${error.message}`);
          }
          break;
        }
      }
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
