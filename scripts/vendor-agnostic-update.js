#!/usr/bin/env node
/**
 * Vendor-Agnostic Collection & Product Update Script
 *
 * This script:
 * 1. Updates all smart collections to remove vendor restrictions
 * 2. Tags products from all vendors with proper family/pillar/use tags
 * 3. Fixes incorrect product types
 *
 * Supports vendors: What You Need, Cloud YHS, Oil Slick, YHS, Cloud LA Warehouse, Dharma Distribution
 */

import 'dotenv/config';
import * as api from '../src/shopify-api.js';
import { config } from '../src/config.js';

// ============================================================================
// PRODUCT ANALYSIS RULES (same as comprehensive-product-tagger.js)
// ============================================================================

const PRODUCT_RULES = {
  // DAB RIGS - Small pieces for concentrates
  dabRig: {
    keywords: [
      'dab rig', 'oil rig', 'concentrate rig', 'mini rig', 'pocket rig',
      'recycler', 'incycler', 'klein', 'fab egg', 'terp slurper set',
      'banger hanger', 'sidecar rig'
    ],
    excludeKeywords: ['bong', 'water pipe', 'beaker', 'straight tube', 'bubble base'],
    features: ['typically under 10 inches', '10mm or 14mm joint', 'designed for concentrates'],
    family: 'glass-rig',
    pillar: 'smokeshop-device',
    use: 'dabbing',
    material: 'glass'
  },

  // BONGS - Larger water pipes for flower
  bong: {
    keywords: [
      'bong', 'water pipe', 'beaker', 'straight tube', 'bubble base',
      'scientific bong', 'ice catcher', 'percolator bong', 'tree perc',
      'honeycomb', 'showerhead', 'matrix perc', 'double chamber',
      'triple chamber', 'zong', 'ice bong'
    ],
    excludeKeywords: ['rig', 'recycler', 'incycler', 'dab', 'concentrate', 'nectar'],
    features: ['typically 10+ inches', '14mm or 18mm joint', 'designed for flower'],
    family: 'glass-bong',
    pillar: 'smokeshop-device',
    use: 'flower-smoking',
    material: 'glass'
  },

  // BUBBLERS - Small water pipes, handheld
  bubbler: {
    keywords: [
      'bubbler', 'hammer bubbler', 'sherlock bubbler', 'double bubbler',
      'sidecar bubbler', 'standing bubbler'
    ],
    excludeKeywords: ['bong', 'rig', 'recycler'],
    family: 'bubbler',
    pillar: 'smokeshop-device',
    use: 'flower-smoking',
    material: 'glass'
  },

  // HAND PIPES / SPOONS
  handPipe: {
    keywords: [
      'hand pipe', 'spoon', 'spoon pipe', 'glass pipe', 'bowl pipe',
      'pocket pipe', 'travel pipe', 'frit pipe', 'dichro pipe', 'color changing',
      'inside out', 'heady pipe', 'sherlock', 'gandalf', 'steamroller'
    ],
    excludeKeywords: ['water', 'bubbler', 'bong', 'rig', 'nectar', 'chillum', 'one hitter'],
    family: 'spoon-pipe',
    pillar: 'smokeshop-device',
    use: 'flower-smoking',
    material: 'glass'
  },

  // ONE HITTERS & CHILLUMS
  chillum: {
    keywords: [
      'chillum', 'one hitter', 'onehitter', 'bat', 'taster', 'pinch hitter',
      'cigarette style', 'dugout'
    ],
    family: 'chillum-onehitter',
    pillar: 'smokeshop-device',
    use: 'flower-smoking',
    material: 'glass'
  },

  // NECTAR COLLECTORS
  nectarCollector: {
    keywords: [
      'nectar collector', 'nectar straw', 'honey straw', 'dab straw',
      'concentrate straw', 'vertical dab'
    ],
    family: 'nectar-collector',
    pillar: 'smokeshop-device',
    use: 'dabbing',
    material: 'glass'
  },

  // FLOWER BOWLS
  flowerBowl: {
    keywords: [
      'bowl', 'slide', 'flower bowl', 'replacement bowl', 'horn bowl',
      'funnel bowl', 'martini bowl', 'snapper', '14mm bowl', '18mm bowl', '10mm bowl'
    ],
    excludeKeywords: ['bong', 'pipe', 'bubbler', 'rig', 'carb cap'],
    family: 'flower-bowl',
    pillar: 'accessory',
    use: 'flower-smoking'
  },

  // QUARTZ BANGERS
  banger: {
    keywords: [
      'banger', 'quartz banger', 'nail', 'quartz nail', 'terp slurper',
      'blender', 'core reactor', 'thermal banger', 'opaque bottom',
      'beveled', 'flat top', 'bucket'
    ],
    excludeKeywords: ['set', 'kit', 'rig'],
    family: 'banger',
    pillar: 'accessory',
    use: 'dabbing',
    material: 'quartz'
  },

  // CARB CAPS
  carbCap: {
    keywords: [
      'carb cap', 'spinner cap', 'bubble cap', 'directional cap',
      'terp pearl', 'terp spinner', 'vortex cap', 'ufo cap', 'marble cap'
    ],
    family: 'carb-cap',
    pillar: 'accessory',
    use: 'dabbing'
  },

  // DAB TOOLS
  dabTool: {
    keywords: [
      'dab tool', 'dabber', 'wax tool', 'concentrate tool', 'carving tool',
      'titanium tool', 'scoop', 'pick', 'sword dabber'
    ],
    excludeKeywords: ['kit', 'set', 'rig'],
    family: 'dab-tool',
    pillar: 'accessory',
    use: 'dabbing'
  },

  // TORCHES
  torch: {
    keywords: [
      'torch', 'butane torch', 'jet flame', 'culinary torch', 'blazer',
      'scorch', 'maven', 'lighter torch', 'refillable torch'
    ],
    family: 'torch',
    pillar: 'accessory',
    use: 'dabbing'
  },

  // GRINDERS
  grinder: {
    keywords: [
      'grinder', 'herb grinder', 'crusher', '4 piece', '2 piece', 'shredder',
      'mill', 'chromium crusher'
    ],
    family: 'grinder',
    pillar: 'accessory',
    use: 'preparation'
  },

  // ROLLING PAPERS
  rollingPaper: {
    keywords: [
      'rolling paper', 'papers', 'cone', 'raw paper', 'zig zag', 'elements',
      'vibes', 'king size', '1 1/4', 'hemp wrap', 'blunt wrap', 'filter tip',
      'roller', 'rolling machine', 'tray'
    ],
    family: 'rolling-paper',
    pillar: 'accessory',
    use: 'rolling'
  },

  // ASH CATCHERS
  ashCatcher: {
    keywords: [
      'ash catcher', 'ashcatcher', 'precooler', 'pre-cooler'
    ],
    family: 'ash-catcher',
    pillar: 'accessory',
    use: 'flower-smoking'
  },

  // DOWNSTEMS & ADAPTERS
  downstem: {
    keywords: [
      'downstem', 'down stem', 'adapter', 'drop down', 'dropdown',
      'reducer', 'converter', 'diffuser'
    ],
    family: 'downstem',
    pillar: 'accessory',
    use: 'flower-smoking'
  },

  // VAPE BATTERIES
  vapeBattery: {
    keywords: [
      'battery', '510 battery', 'vape pen', 'cartridge battery', 'cart battery',
      'variable voltage', 'button battery', 'auto draw'
    ],
    excludeKeywords: ['torch', 'lighter'],
    family: 'vape-battery',
    pillar: 'smokeshop-device',
    use: 'vaping'
  },

  // STORAGE
  storage: {
    keywords: [
      'jar', 'container', 'stash', 'storage', 'silicone jar', 'glass jar',
      'smell proof', 'uv jar'
    ],
    excludeKeywords: ['rig', 'pipe', 'bong'],
    family: 'storage-accessory',
    pillar: 'accessory',
    use: 'storage'
  },

  // PENDANTS / MERCH
  pendant: {
    keywords: [
      'pendant', 'necklace', 'glass pendant', 'heady pendant', 'mushroom pendant'
    ],
    family: 'merch-pendant',
    pillar: 'merch'
  },

  // CLEANING SUPPLIES
  cleaning: {
    keywords: [
      'cleaner', 'cleaning', 'grunge off', 'formula 420', 'isopropyl',
      'pipe cleaner', 'brush', 'plug', 'cap'
    ],
    family: 'cleaning-supply',
    pillar: 'accessory',
    use: 'maintenance'
  },

  // EXTRACTION / PACKAGING (for Oil Slick vendor)
  extraction: {
    keywords: [
      'silicone pad', 'silicone mat', 'fep', 'ptfe', 'parchment', 'mylar',
      'concentrate container', 'dab container', 'extraction', 'slick pad',
      'slick sheet', 'nonstick', 'oil slick'
    ],
    family: 'extraction-supply',
    pillar: 'packaging',
    use: 'extraction'
  }
};

