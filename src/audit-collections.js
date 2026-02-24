#!/usr/bin/env node
/**
 * Collection Auditor - Human-Style Collection Audit
 *
 * Goes through EVERY collection one at a time, acting like a human auditor:
 * 1. Fetches the collection's current products
 * 2. Checks if any products are MISSING (should be there based on title, but aren't)
 * 3. Checks if any products are WRONGLY INCLUDED (in the collection but shouldn't be)
 * 4. Generates a fix script for all issues found
 *
 * Usage:
 *   node src/audit-collections.js                  # Full audit (dry run)
 *   node src/audit-collections.js --fix            # Apply tag fixes
 *   node src/audit-collections.js --collection ashtrays  # Audit single collection
 */

import 'dotenv/config';
import { config } from './config.js';
import api from './shopify-api.js';

// ANSI colors
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(msg, color = '') { console.log(`${color}${msg}${C.reset}`); }
function header(title) {
  console.log('\n' + '='.repeat(72));
  log(title, C.bold);
  console.log('='.repeat(72));
}
function subheader(title) {
  console.log('\n' + '-'.repeat(60));
  log(title, C.cyan);
  console.log('-'.repeat(60));
}

// ============================================================================
// COLLECTION -> TITLE KEYWORD MAPPING
//
// For each collection, define what product title keywords SHOULD match.
// This is the core of the audit: if a product title contains these keywords
// but lacks the required tag, it's MISSING from the collection.
// ============================================================================

