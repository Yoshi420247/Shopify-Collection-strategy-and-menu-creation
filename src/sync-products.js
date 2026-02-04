/**
 * Product Sync
 *
 * Syncs all Shopify products to Supabase for tracking,
 * classification, and health monitoring.
 *
 * Usage: node src/sync-products.js
 */

import 'dotenv/config';
import { getAllProducts } from './shopify-api.js';
import { supabase, upsertProduct, logAudit } from './supabase-client.js';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('='.repeat(70));
  console.log('SYNC PRODUCTS: Shopify → Supabase');
  console.log('='.repeat(70));

  // Fetch all products from Shopify
  console.log('\nFetching products from Shopify...');
  const products = await getAllProducts();
  console.log(`Found ${products.length} products\n`);

  // Sync to Supabase
  let synced = 0;
  let failed = 0;

  for (const product of products) {
    try {
      await upsertProduct(product);
      synced++;

      // Rate limit Supabase writes
      if (synced % 10 === 0) {
        await sleep(100);
      }

      if (synced % 50 === 0) {
        process.stdout.write(`\rSynced ${synced}/${products.length}...`);
      }
    } catch (error) {
      console.error(`\nFailed to sync ${product.id} (${product.title}): ${error.message}`);
      failed++;
    }
  }

  console.log(`\rSynced ${synced}/${products.length} products`);

  // Log the sync event
  await logAudit('products_synced', 'system', 'all', 'Full product sync', {
    total_products: products.length,
    synced,
    failed,
    vendors: [...new Set(products.map(p => p.vendor))],
  }, 'sync');

  // Report classification status
  const { data: statusCounts } = await supabase
    .from('product_sync')
    .select('classification_status');

  if (statusCounts) {
    const counts = {};
    statusCounts.forEach(r => {
      counts[r.classification_status] = (counts[r.classification_status] || 0) + 1;
    });

    console.log('\n--- Classification Status ---');
    Object.entries(counts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
  }

  console.log('\n' + '='.repeat(70));
  console.log('SYNC COMPLETE');
  console.log('='.repeat(70));
  console.log(`Synced: ${synced} | Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
