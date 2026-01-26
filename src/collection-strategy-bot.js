#!/usr/bin/env node
/**
 * Shopify Collection Strategy Bot
 *
 * This bot analyzes, optimizes tags, creates collections, and fixes menus
 * for the "What You Need" vendor products (smokeshop/vape products).
 *
 * Based on best practices for smokeshop ecommerce navigation:
 * - Clear product categorization by use case (flower, dabbing, rolling, vaping)
 * - Logical subcategories (bongs, rigs, pipes, accessories)
 * - Brand-based browsing
 * - Feature-based filtering (material, made in usa, heady)
 */

import 'dotenv/config';
import { config } from './config.js';
import api from './shopify-api.js';

// ANSI colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(70));
  log(title, 'bright');
  console.log('='.repeat(70));
}

// ============================================================================
// TAG ANALYSIS AND OPTIMIZATION
// ============================================================================

function analyzeProductTags(products) {
  logSection('ANALYZING PRODUCT TAGS');

  const tagStats = {};
  const productsByFamily = {};
  const productsWithoutFamily = [];
  const tagPatterns = {
    family: new Set(),
    format: new Set(),
    material: new Set(),
    use: new Set(),
    pillar: new Set(),
    brand: new Set(),
    style: new Set(),
    joint_size: new Set(),
    joint_gender: new Set(),
    joint_angle: new Set(),
    length: new Set(),
    bundle: new Set(),
    other: new Set(),
  };

  for (const product of products) {
    const tags = product.tags ? product.tags.split(',').map(t => t.trim()) : [];
    let hasFamily = false;

    for (const tag of tags) {
      // Count all tags
      tagStats[tag] = (tagStats[tag] || 0) + 1;

      // Categorize by pattern
      const [prefix, value] = tag.includes(':') ? tag.split(':') : ['other', tag];

      if (tagPatterns[prefix]) {
        tagPatterns[prefix].add(tag);
      } else {
        tagPatterns.other.add(tag);
      }

      // Track products by family
      if (prefix === 'family') {
        hasFamily = true;
        if (!productsByFamily[value]) {
          productsByFamily[value] = [];
        }
        productsByFamily[value].push(product);
      }
    }

    if (!hasFamily) {
      productsWithoutFamily.push(product);
    }
  }

  // Report findings
  log(`\nTotal products: ${products.length}`, 'cyan');
  log(`Products with family tags: ${products.length - productsWithoutFamily.length}`, 'green');
  log(`Products without family tags: ${productsWithoutFamily.length}`, 'yellow');

  console.log('\nTag categories:');
  for (const [category, tags] of Object.entries(tagPatterns)) {
    if (tags.size > 0) {
      console.log(`  ${category}: ${tags.size} unique tags`);
    }
  }

  console.log('\nProducts by family:');
  for (const [family, prods] of Object.entries(productsByFamily).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${family}: ${prods.length} products`);
  }

  if (productsWithoutFamily.length > 0) {
    console.log('\nProducts without family tag (need review):');
    for (const prod of productsWithoutFamily.slice(0, 10)) {
      console.log(`  - ${prod.title} (ID: ${prod.id})`);
      console.log(`    Current tags: ${prod.tags || '(none)'}`);
    }
    if (productsWithoutFamily.length > 10) {
      console.log(`  ... and ${productsWithoutFamily.length - 10} more`);
    }
  }

  return {
    tagStats,
    productsByFamily,
    productsWithoutFamily,
    tagPatterns,
  };
}

function generateOptimalTags(product, analysis) {
  /**
   * Determine optimal tags for a product based on:
   * 1. Product title analysis
   * 2. Product type
   * 3. Existing tags that are valid
   */
  const currentTags = product.tags ? product.tags.split(',').map(t => t.trim()) : [];
  const optimalTags = new Set();

  // Keep valid structured tags
  const validPrefixes = ['family', 'material', 'use', 'pillar', 'brand', 'style', 'joint_size', 'joint_gender', 'joint_angle'];

  for (const tag of currentTags) {
    const [prefix] = tag.split(':');
    if (validPrefixes.includes(prefix)) {
      optimalTags.add(tag);
    }
  }

  // Remove redundant format tags if family exists
  const hasFamily = currentTags.some(t => t.startsWith('family:'));
  if (hasFamily) {
    // Format tags are redundant when family exists
    for (const tag of currentTags) {
      if (tag.startsWith('format:')) {
        optimalTags.delete(tag);
      }
    }
  }

  // Keep length tags but standardize format
  for (const tag of currentTags) {
    if (tag.startsWith('length:')) {
      optimalTags.add(tag);
    }
  }

  // Keep bundle tags
  for (const tag of currentTags) {
    if (tag.startsWith('bundle:')) {
      optimalTags.add(tag);
    }
  }

  return Array.from(optimalTags);
}

// ============================================================================
// TAG CLEANUP
// ============================================================================

async function cleanupProductTags(products, dryRun = true) {
  logSection('CLEANING UP PRODUCT TAGS');

  if (dryRun) {
    log('DRY RUN MODE - No changes will be made', 'yellow');
  }

  let updated = 0;
  let unchanged = 0;
  const changes = [];

  for (const product of products) {
    const currentTags = product.tags ? product.tags.split(',').map(t => t.trim()) : [];
    const optimalTags = generateOptimalTags(product, null);

    // Check if tags need updating
    const currentSet = new Set(currentTags);
    const optimalSet = new Set(optimalTags);

    const removed = currentTags.filter(t => !optimalSet.has(t));
    const added = optimalTags.filter(t => !currentSet.has(t));

    if (removed.length > 0 || added.length > 0) {
      changes.push({
        product,
        removed,
        added,
        before: currentTags,
        after: optimalTags,
      });

      if (!dryRun) {
        try {
          await api.updateProduct(product.id, {
            id: product.id,
            tags: optimalTags.join(', '),
          });
          updated++;
          console.log(`  Updated: ${product.title}`);
        } catch (error) {
          console.log(`  Error updating ${product.title}: ${error.message}`);
        }
      } else {
        updated++;
      }
    } else {
      unchanged++;
    }
  }

  // Report
  log(`\nTag cleanup summary:`, 'cyan');
  console.log(`  Products to update: ${updated}`);
  console.log(`  Products unchanged: ${unchanged}`);

  if (changes.length > 0 && dryRun) {
    console.log('\nSample changes (first 5):');
    for (const change of changes.slice(0, 5)) {
      console.log(`\n  ${change.product.title}`);
      if (change.removed.length > 0) {
        console.log(`    Remove: ${change.removed.join(', ')}`);
      }
      if (change.added.length > 0) {
        console.log(`    Add: ${change.added.join(', ')}`);
      }
    }
  }

  return { updated, unchanged, changes };
}

// ============================================================================
// COLLECTION MANAGEMENT
// ============================================================================

async function getExistingCollections() {
  logSection('FETCHING EXISTING COLLECTIONS');

  const smartCollections = await api.getCollections('smart');
  const customCollections = await api.getCollections('custom');

  const collectionsByHandle = {};

  for (const col of smartCollections.smart_collections || []) {
    collectionsByHandle[col.handle] = { ...col, type: 'smart' };
  }

  for (const col of customCollections.custom_collections || []) {
    collectionsByHandle[col.handle] = { ...col, type: 'custom' };
  }

  log(`Found ${Object.keys(collectionsByHandle).length} collections`, 'cyan');

  return collectionsByHandle;
}

async function createOrUpdateCollections(existingCollections, dryRun = true) {
  logSection('CREATING/UPDATING COLLECTIONS');

  if (dryRun) {
    log('DRY RUN MODE - No changes will be made', 'yellow');
  }

  const results = {
    created: [],
    updated: [],
    skipped: [],
    errors: [],
  };

  // Combine all collection configs
  const allCollections = [
    config.collections.main,
    ...config.collections.categories,
    ...config.collections.accessories,
  ];

  for (const collectionConfig of allCollections) {
    const existing = existingCollections[collectionConfig.handle];

    if (existing) {
      // Check if rules match
      const rulesMatch = JSON.stringify(existing.rules) === JSON.stringify(collectionConfig.rules);

      if (rulesMatch) {
        results.skipped.push(collectionConfig);
        console.log(`  Skipped (exists): ${collectionConfig.title}`);
      } else {
        // Update existing collection
        if (!dryRun) {
          try {
            await api.updateSmartCollection(existing.id, {
              id: existing.id,
              title: collectionConfig.title,
              rules: collectionConfig.rules,
              disjunctive: collectionConfig.disjunctive || false,
            });
            results.updated.push(collectionConfig);
            log(`  Updated: ${collectionConfig.title}`, 'blue');
          } catch (error) {
            results.errors.push({ config: collectionConfig, error: error.message });
            log(`  Error updating ${collectionConfig.title}: ${error.message}`, 'red');
          }
        } else {
          results.updated.push(collectionConfig);
          console.log(`  Would update: ${collectionConfig.title}`);
        }
      }
    } else {
      // Create new collection
      if (!dryRun) {
        try {
          const result = await api.createSmartCollection({
            title: collectionConfig.title,
            handle: collectionConfig.handle,
            rules: collectionConfig.rules,
            disjunctive: collectionConfig.disjunctive || false,
            published: true,
          });

          if (result.smart_collection) {
            results.created.push(collectionConfig);
            log(`  Created: ${collectionConfig.title}`, 'green');
          } else {
            results.errors.push({ config: collectionConfig, error: JSON.stringify(result.errors) });
            log(`  Error creating ${collectionConfig.title}: ${JSON.stringify(result.errors)}`, 'red');
          }
        } catch (error) {
          results.errors.push({ config: collectionConfig, error: error.message });
          log(`  Error creating ${collectionConfig.title}: ${error.message}`, 'red');
        }
      } else {
        results.created.push(collectionConfig);
        console.log(`  Would create: ${collectionConfig.title}`);
      }
    }
  }

  // Brand collections
  for (const brandConfig of config.collections.brands) {
    const existing = existingCollections[brandConfig.handle];
    const rules = [
      { column: 'tag', relation: 'equals', condition: brandConfig.tag },
      { column: 'vendor', relation: 'equals', condition: config.vendor },
    ];

    if (!existing) {
      if (!dryRun) {
        try {
          await api.createSmartCollection({
            title: brandConfig.title,
            handle: brandConfig.handle,
            rules,
            disjunctive: false,
            published: true,
          });
          results.created.push(brandConfig);
          log(`  Created brand: ${brandConfig.title}`, 'green');
        } catch (error) {
          results.errors.push({ config: brandConfig, error: error.message });
        }
      } else {
        results.created.push(brandConfig);
        console.log(`  Would create brand: ${brandConfig.title}`);
      }
    } else {
      results.skipped.push(brandConfig);
    }
  }

  // Feature collections
  for (const featureConfig of config.collections.features) {
    const existing = existingCollections[featureConfig.handle];
    const rules = [
      { column: 'tag', relation: 'equals', condition: featureConfig.tag },
      { column: 'vendor', relation: 'equals', condition: config.vendor },
    ];

    if (!existing) {
      if (!dryRun) {
        try {
          await api.createSmartCollection({
            title: featureConfig.title,
            handle: featureConfig.handle,
            rules,
            disjunctive: false,
            published: true,
          });
          results.created.push(featureConfig);
          log(`  Created feature: ${featureConfig.title}`, 'green');
        } catch (error) {
          results.errors.push({ config: featureConfig, error: error.message });
        }
      } else {
        results.created.push(featureConfig);
        console.log(`  Would create feature: ${featureConfig.title}`);
      }
    } else {
      results.skipped.push(featureConfig);
    }
  }

  // Summary
  log(`\nCollection summary:`, 'cyan');
  console.log(`  Created: ${results.created.length}`);
  console.log(`  Updated: ${results.updated.length}`);
  console.log(`  Skipped: ${results.skipped.length}`);
  console.log(`  Errors: ${results.errors.length}`);

  return results;
}

// ============================================================================
// MENU MANAGEMENT
// ============================================================================

async function analyzeMenuStructure() {
  logSection('ANALYZING MENU STRUCTURE');

  const result = await api.getMenus();

  if (result.errors) {
    log(`GraphQL errors: ${JSON.stringify(result.errors)}`, 'red');
    return null;
  }

  const menus = result.data?.menus?.edges || [];

  if (menus.length === 0) {
    log('No menus found in store', 'yellow');
    return { menus: [] };
  }

  console.log(`\nFound ${menus.length} menus:`);

  for (const { node: menu } of menus) {
    console.log(`\n  ${menu.title} (handle: ${menu.handle})`);

    const items = menu.items?.edges || [];
    for (const { node: item } of items) {
      const status = item.url ? '✓' : '⚠';
      console.log(`    ${status} ${item.title}: ${item.url || '(no URL)'}`);

      const subItems = item.items?.edges || [];
      for (const { node: subItem } of subItems) {
        const subStatus = subItem.url ? '✓' : '⚠';
        console.log(`      ${subStatus} ${subItem.title}: ${subItem.url || '(no URL)'}`);
      }
    }
  }

  return { menus };
}

async function createSmokeVapeMenu(dryRun = true) {
  logSection('CREATING SMOKE & VAPE MENU');

  if (dryRun) {
    log('DRY RUN MODE - No changes will be made', 'yellow');
  }

  const menuConfig = config.menuStructure.main;

  // Convert menu config to GraphQL input format
  function convertMenuItem(item) {
    const menuItem = {
      title: item.title,
      url: item.url,
      type: item.url.startsWith('/collections') ? 'COLLECTION' : item.url === '#' ? 'HTTP' : 'HTTP',
    };

    if (item.children && item.children.length > 0) {
      menuItem.items = item.children.map(convertMenuItem);
    }

    return menuItem;
  }

  const menuItems = menuConfig.items.map(convertMenuItem);

  console.log('\nProposed menu structure:');
  console.log(JSON.stringify(menuItems, null, 2));

  if (!dryRun) {
    try {
      const result = await api.createMenu(menuConfig.handle, menuConfig.title, menuItems);

      if (result.data?.menuCreate?.menu) {
        log(`\nMenu created successfully: ${result.data.menuCreate.menu.id}`, 'green');
      } else if (result.data?.menuCreate?.userErrors?.length > 0) {
        log(`\nMenu creation errors:`, 'red');
        for (const error of result.data.menuCreate.userErrors) {
          console.log(`  ${error.field}: ${error.message}`);
        }
      } else {
        log(`\nUnexpected response: ${JSON.stringify(result)}`, 'yellow');
      }
    } catch (error) {
      log(`\nError creating menu: ${error.message}`, 'red');
    }
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  const skipTags = args.includes('--skip-tags');
  const skipCollections = args.includes('--skip-collections');
  const skipMenus = args.includes('--skip-menus');

  console.log('\n' + '═'.repeat(70));
  log('  SHOPIFY COLLECTION STRATEGY BOT', 'bright');
  log(`  Store: ${config.shopify.storeUrl}`, 'cyan');
  log(`  Vendor: ${config.vendor}`, 'cyan');
  log(`  Mode: ${dryRun ? 'DRY RUN (use --execute to make changes)' : 'EXECUTING CHANGES'}`, dryRun ? 'yellow' : 'green');
  console.log('═'.repeat(70));

  try {
    // Step 1: Fetch all products
    logSection('STEP 1: FETCHING PRODUCTS');
    const products = await api.getAllProductsByVendor(config.vendor);
    log(`Fetched ${products.length} products from "${config.vendor}"`, 'green');

    // Step 2: Analyze tags
    if (!skipTags) {
      const analysis = analyzeProductTags(products);

      // Step 3: Clean up tags
      logSection('STEP 3: TAG OPTIMIZATION');
      await cleanupProductTags(products, dryRun);
    }

    // Step 4: Manage collections
    if (!skipCollections) {
      logSection('STEP 4: COLLECTION MANAGEMENT');
      const existingCollections = await getExistingCollections();
      await createOrUpdateCollections(existingCollections, dryRun);
    }

    // Step 5: Analyze and fix menus
    if (!skipMenus) {
      logSection('STEP 5: MENU MANAGEMENT');
      await analyzeMenuStructure();
      await createSmokeVapeMenu(dryRun);
    }

    // Final summary
    logSection('COMPLETE');
    if (dryRun) {
      log('\nThis was a DRY RUN. To execute changes, run with --execute flag:', 'yellow');
      console.log('  node src/collection-strategy-bot.js --execute');
    } else {
      log('\nAll changes have been applied successfully!', 'green');
    }

  } catch (error) {
    log(`\nFatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run the bot
main();