const COLLECTION_AUDIT_RULES = {
  // === DEVICE COLLECTIONS ===
  'ashtrays': {
    requiredTag: 'family:ashtray',
    titleKeywords: ['ashtray', 'ash tray'],
    excludeKeywords: ['ash catcher'],
    description: 'Ashtrays - for holding ash, not ash catchers',
  },
  'bongs-water-pipes': {
    requiredTag: 'family:glass-bong',
    titleKeywords: ['bong', 'water pipe', 'beaker', 'straight tube'],
    excludeKeywords: ['silicone bong', 'silicone water pipe', 'silicone beaker', 'bowl', 'downstem', 'ash catcher', 'adapter'],
    description: 'Glass bongs and water pipes (not silicone)',
  },
  'dab-rigs': {
    requiredTag: 'family:glass-rig',
    titleKeywords: ['dab rig', 'oil rig', 'recycler', 'mini rig'],
    excludeKeywords: ['silicone rig', 'e-rig', 'electric rig', 'banger', 'carb cap', 'dab tool', 'dab mat', 'dab container', 'dab pad'],
    description: 'Glass dab rigs (not silicone, not e-rigs)',
  },
  'hand-pipes': {
    requiredTag: 'family:spoon-pipe',
    titleKeywords: ['hand pipe', 'spoon pipe', 'spoon', 'sherlock', 'glass pipe'],
    excludeKeywords: ['silicone hand pipe', 'silicone pipe', 'water pipe', 'pipe cleaner', 'bong'],
    description: 'Glass hand pipes / spoon pipes',
  },
  'bubblers': {
    requiredTag: 'family:bubbler',
    titleKeywords: ['bubbler'],
    excludeKeywords: ['silicone bubbler'],
    description: 'Glass bubblers',
  },
  'nectar-collectors': {
    requiredTag: 'family:nectar-collector',
    titleKeywords: ['nectar collector', 'nectar straw', 'honey straw', 'dab straw'],
    excludeKeywords: [],
    description: 'Nectar collectors / dab straws',
  },
  'one-hitters-chillums': {
    requiredTag: 'family:chillum-onehitter',
    titleKeywords: ['one hitter', 'one-hitter', 'chillum', 'dugout', 'bat pipe'],
    excludeKeywords: [],
    description: 'One hitters, chillums, and dugouts',
  },
  'steamrollers': {
    requiredTag: 'family:steamroller',
    titleKeywords: ['steamroller', 'steam roller'],
    excludeKeywords: [],
    description: 'Steamroller pipes',
  },
  'silicone-rigs-bongs': {
    requiredTags: ['material:silicone', 'pillar:smokeshop-device'],
    titleKeywords: ['silicone rig', 'silicone bong', 'silicone water pipe', 'silicone beaker',
                    'silicone bubbler', 'silicone hand pipe', 'silicone pipe', 'silicone nectar'],
    excludeKeywords: ['silicone container', 'silicone jar', 'silicone pad', 'silicone mat',
                      'silicone ashtray', 'silicone tip'],
    description: 'Silicone smoking devices (rigs, bongs, pipes)',
  },
  'novelty-character-pipes': {
    requiredTag: 'style:animal',
    titleKeywords: [],  // This is style-based, not title-based
    excludeKeywords: [],
    description: 'Novelty / character / animal themed pipes',
  },

  // === ACCESSORY COLLECTIONS ===
  'quartz-bangers': {
    requiredTags: ['family:banger', 'material:quartz'],
    titleKeywords: ['quartz banger', 'quartz nail', 'terp slurper'],
    excludeKeywords: ['titanium nail', 'ceramic nail', 'titanium banger', 'ceramic banger'],
    description: 'Quartz bangers and nails only (not titanium/ceramic)',
  },
  'carb-caps': {
    requiredTag: 'family:carb-cap',
    titleKeywords: ['carb cap', 'carb-cap', 'carbcap', 'directional cap', 'spinner cap', 'bubble cap'],
    excludeKeywords: [],
    description: 'Carb caps for dab rigs',
  },
  'dab-tools': {
    requiredTag: 'family:dab-tool',
    titleKeywords: ['dab tool', 'dabber', 'dab pick', 'terp pearl', 'quartz insert',
                    'control tower', 'titanium dab'],
    excludeKeywords: ['dab rig', 'dab mat', 'dab container', 'dab straw', 'dab pad'],
    description: 'Dab tools, dabbers, inserts, terp pearls',
  },
  'flower-bowls': {
    requiredTag: 'family:flower-bowl',
    titleKeywords: ['flower bowl', 'bowl piece', 'slide bowl', 'glass bowl', 'funnel bowl',
                    'snapper bowl', 'push bowl'],
    // Exclude hand pipes that "come with" a glass bowl - they aren't standalone bowls
    excludeKeywords: ['grinder', 'hand pipe', 'w/ glass bowl', 'w/ bowl'],
    description: 'Flower bowls / slide bowls for bongs',
  },
  'ash-catchers': {
    requiredTag: 'family:ash-catcher',
    titleKeywords: ['ash catcher', 'ashcatcher'],
    excludeKeywords: ['ashtray'],
    description: 'Ash catchers (bong attachments)',
  },
  'downstems': {
    requiredTag: 'family:downstem',
    titleKeywords: ['downstem', 'down stem', 'diffuser stem'],
    excludeKeywords: ['drop down', 'dropdown', 'adapter'],
    description: 'Downstems for bongs',
  },
  'torches': {
    requiredTag: 'family:torch',
    titleKeywords: ['torch', 'butane torch', 'jet torch', 'creme brulee torch'],
    excludeKeywords: ['torch lighter'],
    description: 'Torches for dabbing',
  },
  'grinders': {
    requiredTag: 'family:grinder',
    titleKeywords: ['grinder', 'herb grinder', 'weed grinder'],
    excludeKeywords: [],
    description: 'Herb grinders',
  },
  'rolling-papers-cones': {
    requiredTag: 'family:rolling-paper',
    titleKeywords: ['rolling paper', 'rolling cone', 'pre-roll', 'pre roll',
                    'blunt wrap', 'cone ', 'cones ', 'paper tips', 'filter tips',
                    'king size', 'booklet', 'ultra thin'],
    excludeKeywords: ['silicone', 'bong', 'pipe', 'rig', 'grinder', 'parchment paper', 'ptfe',
                      'fep', 'paper towel'],
    description: 'Rolling papers, cones, wraps, tips',
  },
  'vapes-electronics': {
    requiredTag: 'use:vaping',
    titleKeywords: ['vape', '510 battery', 'vaporizer', 'e-rig', 'electric rig',
                    'cbd battery', 'battery device'],
    // NOTE: 'lookah' and 'puffco' removed as keywords because they match brand accessories
    // (carb caps, pendants) that aren't vapes. Lookah/Puffco DEVICES are caught by
    // 'vaporizer', 'electric rig', 'vape', and mAh-based detection.
    excludeKeywords: ['vape cleaner', 'pendant', 'carb cap', 'necklace'],
    description: 'Vapes, batteries, and electronic smoking devices',
  },
  'storage-containers': {
    requiredTag: 'use:storage',
    titleKeywords: ['stash jar', 'storage container', 'stash box', 'smell proof',
                    'lock box', 'lockbox'],
    excludeKeywords: ['glass jar', 'concentrate', 'mylar', 'joint tube', 'doob tube'],
    description: 'Storage containers and stash boxes',
  },
  'adapters': {
    requiredTag: 'family:adapter',
    titleKeywords: ['adapter', 'drop down', 'dropdown', 'converter', 'reducer'],
    excludeKeywords: [],
    description: 'Adapters and drop downs for bongs/rigs',
  },
  'cleaning-supplies': {
    requiredTag: 'family:cleaning-supply',
    titleKeywords: ['glass cleaner', 'pipe cleaner', 'cleaning solution', 'isopropyl',
                    'cleaning brush', 'grunge off', 'res gel', 'bong cleaner'],
    excludeKeywords: [],
    description: 'Cleaning supplies for glass',
  },
  'trays-work-surfaces': {
    requiredTag: 'family:rolling-tray',
    titleKeywords: ['rolling tray', ' tray'],
    excludeKeywords: ['ashtray', 'ash tray', 'display'],
    description: 'Rolling trays and work surfaces',
  },
  'glass-pendants': {
    requiredTag: 'family:merch-pendant',
    titleKeywords: ['pendant', 'necklace'],
    excludeKeywords: [],
    description: 'Glass pendants and necklaces',
  },

  // === EXTRACTION & PACKAGING ===
  'fep-sheets': {
    requiredTag: 'material:fep',
    titleKeywords: ['fep'],
    excludeKeywords: [],
    description: 'FEP sheets, rolls, and films',
    vendor: 'Oil Slick',
  },
  'ptfe-sheets': {
    requiredTag: 'material:ptfe',
    titleKeywords: ['ptfe'],
    excludeKeywords: [],
    description: 'PTFE sheets, rolls, and films',
    vendor: 'Oil Slick',
  },
  'silicone-pads': {
    requiredTag: 'family:silicone-pad',
    titleKeywords: ['silicone pad', 'silicone mat', 'dab mat', 'oil slick pad',
                    'oil slick slab', 'dab pad'],
    excludeKeywords: [],
    description: 'Silicone pads and dab mats',
    vendor: 'Oil Slick',
  },
  'parchment-paper': {
    requiredTag: 'material:parchment',
    titleKeywords: ['parchment'],
    excludeKeywords: [],
    description: 'Parchment paper for extraction',
    vendor: 'Oil Slick',
  },
  'glass-jars': {
    requiredTag: 'family:glass-jar',
    titleKeywords: ['glass jar'],
    excludeKeywords: ['silicone jar'],
    description: 'Glass jars for concentrate storage',
    vendor: 'Oil Slick',
  },
  'concentrate-containers': {
    requiredTag: 'family:container',
    titleKeywords: ['concentrate container', 'non-stick container', 'nonstick container',
                    'non stick container', 'dab container', 'wax container', 'oil container',
                    'silicone container', 'silicone jar', 'concentrate jar', 'extract jar'],
    excludeKeywords: ['glass jar'],
    description: 'Concentrate containers (silicone/non-stick)',
    vendor: 'Oil Slick',
  },
  'mylar-bags': {
    requiredTag: 'family:mylar-bag',
    titleKeywords: ['mylar bag', 'mylar pouch'],
    excludeKeywords: [],
    description: 'Mylar bags for packaging',
    vendor: 'Oil Slick',
  },
  'joint-tubes': {
    requiredTag: 'family:joint-tube',
    titleKeywords: ['joint tube', 'doob tube', 'pre-roll tube', 'pre roll tube'],
    excludeKeywords: [],
    description: 'Joint tubes and doob tubes',
    vendor: 'Oil Slick',
  },
};

