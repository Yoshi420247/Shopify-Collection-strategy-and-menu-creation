#!/usr/bin/env node
/**
 * Fix Duplicate Product Listings
 *
 * Identifies duplicate products by comparing normalized titles and archives
 * (sets to draft) the legacy versions. The "keeper" is chosen based on:
 *   1. Has a WYN-* SKU (standardized naming from the import pipeline)
 *   2. Higher price (correct retail pricing)
 *   3. Proper mixed-case title
 *
 * The legacy duplicate is set to "draft" status so it's hidden from the
 * storefront but NOT deleted (non-destructive).
 *
 * Usage:
 *   node src/fix-duplicate-listings.js              # Dry run - report only
 *   node src/fix-duplicate-listings.js --execute     # Archive duplicates
 */

import { STORE_URL, BASE_URL, colors, log, logSection, sleep, curlRequest, getAllProducts } from './utils.js';

/**
 * Normalize a product title for comparison.
 * Strips quotes, lowercases, collapses whitespace, removes trailing punctuation.
 */
function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036"]/g, '"')  // normalize smart quotes
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035']/g, "'")  // normalize smart apostrophes
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a product looks like the "legacy" duplicate:
 *   - ALL CAPS title
 *   - Simple concatenated SKU (no dashes, no WYN- prefix)
 *   - Lower price
 */
function isLegacyListing(product) {
  const title = product.title || '';
  const sku = (product.variants && product.variants[0] && product.variants[0].sku) || '';

  // Check if title is ALL CAPS (excluding digits, quotes, punctuation)
  const letters = title.replace(/[^a-zA-Z]/g, '');
  const isAllCaps = letters.length > 0 && letters === letters.toUpperCase();

  // Check if SKU is NOT a WYN-* standardized SKU
  const isLegacySku = !sku.startsWith('WYN-');

  return { isAllCaps, isLegacySku };
}

/**
 * Score a product for "keeper" selection (higher = better to keep)
 */
function scoreProduct(product) {
  let score = 0;
  const sku = (product.variants && product.variants[0] && product.variants[0].sku) || '';
  const price = parseFloat((product.variants && product.variants[0] && product.variants[0].price) || '0');
  const title = product.title || '';
  const letters = title.replace(/[^a-zA-Z]/g, '');

  // WYN-* SKU is preferred (standardized import)
  if (sku.startsWith('WYN-')) score += 100;

  // Higher price suggests correct retail pricing
  score += price;

  // Mixed-case title preferred over ALL CAPS
  if (letters.length > 0 && letters !== letters.toUpperCase()) score += 50;

  // Has images
  if (product.images && product.images.length > 0) score += 10;

  // Has body HTML (description)
  if (product.body_html && product.body_html.length > 10) score += 5;

  // Has tags
  if (product.tags && product.tags.length > 0) score += 5;

  // Already active is a small bonus
  if (product.status === 'active') score += 2;

  return score;
}

/**
 * Set a product to draft status
 */