// ============================================================================
// PRODUCT ANALYSIS FUNCTIONS
// ============================================================================

function analyzeProduct(product) {
  const title = (product.title || '').toLowerCase();
  const productType = (product.productType || product.product_type || '').toLowerCase();
  // Tags can be array (from GraphQL) or string (from REST API)
  const tagsArray = Array.isArray(product.tags) ? product.tags : (product.tags || '').split(',');
  const tags = tagsArray.map(t => t.trim().toLowerCase()).join(' ');
  const vendor = (product.vendor || '').toLowerCase();
  const combined = `${title} ${productType} ${tags}`;

  // Check for Oil Slick extraction products first
  if (vendor.includes('oil slick') || vendor.includes('extraction')) {
    const extractionRule = PRODUCT_RULES.extraction;
    for (const keyword of extractionRule.keywords) {
      if (combined.includes(keyword.toLowerCase())) {
        return {
          category: 'extraction',
          confidence: 0.95,
          ...extractionRule
        };
      }
    }
  }

  // Height-based detection for rig vs bong
  const heightMatch = title.match(/(\d+(?:\.\d+)?)\s*(?:"|inch|in)/i);
  const height = heightMatch ? parseFloat(heightMatch[1]) : null;

  // Joint size detection
  const jointMatch = title.match(/(\d+)\s*mm/i);
  const jointSize = jointMatch ? parseInt(jointMatch[1]) : null;

  // Check for recycler/incycler (always dab rig)
  if (combined.includes('recycler') || combined.includes('incycler') || combined.includes('klein')) {
    return {
      category: 'dabRig',
      confidence: 0.98,
      reason: 'Recycler/incycler design is always a dab rig',
      ...PRODUCT_RULES.dabRig
    };
  }

  // Check each category
  for (const [categoryName, rule] of Object.entries(PRODUCT_RULES)) {
    let score = 0;
    let matches = [];

    // Check keywords
    for (const keyword of rule.keywords) {
      if (combined.includes(keyword.toLowerCase())) {
        score += 2;
        matches.push(keyword);
      }
    }

    // Check exclude keywords
    if (rule.excludeKeywords) {
      for (const exclude of rule.excludeKeywords) {
        if (combined.includes(exclude.toLowerCase())) {
          score -= 3;
        }
      }
    }

    // Height considerations for bong vs rig
    if (categoryName === 'bong' && height) {
      if (height >= 10) score += 2;
      if (height >= 14) score += 1;
    }
    if (categoryName === 'dabRig' && height) {
      if (height <= 9) score += 2;
      if (height <= 7) score += 1;
    }

    // Joint size considerations
    if (categoryName === 'bong' && jointSize) {
      if (jointSize >= 14) score += 1;
      if (jointSize === 18) score += 2;
    }
    if (categoryName === 'dabRig' && jointSize) {
      if (jointSize <= 14) score += 1;
      if (jointSize === 10) score += 2;
    }

    if (score >= 2 && matches.length > 0) {
      return {
        category: categoryName,
        confidence: Math.min(score / 6, 1),
        matches,
        reason: `Matched keywords: ${matches.join(', ')}`,
        ...rule
      };
    }
  }

  return null;
}

function determineProductType(analysis, product) {
  if (!analysis) return null;

  const typeMap = {
    'dabRig': 'Dab Rig',
    'bong': 'Bong',
    'bubbler': 'Bubbler',
    'handPipe': 'Hand Pipe',
    'chillum': 'One Hitter / Chillum',
    'nectarCollector': 'Nectar Collector',
    'flowerBowl': 'Flower Bowl',
    'banger': 'Quartz Banger',
    'carbCap': 'Carb Cap',
    'dabTool': 'Dab Tool',
    'torch': 'Torch',
    'grinder': 'Grinder',
    'rollingPaper': 'Rolling Paper',
    'ashCatcher': 'Ash Catcher',
    'downstem': 'Downstem',
    'vapeBattery': 'Vape Battery',
    'storage': 'Storage',
    'pendant': 'Pendant',
    'cleaning': 'Cleaning Supply',
    'extraction': 'Extraction Supply'
  };

  return typeMap[analysis.category] || null;
}

function buildProductTags(analysis, existingTags) {
  if (!analysis) return null;

  // Handle tags as array or string
  let currentTags;
  if (Array.isArray(existingTags)) {
    currentTags = existingTags.map(t => t.trim());
  } else {
    currentTags = existingTags ? existingTags.split(',').map(t => t.trim()) : [];
  }
  const newTags = new Set(currentTags);

  // Add family tag
  if (analysis.family) {
    // Remove any existing family tags
    for (const tag of [...newTags]) {
      if (tag.startsWith('family:')) newTags.delete(tag);
    }
    newTags.add(`family:${analysis.family}`);
  }

  // Add pillar tag
  if (analysis.pillar) {
    // Remove any existing pillar tags
    for (const tag of [...newTags]) {
      if (tag.startsWith('pillar:')) newTags.delete(tag);
    }
    newTags.add(`pillar:${analysis.pillar}`);
  }

  // Add use tag
  if (analysis.use) {
    // Remove any existing use tags (but keep multiple if relevant)
    newTags.add(`use:${analysis.use}`);
  }

  // Add material tag if specified
  if (analysis.material) {
    newTags.add(`material:${analysis.material}`);
  }

  return [...newTags].join(', ');
}

// ============================================================================
// COLLECTION UPDATE FUNCTIONS
// ============================================================================

async function getAllSmartCollections() {
  console.log('\nFetching all smart collections...');
  const result = await api.getCollections('smart');
  return result.smart_collections || [];
}

async function updateCollectionToVendorAgnostic(collection) {
  // Check if collection has vendor rule
  const hasVendorRule = collection.rules && collection.rules.some(
    rule => rule.column === 'vendor'
  );

  if (!hasVendorRule) {
    return { skipped: true, reason: 'No vendor rule found' };
  }

  // Remove vendor rules
  const newRules = collection.rules.filter(rule => rule.column !== 'vendor');

  // If no rules left, skip (collection would be empty)
  if (newRules.length === 0) {
    return { skipped: true, reason: 'Would have no rules after removing vendor filter' };
  }

  try {
    await api.updateSmartCollection(collection.id, {
      rules: newRules,
      disjunctive: collection.disjunctive || false
    });
    return { updated: true, oldRules: collection.rules.length, newRules: newRules.length };
  } catch (error) {
    return { error: error.message };
  }
}

// ============================================================================
// PRODUCT UPDATE FUNCTIONS
// ============================================================================

async function getAllProducts() {
  console.log('\nFetching all products from all vendors...');
  const products = [];
  let pageInfo = null;
  let hasNextPage = true;
  let page = 1;

  while (hasNextPage) {
    const query = `
      query($cursor: String) {
        products(first: 250, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              handle
              vendor
              productType
              tags
            }
          }
        }
      }
    `;

    try {
      const result = await api.graphqlQuery(query, { cursor: pageInfo });

      if (result.data && result.data.products) {
        const batch = result.data.products.edges.map(edge => ({
          ...edge.node,
          // Convert GraphQL ID to REST ID
          restId: edge.node.id.replace('gid://shopify/Product/', '')
        }));

        products.push(...batch);
        hasNextPage = result.data.products.pageInfo.hasNextPage;
        pageInfo = result.data.products.pageInfo.endCursor;

        console.log(`  Page ${page}: ${products.length} products fetched...`);
        page++;
      } else {
        hasNextPage = false;
      }
    } catch (error) {
      console.error(`Error fetching products: ${error.message}`);
      hasNextPage = false;
    }
  }

  return products;
}

async function updateProductTagsAndType(product, analysis) {
  const updates = {};
  let changes = [];

  // Build new tags
  const newTags = buildProductTags(analysis, product.tags);
  if (newTags && newTags !== product.tags) {
    updates.tags = newTags;
    changes.push('tags');
  }

  // Determine correct product type
  const correctType = determineProductType(analysis, product);
  const currentType = product.productType || product.product_type;

  // Fix product type if it's wrong or missing
  if (correctType && (!currentType || currentType === 'What You Need' || currentType === 'Cloud YHS' || currentType === 'Oil Slick')) {
    updates.product_type = correctType;
    changes.push('type');
  }

  if (Object.keys(updates).length === 0) {
    return { skipped: true, reason: 'No changes needed' };
  }

  try {
    await api.updateProduct(product.restId, updates);
    return { updated: true, changes };
  } catch (error) {
    return { error: error.message };
  }
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('VENDOR-AGNOSTIC UPDATE SCRIPT');
  console.log('='.repeat(70));
  console.log(`Store: ${config.shopify.storeUrl}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('');

  // PHASE 1: Update Collections
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 1: UPDATING SMART COLLECTIONS');
  console.log('='.repeat(70));

  const collections = await getAllSmartCollections();
  console.log(`Found ${collections.length} smart collections`);

  let collectionsUpdated = 0;
  let collectionsSkipped = 0;
  let collectionsErrored = 0;

  for (const collection of collections) {
    const result = await updateCollectionToVendorAgnostic(collection);

    if (result.updated) {
      console.log(`  [UPDATED] ${collection.title} - removed vendor restriction (${result.oldRules} -> ${result.newRules} rules)`);
      collectionsUpdated++;
    } else if (result.skipped) {
      collectionsSkipped++;
    } else if (result.error) {
      console.log(`  [ERROR] ${collection.title}: ${result.error}`);
      collectionsErrored++;
    }
  }

  console.log(`\nCollection Results: ${collectionsUpdated} updated, ${collectionsSkipped} skipped, ${collectionsErrored} errors`);

  // PHASE 2: Tag and Fix Products
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 2: TAGGING PRODUCTS FROM ALL VENDORS');
  console.log('='.repeat(70));

  const products = await getAllProducts();
  console.log(`\nAnalyzing ${products.length} products...`);

  // Group by vendor for reporting
  const vendorStats = {};
  for (const product of products) {
    const vendor = product.vendor || 'Unknown';
    if (!vendorStats[vendor]) {
      vendorStats[vendor] = { total: 0, updated: 0, skipped: 0, errors: 0, unidentified: 0 };
    }
    vendorStats[vendor].total++;
  }

  console.log('\nVendors found:');
  for (const [vendor, stats] of Object.entries(vendorStats)) {
    console.log(`  - ${vendor}: ${stats.total} products`);
  }

  let productsUpdated = 0;
  let productsSkipped = 0;
  let productsErrored = 0;
  let unidentified = [];

  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const vendor = product.vendor || 'Unknown';

    // Analyze product
    const analysis = analyzeProduct(product);

    if (!analysis) {
      vendorStats[vendor].unidentified++;
      unidentified.push({
        title: product.title,
        vendor: product.vendor,
        type: product.productType
      });
      continue;
    }

    // Update product
    const result = await updateProductTagsAndType(product, analysis);

    if (result.updated) {
      vendorStats[vendor].updated++;
      productsUpdated++;
      if (productsUpdated % 50 === 0) {
        console.log(`  Progress: ${productsUpdated} products updated...`);
      }
    } else if (result.skipped) {
      vendorStats[vendor].skipped++;
      productsSkipped++;
    } else if (result.error) {
      vendorStats[vendor].errors++;
      productsErrored++;
    }
  }

  // RESULTS
  console.log('\n' + '='.repeat(70));
  console.log('FINAL RESULTS');
  console.log('='.repeat(70));

  console.log('\nCollection Updates:');
  console.log(`  Updated: ${collectionsUpdated}`);
  console.log(`  Skipped: ${collectionsSkipped}`);
  console.log(`  Errors: ${collectionsErrored}`);

  console.log('\nProduct Updates by Vendor:');
  for (const [vendor, stats] of Object.entries(vendorStats)) {
    console.log(`\n  ${vendor}:`);
    console.log(`    Total: ${stats.total}`);
    console.log(`    Updated: ${stats.updated}`);
    console.log(`    Already correct: ${stats.skipped}`);
    console.log(`    Unidentified: ${stats.unidentified}`);
    console.log(`    Errors: ${stats.errors}`);
  }

  console.log(`\nTotal Products: ${products.length}`);
  console.log(`  Updated: ${productsUpdated}`);
  console.log(`  Already correct: ${productsSkipped}`);
  console.log(`  Unidentified: ${unidentified.length}`);
  console.log(`  Errors: ${productsErrored}`);

  if (unidentified.length > 0 && unidentified.length <= 50) {
    console.log('\nUnidentified Products (may need manual review):');
    for (const p of unidentified) {
      console.log(`  - [${p.vendor}] ${p.title} (type: ${p.type || 'none'})`);
    }
  } else if (unidentified.length > 50) {
    console.log(`\nUnidentified Products: ${unidentified.length} (too many to list)`);
    console.log('First 20:');
    for (const p of unidentified.slice(0, 20)) {
      console.log(`  - [${p.vendor}] ${p.title}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('UPDATE COMPLETE');
  console.log('='.repeat(70));
}

main().catch(console.error);
