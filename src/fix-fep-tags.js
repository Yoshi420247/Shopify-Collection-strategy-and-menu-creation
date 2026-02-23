#!/usr/bin/env node
/**
 * Fix FEP Product Tags
 *
 * Targeted script that ONLY processes Oil Slick vendor products
 * to add correct FEP/PTFE/extraction material and family tags.
 *
 * Does NOT touch What You Need or Cloud YHS products.
 *
 * Usage:
 *   node src/fix-fep-tags.js              # Dry run (preview changes)
 *   node src/fix-fep-tags.js --execute    # Apply tag fixes to Shopify
 */

import 'dotenv/config';
import { config } from './config.js';
import api from './shopify-api.js';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
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
// FEP/PTFE/EXTRACTION TAG RULES (Oil Slick products only)
// ============================================================================

const FEP_TAG_RULES = [
  // FEP products
  {
    titleContains: 'fep sheet',
    ensureTags: ['material:fep', 'family:fep-sheet', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'fep roll',
    ensureTags: ['material:fep', 'family:fep-sheet', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'fep film',
    ensureTags: ['material:fep', 'family:fep-sheet', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'fep liner',
    ensureTags: ['material:fep', 'family:fep-sheet', 'use:extraction', 'pillar:packaging'],
  },
  // Catch-all: any Oil Slick product with "fep" in the title
  {
    titleContains: 'fep',
    ensureTags: ['material:fep', 'family:fep-sheet', 'use:extraction', 'pillar:packaging'],
  },

  // PTFE products
  {
    titleContains: 'ptfe sheet',
    ensureTags: ['material:ptfe', 'family:ptfe-sheet', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'ptfe roll',
    ensureTags: ['material:ptfe', 'family:ptfe-sheet', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'ptfe film',
    ensureTags: ['material:ptfe', 'family:ptfe-sheet', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'ptfe liner',
    ensureTags: ['material:ptfe', 'family:ptfe-sheet', 'use:extraction', 'pillar:packaging'],
  },
  // Catch-all: any Oil Slick product with "ptfe" in the title
  {
    titleContains: 'ptfe',
    ensureTags: ['material:ptfe', 'family:ptfe-sheet', 'use:extraction', 'pillar:packaging'],
  },

  // Parchment products
  {
    titleContains: 'parchment paper',
    ensureTags: ['material:parchment', 'family:parchment-sheet', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'parchment sheet',
    ensureTags: ['material:parchment', 'family:parchment-sheet', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'parchment roll',
    ensureTags: ['material:parchment', 'family:parchment-sheet', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'parchment',
    ensureTags: ['material:parchment', 'family:parchment-sheet', 'use:extraction', 'pillar:packaging'],
  },

  // Silicone pads/mats (Oil Slick core products)
  {
    titleContains: 'silicone pad',
    ensureTags: ['material:silicone', 'family:silicone-pad', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'silicone mat',
    ensureTags: ['material:silicone', 'family:silicone-pad', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'dab mat',
    ensureTags: ['material:silicone', 'family:silicone-pad', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'oil slick pad',
    ensureTags: ['material:silicone', 'family:silicone-pad', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'oil slick slab',
    ensureTags: ['material:silicone', 'family:silicone-pad', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'slick pad',
    ensureTags: ['material:silicone', 'family:silicone-pad', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'slick sheet',
    ensureTags: ['material:silicone', 'family:silicone-pad', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'slick mat',
    ensureTags: ['material:silicone', 'family:silicone-pad', 'use:extraction', 'pillar:packaging'],
  },
  {
    titleContains: 'slick slab',
    ensureTags: ['material:silicone', 'family:silicone-pad', 'use:extraction', 'pillar:packaging'],
  },

  // Glass jars (extraction packaging)
  {
    titleContains: 'glass jar',
    ensureTags: ['material:glass', 'family:glass-jar', 'use:storage', 'pillar:packaging'],
  },
  {
    titleContains: 'concentrate jar',
    ensureTags: ['family:glass-jar', 'use:storage', 'pillar:packaging'],
  },
  {
    titleContains: 'extract jar',
    ensureTags: ['family:glass-jar', 'use:storage', 'pillar:packaging'],
  },

  // Mylar bags
  {
    titleContains: 'mylar bag',
    ensureTags: ['family:mylar-bag', 'use:storage', 'pillar:packaging'],
  },
  {
    titleContains: 'mylar pouch',
    ensureTags: ['family:mylar-bag', 'use:storage', 'pillar:packaging'],
  },
  {
    titleContains: 'mylar',
    ensureTags: ['family:mylar-bag', 'use:storage', 'pillar:packaging'],
  },

  // Joint tubes / doob tubes
  {
    titleContains: 'joint tube',
    ensureTags: ['family:joint-tube', 'use:storage', 'pillar:packaging'],
  },
  {
    titleContains: 'doob tube',
    ensureTags: ['family:joint-tube', 'use:storage', 'pillar:packaging'],
  },
  {
    titleContains: 'pre-roll tube',
    ensureTags: ['family:joint-tube', 'use:storage', 'pillar:packaging'],
  },

  // Silicone containers (Oil Slick brand)
  {
    titleContains: 'silicone container',
    ensureTags: ['material:silicone', 'family:container', 'use:storage', 'pillar:packaging'],
  },
  {
    titleContains: 'silicone jar',
    ensureTags: ['material:silicone', 'family:container', 'use:storage', 'pillar:packaging'],
  },
  {
    titleContains: 'non-stick container',
    ensureTags: ['material:silicone', 'family:container', 'use:storage', 'pillar:packaging'],
  },
  {
    titleContains: 'nonstick container',
    ensureTags: ['material:silicone', 'family:container', 'use:storage', 'pillar:packaging'],
  },
];

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log('\n' + '═'.repeat(70));
  log('  FIX FEP PRODUCT TAGS', 'bright');
  log('  Scope: Oil Slick vendor products ONLY', 'cyan');
  log(`  Store: ${config.shopify.storeUrl}`, 'cyan');
  log(`  Mode: ${dryRun ? 'DRY RUN (use --execute to apply)' : 'EXECUTING CHANGES'}`, dryRun ? 'yellow' : 'green');
  console.log('═'.repeat(70));

  try {
    // Step 1: Fetch ONLY Oil Slick products
    logSection('STEP 1: FETCHING OIL SLICK PRODUCTS');
    const products = await api.getAllProductsByVendor('Oil Slick');
    log(`Fetched ${products.length} Oil Slick products`, 'cyan');

    if (products.length === 0) {
      log('No Oil Slick products found. Nothing to do.', 'yellow');
      return;
    }

    // Step 2: Apply FEP/PTFE/extraction tags
    logSection('STEP 2: TAGGING FEP/PTFE/EXTRACTION PRODUCTS');

    if (dryRun) {
      log('DRY RUN MODE - No changes will be made\n', 'yellow');
    }

    let fixed = 0;
    let skipped = 0;
    let errors = 0;
    const taggedProducts = { fep: 0, ptfe: 0, parchment: 0, silicone: 0, jar: 0, mylar: 0, tube: 0, other: 0 };

    for (const product of products) {
      const title = product.title.toLowerCase();
      const currentTags = product.tags ? product.tags.split(',').map(t => t.trim()) : [];
      const newTags = new Set(currentTags);
      let needsUpdate = false;
      let productLogged = false;

      function logProduct() {
        if (!productLogged) {
          console.log(`\n  ${product.title} (ID: ${product.id})`);
          if (currentTags.length > 0) {
            console.log(`    Current tags: ${currentTags.join(', ')}`);
          }
          productLogged = true;
        }
      }

      // Apply matching rules
      for (const rule of FEP_TAG_RULES) {
        if (!title.includes(rule.titleContains.toLowerCase())) continue;

        for (const tag of rule.ensureTags) {
          if (!newTags.has(tag)) {
            newTags.add(tag);
            needsUpdate = true;
            logProduct();
            console.log(`    + ${tag}`);
          }
        }
      }

      // Cross-validation: material tag from title keywords
      if (title.includes('fep') && !newTags.has('material:fep')) {
        newTags.add('material:fep');
        needsUpdate = true;
        logProduct();
        console.log(`    + material:fep (title contains "fep")`);
      }
      if (title.includes('ptfe') && !newTags.has('material:ptfe')) {
        newTags.add('material:ptfe');
        needsUpdate = true;
        logProduct();
        console.log(`    + material:ptfe (title contains "ptfe")`);
      }
      if (title.includes('silicone') && !newTags.has('material:silicone')) {
        newTags.add('material:silicone');
        needsUpdate = true;
        logProduct();
        console.log(`    + material:silicone (title contains "silicone")`);
      }
      if (title.includes('parchment') && !newTags.has('material:parchment')) {
        newTags.add('material:parchment');
        needsUpdate = true;
        logProduct();
        console.log(`    + material:parchment (title contains "parchment")`);
      }

      // Family<->pillar/use consistency from taxonomy
      for (const tag of [...newTags]) {
        if (!tag.startsWith('family:')) continue;
        const familyName = tag.substring(7);
        const def = config.taxonomy.families[familyName];
        if (!def) continue;

        if (def.pillar && !newTags.has(`pillar:${def.pillar}`)) {
          newTags.add(`pillar:${def.pillar}`);
          needsUpdate = true;
          logProduct();
          console.log(`    + pillar:${def.pillar} (from family:${familyName})`);
        }
        if (def.use && !newTags.has(`use:${def.use}`)) {
          newTags.add(`use:${def.use}`);
          needsUpdate = true;
          logProduct();
          console.log(`    + use:${def.use} (from family:${familyName})`);
        }
      }

      if (needsUpdate) {
        const updatedTags = Array.from(newTags).join(', ');

        // Track what kind of product was tagged
        if (title.includes('fep')) taggedProducts.fep++;
        else if (title.includes('ptfe')) taggedProducts.ptfe++;
        else if (title.includes('parchment')) taggedProducts.parchment++;
        else if (title.includes('silicone') && (title.includes('pad') || title.includes('mat') || title.includes('slab'))) taggedProducts.silicone++;
        else if (title.includes('jar')) taggedProducts.jar++;
        else if (title.includes('mylar')) taggedProducts.mylar++;
        else if (title.includes('tube')) taggedProducts.tube++;
        else taggedProducts.other++;

        if (!dryRun) {
          try {
            await api.updateProduct(product.id, {
              id: product.id,
              tags: updatedTags,
            });
            log(`    Applied!`, 'green');
            fixed++;
          } catch (error) {
            log(`    ERROR: ${error.message}`, 'red');
            errors++;
          }
        } else {
          log(`    Would apply (dry run)`, 'yellow');
          fixed++;
        }
      } else {
        skipped++;
      }
    }

    // Step 3: Summary
    logSection('RESULTS');
    log(`\n  Oil Slick products scanned: ${products.length}`, 'cyan');
    log(`  Products updated: ${fixed}`, fixed > 0 ? 'green' : 'cyan');
    log(`  Products already correct: ${skipped}`, 'green');
    if (errors > 0) log(`  Errors: ${errors}`, 'red');

    console.log('\n  Breakdown by product type:');
    if (taggedProducts.fep > 0) console.log(`    FEP sheets/rolls:      ${taggedProducts.fep}`);
    if (taggedProducts.ptfe > 0) console.log(`    PTFE sheets/rolls:     ${taggedProducts.ptfe}`);
    if (taggedProducts.parchment > 0) console.log(`    Parchment paper:       ${taggedProducts.parchment}`);
    if (taggedProducts.silicone > 0) console.log(`    Silicone pads/mats:    ${taggedProducts.silicone}`);
    if (taggedProducts.jar > 0) console.log(`    Glass jars:            ${taggedProducts.jar}`);
    if (taggedProducts.mylar > 0) console.log(`    Mylar bags:            ${taggedProducts.mylar}`);
    if (taggedProducts.tube > 0) console.log(`    Joint tubes:           ${taggedProducts.tube}`);
    if (taggedProducts.other > 0) console.log(`    Other:                 ${taggedProducts.other}`);

    if (dryRun) {
      log('\nThis was a DRY RUN. To apply changes:', 'yellow');
      console.log('  node src/fix-fep-tags.js --execute');
    } else {
      log('\nAll FEP/extraction product tags have been updated!', 'green');
    }

    logSection('COMPLETE');

  } catch (error) {
    log(`\nFatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();