async function draftProduct(productId) {
  const result = curlRequest(
    `${BASE_URL}/products/${productId}.json`,
    'PUT',
    { product: { id: productId, status: 'draft' } }
  );
  return result && result.product;
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('\n' + '═'.repeat(70));
  log('  FIX DUPLICATE PRODUCT LISTINGS', 'bright');
  log(`  Store: ${STORE_URL}`, 'cyan');
  log(`  Mode: ${dryRun ? 'DRY RUN (use --execute to apply)' : 'EXECUTING CHANGES'}`, dryRun ? 'yellow' : 'green');
  console.log('═'.repeat(70));

  // Step 1: Fetch all "What You Need" products
  logSection('FETCHING "WHAT YOU NEED" PRODUCTS');
  const products = await getAllProducts('What You Need');
  log(`Found ${products.length} total products`, 'cyan');

  // Step 2: Group by normalized title
  logSection('GROUPING BY NORMALIZED TITLE');
  const groups = new Map();

  for (const product of products) {
    const key = normalizeTitle(product.title);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(product);
  }

  const duplicateGroups = [...groups.entries()].filter(([, prods]) => prods.length > 1);
  const uniqueCount = [...groups.entries()].filter(([, prods]) => prods.length === 1).length;

  log(`\nUnique products: ${uniqueCount}`, 'green');
  log(`Duplicate groups found: ${duplicateGroups.length}`, duplicateGroups.length > 0 ? 'red' : 'green');

  if (duplicateGroups.length === 0) {
    logSection('NO DUPLICATES FOUND');
    log('All products have unique titles. Nothing to do!', 'green');
    return;
  }

  // Step 3: Analyze each duplicate group
  logSection(`ANALYZING ${duplicateGroups.length} DUPLICATE GROUPS`);

  const toArchive = [];

  for (let i = 0; i < duplicateGroups.length; i++) {
    const [normalizedTitle, prods] = duplicateGroups[i];

    console.log(`\n  ${colors.bright}Group ${i + 1}/${duplicateGroups.length}: "${normalizedTitle}"${colors.reset}`);
    console.log(`  ${prods.length} products in this group:`);

    // Score each product
    const scored = prods.map(p => ({
      product: p,
      score: scoreProduct(p),
      legacy: isLegacyListing(p),
    }));

    // Sort by score descending (best keeper first)
    scored.sort((a, b) => b.score - a.score);

    const keeper = scored[0];

    for (const item of scored) {
      const p = item.product;
      const sku = (p.variants && p.variants[0] && p.variants[0].sku) || '(no SKU)';
      const price = (p.variants && p.variants[0] && p.variants[0].price) || '0.00';
      const isKeeper = item === keeper;
      const marker = isKeeper ? `${colors.green}  KEEP` : `${colors.red}  ARCHIVE`;
      const capsNote = item.legacy.isAllCaps ? ' [ALL CAPS]' : '';
      const skuNote = item.legacy.isLegacySku ? ' [legacy SKU]' : ' [WYN SKU]';

      console.log(`${marker}${colors.reset}  "${p.title}" (ID: ${p.id})`);
      console.log(`         SKU: ${sku}${skuNote}  Price: $${price}${capsNote}  Score: ${item.score}  Status: ${p.status}`);
    }

    // Queue duplicates for archiving
    const duplicates = scored.slice(1);
    for (const dup of duplicates) {
      toArchive.push({
        product: dup.product,
        keeperTitle: keeper.product.title,
        keeperId: keeper.product.id,
        reason: [
          dup.legacy.isAllCaps ? 'ALL CAPS title' : null,
          dup.legacy.isLegacySku ? 'legacy SKU' : null,
          `lower score (${dup.score} vs ${keeper.score})`,
        ].filter(Boolean).join(', '),
      });
    }
  }

  // Step 4: Archive duplicates
  logSection(`ARCHIVING ${toArchive.length} DUPLICATE LISTINGS`);

  // Filter to only active duplicates (already-drafted ones don't need action)
  const activeToArchive = toArchive.filter(item => item.product.status === 'active');
  const alreadyDrafted = toArchive.filter(item => item.product.status === 'draft');

  if (alreadyDrafted.length > 0) {
    log(`\n  Already in draft: ${alreadyDrafted.length} (no action needed)`, 'dim');
  }

  if (activeToArchive.length === 0) {
    log('\nAll duplicates are already in draft status. Nothing to do!', 'green');
  } else {
    log(`\n  Active duplicates to archive: ${activeToArchive.length}`, 'yellow');

    let archived = 0;
    let errors = 0;

    for (let i = 0; i < activeToArchive.length; i++) {
      const item = activeToArchive[i];
      const p = item.product;
      const sku = (p.variants && p.variants[0] && p.variants[0].sku) || '(no SKU)';

      console.log(`\n  [${i + 1}/${activeToArchive.length}] "${p.title}" (ID: ${p.id})`);
      console.log(`    SKU: ${sku}`);
      console.log(`    Reason: ${item.reason}`);
      console.log(`    Keeping: "${item.keeperTitle}" (ID: ${item.keeperId})`);

      if (!dryRun) {
        const result = await draftProduct(p.id);
        if (result) {
          log(`    ✓ Archived (set to draft)`, 'green');
          archived++;
        } else {
          log(`    ✗ Failed to archive`, 'red');
          errors++;
        }
        await sleep(550);
      } else {
        log(`    → Would archive (set to draft)`, 'yellow');
        archived++;
      }
    }

    // Summary
    logSection('SUMMARY');
    log(`Total "What You Need" products: ${products.length}`, 'blue');
    log(`Unique products: ${uniqueCount}`, 'green');
    log(`Duplicate groups: ${duplicateGroups.length}`, 'yellow');
    log(`Total duplicates found: ${toArchive.length}`, 'yellow');
    log(`Already drafted: ${alreadyDrafted.length}`, 'dim');
    log(`Archived (active → draft): ${archived}`, 'green');
    if (errors > 0) log(`Errors: ${errors}`, 'red');

    if (dryRun) {
      console.log('');
      log('This was a DRY RUN. To apply changes:', 'yellow');
      console.log('  node src/fix-duplicate-listings.js --execute');
    } else {
      console.log('');
      log('Duplicate listings have been archived!', 'green');
      log('Archived products are set to "draft" and hidden from the storefront.', 'cyan');
      log('You can still find them in Shopify Admin under Products > Draft.', 'cyan');
    }
  }
}

main().catch(err => {
  log(`\nFatal error: ${err.message}`, 'red');
  console.error(err);
  process.exit(1);
});