// ============================================================================
// AUDIT ENGINE
// ============================================================================

async function fetchAllProducts() {
  header('FETCHING ALL PRODUCTS');

  const vendors = ['What You Need', 'Oil Slick', 'Cloud YHS'];
  const allProducts = [];

  for (const vendor of vendors) {
    try {
      const products = await api.getAllProductsByVendor(vendor);
      log(`  ${vendor}: ${products.length} products`, C.green);
      allProducts.push(...products);
    } catch (e) {
      log(`  ${vendor}: skipped (${e.message})`, C.yellow);
    }
  }

  log(`\nTotal products fetched: ${allProducts.length}`, C.bold);
  return allProducts;
}

function getProductTags(product) {
  return product.tags ? product.tags.split(',').map(t => t.trim()) : [];
}

function hasTag(product, tag) {
  return getProductTags(product).includes(tag);
}

function hasAllTags(product, tags) {
  const productTags = getProductTags(product);
  return tags.every(t => productTags.includes(t));
}

function titleContains(product, keyword) {
  return product.title.toLowerCase().includes(keyword.toLowerCase());
}

function titleMatchesAny(product, keywords) {
  const title = product.title.toLowerCase();
  return keywords.some(kw => title.includes(kw.toLowerCase()));
}

function titleMatchesExclude(product, excludeKeywords) {
  if (!excludeKeywords || excludeKeywords.length === 0) return false;
  const title = product.title.toLowerCase();
  return excludeKeywords.some(kw => title.includes(kw.toLowerCase()));
}

