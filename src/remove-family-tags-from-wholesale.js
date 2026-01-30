/**
 * Remove Family Tags from Wholesale Products
 *
 * Removes family: tags from products tagged with "Wholesale Quantity"
 * so they only appear in the Wholesale collection (and brand collections),
 * not in product category collections.
 */

import 'dotenv/config';
import * as api from './shopify-api.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getAllProducts() {
  let products = [];
  let sinceId = 0;

  while (true) {
    const data = await api.get(`products.json?limit=250&since_id=${sinceId}`);
    if (!data.products || data.products.length === 0) break;
    products = products.concat(data.products);
    sinceId = data.products[data.products.length - 1].id;
    process.stderr.write(`\rFetched ${products.length} products...`);
    if (data.products.length < 250) break;
  }
  console.error('');
  return products;
}

async function removeFamilyTags(product) {
  const currentTags = (product.tags || '').split(',').map(t => t.trim()).filter(t => t);

  // Find family tags
  const familyTags = currentTags.filter(t => t.startsWith('family:'));

  if (familyTags.length === 0) {
    return { modified: false, reason: 'No family tags' };
  }

  // Remove family tags
  const newTags = currentTags.filter(t => !t.startsWith('family:'));
  const newTagsStr = newTags.join(', ');

  await api.updateProduct(product.id, { tags: newTagsStr });

  return { modified: true, removed: familyTags };
}

async function main() {
  console.log('='.repeat(70));
  console.log('REMOVE FAMILY TAGS FROM WHOLESALE PRODUCTS');
  console.log('='.repeat(70));

  console.log('\nFetching all products...');
  const products = await getAllProducts();
  console.log(`Found ${products.length} products\n`);

  // Find wholesale products
  const wholesaleProducts = products.filter(p =>
    (p.tags || '').includes('Wholesale Quantity')
  );

  console.log(`Wholesale products: ${wholesaleProducts.length}\n`);

  let modified = 0;
  let skipped = 0;
  let failed = 0;

  for (const product of wholesaleProducts) {
    console.log(`Processing: ${product.title.substring(0, 50)}...`);

    try {
      const result = await removeFamilyTags(product);

      if (result.modified) {
        console.log(`  ✓ Removed: ${result.removed.join(', ')}`);
        modified++;
      } else {
        console.log(`  - Skipped: ${result.reason}`);
        skipped++;
      }

      await sleep(350);
    } catch (error) {
      console.log(`  ✗ Error: ${error.message}`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  console.log(`Modified: ${modified}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
