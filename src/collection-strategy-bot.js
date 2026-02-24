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

  const taxonomy = config.taxonomy;
  const validFamilies = new Set(Object.keys(taxonomy.families));
  const validPillars = new Set(Object.keys(taxonomy.pillars));
  const validUses = new Set(Object.keys(taxonomy.uses));
  const validMaterials = new Set(taxonomy.materials);
  const validBrands = new Set(taxonomy.brands);

  const tagStats = {};
  const productsByFamily = {};
  const productsWithoutFamily = [];
  const productsWithInvalidTags = [];
  const productsWithMismatchedTags = [];
  const productsWithMultipleFamilies = [];
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
    const productFamilies = [];
    const productPillars = [];
    const productUses = [];
    const invalidTags = [];

    for (const tag of tags) {
      tagStats[tag] = (tagStats[tag] || 0) + 1;

      const colonIdx = tag.indexOf(':');
      if (colonIdx === -1) {
        tagPatterns.other.add(tag);
        continue;
      }

      const prefix = tag.substring(0, colonIdx);
      const value = tag.substring(colonIdx + 1);

      if (tagPatterns[prefix]) {
        tagPatterns[prefix].add(tag);
      } else {
        tagPatterns.other.add(tag);
      }

      if (prefix === 'family') {
        hasFamily = true;
        productFamilies.push(value);
        if (!productsByFamily[value]) productsByFamily[value] = [];
        productsByFamily[value].push(product);

        // Validate family value exists in taxonomy
        if (!validFamilies.has(value)) {
          invalidTags.push({ tag, reason: `Unknown family: "${value}" not in taxonomy` });
        }
      }

      if (prefix === 'pillar') {
        productPillars.push(value);
        if (!validPillars.has(value)) {
          invalidTags.push({ tag, reason: `Unknown pillar: "${value}"` });
        }
      }

      if (prefix === 'use') {
        productUses.push(value);
        if (!validUses.has(value)) {
          invalidTags.push({ tag, reason: `Unknown use: "${value}"` });
        }
      }

      if (prefix === 'material' && !validMaterials.has(value)) {
        invalidTags.push({ tag, reason: `Unknown material: "${value}"` });
      }

      if (prefix === 'brand' && !validBrands.has(value)) {
        invalidTags.push({ tag, reason: `Unknown brand: "${value}"` });
      }
    }

    if (!hasFamily) {
      productsWithoutFamily.push(product);
    }

    if (invalidTags.length > 0) {
      productsWithInvalidTags.push({ product, invalidTags });
    }

    if (productFamilies.length > 1) {
      productsWithMultipleFamilies.push({ product, families: productFamilies });
    }

    // Cross-validate family <-> pillar/use
    for (const family of productFamilies) {
      const def = taxonomy.families[family];
      if (!def) continue;

      const mismatches = [];
      if (def.pillar && productPillars.length > 0 && !productPillars.includes(def.pillar)) {
        mismatches.push(`Expected pillar:${def.pillar}, found pillar:${productPillars.join(',')}`);
      }
      if (def.use && productUses.length > 0 && !productUses.includes(def.use)) {
        mismatches.push(`Expected use:${def.use}, found use:${productUses.join(',')}`);
      }
      if (mismatches.length > 0) {
        productsWithMismatchedTags.push({ product, family, mismatches });
      }
    }
  }

  // ---- Report findings ----
  log(`\nTotal products: ${products.length}`, 'cyan');
  log(`Products with family tags: ${products.length - productsWithoutFamily.length}`, 'green');
  log(`Products without family tags: ${productsWithoutFamily.length}`, productsWithoutFamily.length > 0 ? 'yellow' : 'green');

  console.log('\nTag namespace coverage:');
  for (const [category, tags] of Object.entries(tagPatterns)) {
    if (tags.size > 0) {
      console.log(`  ${category}: ${tags.size} unique values`);
    }
  }

  console.log('\nProducts by family:');
  for (const [family, prods] of Object.entries(productsByFamily).sort((a, b) => b[1].length - a[1].length)) {
    const validMarker = validFamilies.has(family) ? '' : ' [NOT IN TAXONOMY]';
    console.log(`  ${family}: ${prods.length} products${validMarker}`);
  }

  // Invalid tags report
  if (productsWithInvalidTags.length > 0) {
    log(`\nProducts with invalid tag values: ${productsWithInvalidTags.length}`, 'red');
    for (const { product, invalidTags } of productsWithInvalidTags.slice(0, 10)) {
      console.log(`  - ${product.title} (ID: ${product.id})`);
      for (const { tag, reason } of invalidTags) {
        log(`    ${tag}: ${reason}`, 'yellow');
      }
    }
    if (productsWithInvalidTags.length > 10) {
      console.log(`  ... and ${productsWithInvalidTags.length - 10} more`);
    }
  }

  // Family-pillar/use mismatches
  if (productsWithMismatchedTags.length > 0) {
    log(`\nProducts with family/pillar/use mismatches: ${productsWithMismatchedTags.length}`, 'red');
    for (const { product, family, mismatches } of productsWithMismatchedTags.slice(0, 10)) {
      console.log(`  - ${product.title} (family:${family})`);
      for (const m of mismatches) {
        log(`    ${m}`, 'yellow');
      }
    }
    if (productsWithMismatchedTags.length > 10) {
      console.log(`  ... and ${productsWithMismatchedTags.length - 10} more`);
    }
  }

  // Multiple families
  if (productsWithMultipleFamilies.length > 0) {
    log(`\nProducts with multiple family tags: ${productsWithMultipleFamilies.length}`, 'yellow');
    for (const { product, families } of productsWithMultipleFamilies.slice(0, 10)) {
      console.log(`  - ${product.title}: ${families.map(f => `family:${f}`).join(', ')}`);
    }
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

  // Health score
  const healthPct = Math.round((products.length - productsWithoutFamily.length) / products.length * 100);
  const invalidPct = Math.round(productsWithInvalidTags.length / products.length * 100);
  const mismatchPct = Math.round(productsWithMismatchedTags.length / products.length * 100);

  logSection('TAG HEALTH SCORE');
  log(`  Family coverage: ${healthPct}%`, healthPct >= 95 ? 'green' : healthPct >= 80 ? 'yellow' : 'red');
  log(`  Invalid tags: ${invalidPct}% of products`, invalidPct <= 2 ? 'green' : invalidPct <= 10 ? 'yellow' : 'red');
  log(`  Mismatched tags: ${mismatchPct}% of products`, mismatchPct <= 2 ? 'green' : mismatchPct <= 10 ? 'yellow' : 'red');

  if (healthPct >= 95 && invalidPct <= 2 && mismatchPct <= 2) {
    log('  Overall: HEALTHY', 'green');
  } else if (healthPct >= 80 && invalidPct <= 10 && mismatchPct <= 10) {
    log('  Overall: NEEDS ATTENTION', 'yellow');
  } else {
    log('  Overall: NEEDS FIXING', 'red');
  }

  log('\nRun "node src/metadata-validator.js" for detailed per-product validation', 'cyan');

  return {
    tagStats,
    productsByFamily,
    productsWithoutFamily,
    productsWithInvalidTags,
    productsWithMismatchedTags,
    productsWithMultipleFamilies,
    tagPatterns,
  };
}