/**
 * Audit a single collection.
 * Returns { missing: [...], wronglyIncluded: [...], correct: [...] }
 */
function auditCollection(collectionHandle, allProducts, rule) {
  const requiredTags = rule.requiredTags || (rule.requiredTag ? [rule.requiredTag] : []);
  const expectedVendor = rule.vendor || 'What You Need';

  // Products that HAVE the required tags (are in the collection)
  const inCollection = allProducts.filter(p => {
    const matchesTags = hasAllTags(p, requiredTags);
    // For vendor-specific collections, also check vendor
    if (rule.vendor) {
      return matchesTags && p.vendor === rule.vendor;
    }
    // Most collections also require vendor = What You Need in their rules
    // but some (like concentrate-jars) are cross-vendor
    return matchesTags;
  });

  // Products whose TITLE suggests they should be in the collection but LACK the tag
  const missing = [];
  if (rule.titleKeywords && rule.titleKeywords.length > 0) {
    for (const product of allProducts) {
      // Skip if already in collection
      if (hasAllTags(product, requiredTags)) continue;

      // Check vendor match
      if (rule.vendor && product.vendor !== rule.vendor) continue;
      if (!rule.vendor && product.vendor !== 'What You Need') continue;

      // Check title match
      if (!titleMatchesAny(product, rule.titleKeywords)) continue;

      // Check exclusions
      if (titleMatchesExclude(product, rule.excludeKeywords)) continue;

      missing.push({
        product,
        reason: `Title contains keyword but missing tag(s): ${requiredTags.join(', ')}`,
        missingTags: requiredTags.filter(t => !hasTag(product, t)),
      });
    }
  }

  // Products IN the collection whose title is suspicious (might be wrong)
  const suspicious = [];
  for (const product of inCollection) {
    // Check if this product's title suggests it belongs to a DIFFERENT collection
    const title = product.title.toLowerCase();

    // Specific cross-checks for common mis-tagging
    if (collectionHandle === 'flower-bowls') {
      if (title.includes('nectar') || title.includes('straw')) {
        suspicious.push({ product, reason: 'Title suggests nectar collector, not flower bowl' });
      }
      if (title.includes('banger') || title.includes('quartz nail')) {
        suspicious.push({ product, reason: 'Title suggests banger, not flower bowl' });
      }
      if (title.includes('ash catcher')) {
        suspicious.push({ product, reason: 'Title suggests ash catcher, not flower bowl' });
      }
    }
    if (collectionHandle === 'dab-tools') {
      if (title.includes('dab rig') || title.includes('oil rig')) {
        suspicious.push({ product, reason: 'Title suggests dab rig, not dab tool' });
      }
    }
    if (collectionHandle === 'hand-pipes') {
      if (title.includes('water pipe') || title.includes('bong')) {
        suspicious.push({ product, reason: 'Title suggests water pipe/bong, not hand pipe' });
      }
    }
    if (collectionHandle === 'ashtrays') {
      if (title.includes('ash catcher')) {
        suspicious.push({ product, reason: 'Title suggests ash catcher, not ashtray' });
      }
    }
    if (collectionHandle === 'rolling-papers-cones') {
      if (title.includes('silicone')) {
        suspicious.push({ product, reason: 'Silicone product tagged as rolling paper' });
      }
    }
  }

  return {
    handle: collectionHandle,
    description: rule.description,
    requiredTags,
    totalInCollection: inCollection.length,
    inCollection,
    missing,
    suspicious,
  };
}