function generateOptimalTags(product, analysis) {
  /**
   * Determine optimal tags for a product based on:
   * 1. Existing valid structured tags
   * 2. Family definition cross-references (auto-add pillar/use from family)
   * 3. Title-based inference for missing tags
   * 4. Removal of redundant format tags
   * 5. Removal of legacy tags from tagsToRemove list
   */
  const taxonomy = config.taxonomy;
  const currentTags = product.tags ? product.tags.split(',').map(t => t.trim()) : [];
  const optimalTags = new Set();

  const validPrefixes = ['family', 'material', 'use', 'pillar', 'brand', 'style', 'joint_size', 'joint_gender', 'joint_angle'];

  // Step 1: Keep valid structured tags
  for (const tag of currentTags) {
    const colonIdx = tag.indexOf(':');
    if (colonIdx === -1) continue;
    const prefix = tag.substring(0, colonIdx);
    if (validPrefixes.includes(prefix)) {
      optimalTags.add(tag);
    }
  }

  // Step 2: Remove redundant format tags when family exists
  const families = currentTags.filter(t => t.startsWith('family:'));
  if (families.length > 0) {
    for (const tag of currentTags) {
      if (tag.startsWith('format:')) {
        optimalTags.delete(tag);
      }
    }
  }

  // Step 3: Auto-add missing pillar/use tags based on family definition
  for (const familyTag of families) {
    const familyName = familyTag.substring(7);
    const def = taxonomy.families[familyName];
    if (!def) continue;

    if (def.pillar && !optimalTags.has(`pillar:${def.pillar}`)) {
      optimalTags.add(`pillar:${def.pillar}`);
    }
    if (def.use && !optimalTags.has(`use:${def.use}`)) {
      optimalTags.add(`use:${def.use}`);
    }
  }

  // Step 4: Keep length and bundle tags
  for (const tag of currentTags) {
    if (tag.startsWith('length:') || tag.startsWith('bundle:')) {
      optimalTags.add(tag);
    }
  }

  // Step 5: Remove known legacy/obsolete tags
  if (config.tagsToRemove) {
    for (const tag of config.tagsToRemove) {
      optimalTags.delete(tag);
    }
  }

  // Step 6: Title-based material inference
  const titleLower = (product.title || '').toLowerCase();
  if (titleLower.includes('silicone') && !optimalTags.has('material:silicone')) {
    optimalTags.add('material:silicone');
  }
  if (titleLower.includes('quartz') && !optimalTags.has('material:quartz')) {
    optimalTags.add('material:quartz');
  }
  if (titleLower.includes('titanium') && !optimalTags.has('material:titanium')) {
    optimalTags.add('material:titanium');
  }
  if (titleLower.includes('fep') && !optimalTags.has('material:fep')) {
    optimalTags.add('material:fep');
  }
  if (titleLower.includes('ptfe') && !optimalTags.has('material:ptfe')) {
    optimalTags.add('material:ptfe');
  }
  if (titleLower.includes('parchment') && !optimalTags.has('material:parchment')) {
    optimalTags.add('material:parchment');
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
    ...(config.collections.additionalCategories || []),
    ...(config.collections.extractionCollections || []),
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

    const items = menu.items || [];
    for (const item of items) {
      const status = item.url ? '✓' : '⚠';
      console.log(`    ${status} ${item.title}: ${item.url || '(no URL)'}`);

      const subItems = item.items || [];
      for (const subItem of subItems) {
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