// ============================================================================
// TAG FIX GENERATOR
// ============================================================================

function generateTagFixes(auditResults) {
  const fixes = new Map(); // productId -> { product, tagsToAdd: Set, tagsToRemove: Set }

  for (const result of auditResults) {
    for (const { product, missingTags } of result.missing) {
      if (!fixes.has(product.id)) {
        fixes.set(product.id, {
          product,
          tagsToAdd: new Set(),
          tagsToRemove: new Set(),
          reasons: [],
        });
      }
      const fix = fixes.get(product.id);
      for (const tag of missingTags) {
        fix.tagsToAdd.add(tag);
      }
      fix.reasons.push(`Missing from ${result.handle}: needs ${missingTags.join(', ')}`);
    }
  }

  return fixes;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function printAuditResult(result) {
  subheader(`COLLECTION: ${result.handle}`);
  log(`  ${result.description}`, C.dim);
  log(`  Required tags: ${result.requiredTags.join(' + ')}`, C.dim);
  log(`  Products in collection: ${result.totalInCollection}`, C.cyan);

  if (result.missing.length === 0 && result.suspicious.length === 0) {
    log('  STATUS: CLEAN - No issues found', C.green);
    return;
  }

  if (result.missing.length > 0) {
    log(`\n  MISSING PRODUCTS (${result.missing.length}):`, C.red);
    log(`  These products should be in "${result.handle}" based on their title,`, C.red);
    log(`  but they lack the required tag(s).`, C.red);
    for (const { product, missingTags } of result.missing) {
      console.log(`    - "${product.title}" (ID: ${product.id})`);
      console.log(`      Missing tags: ${missingTags.join(', ')}`);
      const currentTags = getProductTags(product)
        .filter(t => t.startsWith('family:') || t.startsWith('material:') || t.startsWith('pillar:') || t.startsWith('use:'))
        .join(', ');
      console.log(`      Current relevant tags: ${currentTags || '(none)'}`);
    }
  }

  if (result.suspicious.length > 0) {
    log(`\n  SUSPICIOUS PRODUCTS (${result.suspicious.length}):`, C.yellow);
    log(`  These products are IN the collection but their title suggests they might be mis-tagged.`, C.yellow);
    for (const { product, reason } of result.suspicious) {
      console.log(`    - "${product.title}" (ID: ${product.id})`);
      console.log(`      Concern: ${reason}`);
    }
  }
}

// ============================================================================
// APPLY FIXES
// ============================================================================

async function applyFixes(fixes, dryRun = true) {
  header('APPLYING TAG FIXES');

  if (dryRun) {
    log('DRY RUN MODE - No changes will be made. Use --fix to apply.', C.yellow);
  }

  let fixed = 0;
  let errors = 0;

  for (const [productId, fix] of fixes) {
    const currentTags = getProductTags(fix.product);
    const newTags = new Set(currentTags);

    for (const tag of fix.tagsToAdd) {
      newTags.add(tag);
    }
    for (const tag of fix.tagsToRemove) {
      newTags.delete(tag);
    }

    const updatedTags = Array.from(newTags).join(', ');

    console.log(`\n  "${fix.product.title}" (ID: ${productId})`);
    for (const reason of fix.reasons) {
      console.log(`    ${reason}`);
    }
    if (fix.tagsToAdd.size > 0) {
      log(`    + Adding: ${Array.from(fix.tagsToAdd).join(', ')}`, C.green);
    }
    if (fix.tagsToRemove.size > 0) {
      log(`    - Removing: ${Array.from(fix.tagsToRemove).join(', ')}`, C.red);
    }

    if (!dryRun) {
      try {
        await api.updateProduct(productId, {
          id: productId,
          tags: updatedTags,
        });
        log(`    FIXED`, C.green);
        fixed++;
      } catch (e) {
        log(`    ERROR: ${e.message}`, C.red);
        errors++;
      }
    } else {
      fixed++;
    }
  }

  console.log(`\n--- FIX SUMMARY ---`);
  log(`Products to fix: ${fixes.size}`, C.cyan);
  log(`Fixed: ${fixed}`, C.green);
  if (errors > 0) log(`Errors: ${errors}`, C.red);

  return { fixed, errors };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const applyMode = args.includes('--fix');
  const singleCollection = args.find((a, i) => args[i - 1] === '--collection');

  console.log('\n' + '='.repeat(72));
  log('  COLLECTION AUDITOR - Human-Style Audit', C.bold);
  log(`  Store: ${config.shopify.storeUrl}`, C.cyan);
  log(`  Mode: ${applyMode ? 'FIX (will apply changes)' : 'AUDIT ONLY (use --fix to apply)'}`, applyMode ? C.green : C.yellow);
  if (singleCollection) log(`  Auditing single collection: ${singleCollection}`, C.cyan);
  console.log('='.repeat(72));

  // Step 1: Fetch all products
  const allProducts = await fetchAllProducts();

  // Step 2: Determine which collections to audit
  const collectionsToAudit = singleCollection
    ? { [singleCollection]: COLLECTION_AUDIT_RULES[singleCollection] }
    : COLLECTION_AUDIT_RULES;

  if (singleCollection && !COLLECTION_AUDIT_RULES[singleCollection]) {
    log(`\nUnknown collection: "${singleCollection}"`, C.red);
    log('Available collections:', C.cyan);
    for (const handle of Object.keys(COLLECTION_AUDIT_RULES)) {
      console.log(`  ${handle}`);
    }
    process.exit(1);
  }

  // Step 3: Audit each collection one-by-one
  header('AUDITING COLLECTIONS ONE BY ONE');
  const auditResults = [];
  let totalMissing = 0;
  let totalSuspicious = 0;

  for (const [handle, rule] of Object.entries(collectionsToAudit)) {
    const result = auditCollection(handle, allProducts, rule);
    auditResults.push(result);
    printAuditResult(result);
    totalMissing += result.missing.length;
    totalSuspicious += result.suspicious.length;
  }

  // Step 4: Summary
  header('AUDIT SUMMARY');
  console.log(`Collections audited: ${auditResults.length}`);

  const cleanCollections = auditResults.filter(r => r.missing.length === 0 && r.suspicious.length === 0);
  const problemCollections = auditResults.filter(r => r.missing.length > 0 || r.suspicious.length > 0);

  log(`\nClean collections (${cleanCollections.length}):`, C.green);
  for (const r of cleanCollections) {
    console.log(`  ${r.handle} (${r.totalInCollection} products)`);
  }

  if (problemCollections.length > 0) {
    log(`\nCollections with issues (${problemCollections.length}):`, C.red);
    for (const r of problemCollections) {
      const issues = [];
      if (r.missing.length > 0) issues.push(`${r.missing.length} missing`);
      if (r.suspicious.length > 0) issues.push(`${r.suspicious.length} suspicious`);
      console.log(`  ${r.handle}: ${issues.join(', ')}`);
    }
  }

  console.log(`\nTotal missing products: ${totalMissing}`);
  console.log(`Total suspicious products: ${totalSuspicious}`);

  // Step 5: Generate and optionally apply fixes
  if (totalMissing > 0) {
    const fixes = generateTagFixes(auditResults);

    if (applyMode) {
      await applyFixes(fixes, false);
    } else {
      header('PROPOSED FIXES');
      log('The following tag changes would fix the missing products:', C.cyan);
      await applyFixes(fixes, true);
      log(`\nTo apply these fixes, run:`, C.yellow);
      console.log(`  node src/audit-collections.js --fix`);
    }
  } else {
    log('\nNo fixes needed - all collections are clean!', C.green);
  }

  // Step 6: Per-collection product count for reference
  header('COLLECTION PRODUCT COUNTS');
  const sorted = [...auditResults].sort((a, b) => b.totalInCollection - a.totalInCollection);
  for (const r of sorted) {
    const status = r.missing.length > 0 ? `${C.red}[${r.missing.length} missing]${C.reset}` :
                   r.suspicious.length > 0 ? `${C.yellow}[${r.suspicious.length} suspicious]${C.reset}` :
                   `${C.green}[OK]${C.reset}`;
    console.log(`  ${r.handle.padEnd(30)} ${String(r.totalInCollection).padStart(4)} products  ${status}`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
