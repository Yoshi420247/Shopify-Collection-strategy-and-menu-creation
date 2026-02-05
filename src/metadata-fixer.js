/**
 * Metadata Fixer - Automatic correction of product metadata issues
 *
 * This script analyzes products and automatically fixes common metadata issues:
 * - Missing required tags (family, pillar, use, material)
 * - Incorrect tag values
 * - Missing inferred tags from title analysis
 *
 * Run in dry-run mode: npm run validate:fix
 * Run with execution: npm run validate:fix:execute
 */

import { config } from './config.js';
import * as api from './shopify-api.js';
import { VALIDATION_SCHEMA } from './metadata-validator.js';

// ============================================================================
// AUTO-FIX RULES
// ============================================================================

const FIX_RULES = {
  // Family detection from title patterns (high confidence only)
  familyPatterns: [
    { pattern: /\bwater\s*pipe\b/i, family: 'glass-bong', confidence: 'high' },
    { pattern: /\bbong\b/i, family: 'glass-bong', confidence: 'medium', excludePatterns: [/silicone/i] },
    { pattern: /\bsilicone.*bong\b/i, family: 'silicone-bong', confidence: 'high' },
    { pattern: /\bdab\s*rig\b/i, family: 'glass-rig', confidence: 'high' },
    { pattern: /\boil\s*rig\b/i, family: 'glass-rig', confidence: 'high' },
    { pattern: /\bbubbler\b/i, family: 'bubbler', confidence: 'high' },
    { pattern: /\bspoon\s*pipe\b/i, family: 'spoon-pipe', confidence: 'high' },
    { pattern: /\bhand\s*pipe\b/i, family: 'spoon-pipe', confidence: 'high' },
    { pattern: /\bnectar\s*collector\b/i, family: 'nectar-collector', confidence: 'high' },
    { pattern: /\bhoney\s*straw\b/i, family: 'nectar-collector', confidence: 'high' },
    { pattern: /\bchillum\b/i, family: 'chillum-onehitter', confidence: 'high' },
    { pattern: /\bone\s*hitter\b/i, family: 'chillum-onehitter', confidence: 'high' },
    { pattern: /\bsteamroller\b/i, family: 'steamroller', confidence: 'high' },
    { pattern: /\bbanger\b/i, family: 'banger', confidence: 'high' },
    { pattern: /\bquartz\s*nail\b/i, family: 'banger', confidence: 'high' },
    { pattern: /\bcarb\s*cap\b/i, family: 'carb-cap', confidence: 'high' },
    { pattern: /\bdab\s*tool\b/i, family: 'dab-tool', confidence: 'high' },
    { pattern: /\bdabber\b/i, family: 'dab-tool', confidence: 'high' },
    { pattern: /\bflower\s*bowl\b/i, family: 'flower-bowl', confidence: 'high' },
    { pattern: /\bglass\s*bowl\b/i, family: 'flower-bowl', confidence: 'medium' },
    { pattern: /\bslide\b/i, family: 'flower-bowl', confidence: 'medium' },
    { pattern: /\bash\s*catcher\b/i, family: 'ash-catcher', confidence: 'high' },
    { pattern: /\bdown\s*stem\b/i, family: 'downstem', confidence: 'high' },
    { pattern: /\bdrop\s*down\b/i, family: 'downstem', confidence: 'medium' },
    { pattern: /\btorch\b/i, family: 'torch', confidence: 'high' },
    { pattern: /\bgrinder\b/i, family: 'grinder', confidence: 'high' },
    { pattern: /\brolling\s*paper\b/i, family: 'rolling-paper', confidence: 'high' },
    { pattern: /\bpre\s*roll.*cone\b/i, family: 'rolling-paper', confidence: 'high' },
    { pattern: /\bcone\b/i, family: 'rolling-paper', confidence: 'medium', excludePatterns: [/incense/i] },
    { pattern: /\brolling\s*tray\b/i, family: 'rolling-tray', confidence: 'high' },
    { pattern: /\bashtray\b/i, family: 'ashtray', confidence: 'high' },
    { pattern: /\bvape\s*battery\b/i, family: 'vape-battery', confidence: 'high' },
    { pattern: /\b510.*battery\b/i, family: 'vape-battery', confidence: 'high' },
    { pattern: /\bcartridge\b/i, family: 'vape-cartridge', confidence: 'medium' },
    { pattern: /\bjar\b/i, family: 'container', confidence: 'medium' },
    { pattern: /\bcontainer\b/i, family: 'container', confidence: 'medium' },
    { pattern: /\bpendant\b/i, family: 'merch-pendant', confidence: 'high' },
    { pattern: /\bscale\b/i, family: 'scale', confidence: 'high' },
    { pattern: /\bcleaner\b/i, family: 'cleaning-supply', confidence: 'high' },
  ],

  // Material detection patterns
  materialPatterns: [
    { pattern: /\bglass\b/i, material: 'glass', confidence: 'high', excludePatterns: [/silicone/i] },
    { pattern: /\bsilicone\b/i, material: 'silicone', confidence: 'high' },
    { pattern: /\bquartz\b/i, material: 'quartz', confidence: 'high' },
    { pattern: /\bborosilicate\b/i, material: 'borosilicate', confidence: 'high' },
    { pattern: /\btitanium\b/i, material: 'titanium', confidence: 'high' },
    { pattern: /\bmetal\b/i, material: 'metal', confidence: 'medium' },
    { pattern: /\bceramic\b/i, material: 'ceramic', confidence: 'high' },
    { pattern: /\bwood\b/i, material: 'wood', confidence: 'medium', excludePatterns: [/hollywood/i, /woodgrain/i] },
  ],

  // Brand detection patterns
  brandPatterns: [
    { pattern: /\bmonark\b/i, brand: 'monark', confidence: 'high' },
    { pattern: /\bzig[\s-]*zag\b/i, brand: 'zig-zag', confidence: 'high' },
    { pattern: /\bcookies\b/i, brand: 'cookies', confidence: 'high' },
    { pattern: /\bmaven\b/i, brand: 'maven', confidence: 'high' },
    { pattern: /\bvibes\b/i, brand: 'vibes', confidence: 'high' },
    { pattern: /\braw\b/i, brand: 'raw', confidence: 'medium', excludePatterns: [/drawer/i, /straw/i] },
    { pattern: /\belements\b/i, brand: 'elements', confidence: 'high' },
    { pattern: /\bpuffco\b/i, brand: 'puffco', confidence: 'high' },
    { pattern: /\blookah\b/i, brand: 'lookah', confidence: 'high' },
    { pattern: /\bg[\s-]*pen\b/i, brand: 'g-pen', confidence: 'high' },
    { pattern: /\b710[\s-]*sci\b/i, brand: '710-sci', confidence: 'high' },
    { pattern: /\bscorch\b/i, brand: 'scorch', confidence: 'high' },
  ],

  // Tag corrections (wrong tag -> correct tag)
  tagCorrections: {
    'family:bong': 'family:glass-bong',
    'family:pipe': 'family:spoon-pipe',
    'family:bowl': 'family:flower-bowl',
    'family:battery': 'family:vape-battery',
    'family:dabber': 'family:dab-tool',
    'family:papers': 'family:rolling-paper',
    'family:tray': 'family:rolling-tray',
    'pillar:device': 'pillar:smokeshop-device',
    'pillar:smoke-device': 'pillar:smokeshop-device',
    'use:smoking': 'use:flower-smoking',
    'use:dab': 'use:dabbing',
    'use:dabs': 'use:dabbing',
    'use:vape': 'use:vaping',
    'material:titanium-quartz': 'material:quartz',
  },

  // Tags to remove (orphaned/legacy)
  tagsToRemove: [
    'Bong', 'Pipe', 'Rig', 'Bowl', 'Grinder', 'Torch', 'Tray', 'Paper',
    'format:bong', 'format:pipe', 'format:rig', 'format:bowl',
    'category:smoking', 'category:dabbing', 'category:accessories',
    'type:device', 'type:accessory',
  ],
};

// ============================================================================
// FIXER CLASS
// ============================================================================

class MetadataFixer {
  constructor(options = {}) {
    this.options = {
      dryRun: !options.execute,
      onlyHighConfidence: options.onlyHighConfidence || false,
      verbose: options.verbose || false,
      ...options
    };

    this.stats = {
      totalProducts: 0,
      productsAnalyzed: 0,
      productsNeedingFixes: 0,
      productsFixed: 0,
      tagChanges: 0,
    };

    this.changes = [];
  }

  /**
   * Parse tags from product into structured object
   */
  parseTags(product) {
    const tagsString = product.tags || '';
    const tagsArray = tagsString.split(',').map(t => t.trim()).filter(Boolean);

    const parsed = {
      raw: tagsArray,
      namespaced: {},
      unnamespaced: [],
    };

    for (const tag of tagsArray) {
      if (tag.includes(':')) {
        const [namespace, value] = tag.split(':', 2);
        if (!parsed.namespaced[namespace]) {
          parsed.namespaced[namespace] = [];
        }
        parsed.namespaced[namespace].push(value);
      } else {
        parsed.unnamespaced.push(tag);
      }
    }

    return parsed;
  }

  /**
   * Check if a pattern matches, respecting exclusions
   */
  matchesPattern(text, pattern, excludePatterns = []) {
    if (!pattern.test(text)) return false;
    for (const exclude of excludePatterns) {
      if (exclude.test(text)) return false;
    }
    return true;
  }

  /**
   * Analyze a product and determine fixes needed
   */
  analyzeProduct(product) {
    const tags = this.parseTags(product);
    const title = product.title || '';
    const description = product.body_html || '';
    const text = `${title} ${description}`;

    const fixes = {
      addTags: [],
      removeTags: [],
      correctTags: [],
    };

    // 1. Detect and suggest family tag
    if (!tags.namespaced['family'] || tags.namespaced['family'].length === 0) {
      for (const rule of FIX_RULES.familyPatterns) {
        if (this.matchesPattern(title, rule.pattern, rule.excludePatterns || [])) {
          if (!this.options.onlyHighConfidence || rule.confidence === 'high') {
            fixes.addTags.push({
              tag: `family:${rule.family}`,
              reason: `Title matches pattern for ${rule.family}`,
              confidence: rule.confidence,
            });
            break; // Only add one family tag
          }
        }
      }
    }

    // 2. Detect and suggest material tag
    if (!tags.namespaced['material'] || tags.namespaced['material'].length === 0) {
      for (const rule of FIX_RULES.materialPatterns) {
        if (this.matchesPattern(text, rule.pattern, rule.excludePatterns || [])) {
          if (!this.options.onlyHighConfidence || rule.confidence === 'high') {
            fixes.addTags.push({
              tag: `material:${rule.material}`,
              reason: `Product mentions ${rule.material}`,
              confidence: rule.confidence,
            });
            break; // Only add one material tag
          }
        }
      }
    }

    // 3. Detect and suggest brand tag
    if (!tags.namespaced['brand'] || tags.namespaced['brand'].length === 0) {
      for (const rule of FIX_RULES.brandPatterns) {
        if (this.matchesPattern(title, rule.pattern, rule.excludePatterns || [])) {
          if (!this.options.onlyHighConfidence || rule.confidence === 'high') {
            fixes.addTags.push({
              tag: `brand:${rule.brand}`,
              reason: `Title mentions ${rule.brand}`,
              confidence: rule.confidence,
            });
            break; // Only add one brand tag
          }
        }
      }
    }

    // 4. Add pillar and use based on family (if family exists or will be added)
    const familyTag = tags.namespaced['family']?.[0] ||
      fixes.addTags.find(f => f.tag.startsWith('family:'))?.tag.split(':')[1];

    if (familyTag) {
      const familyConfig = config.taxonomy.families[familyTag];
      if (familyConfig) {
        // Add pillar if missing
        if (!tags.namespaced['pillar'] || tags.namespaced['pillar'].length === 0) {
          fixes.addTags.push({
            tag: `pillar:${familyConfig.pillar}`,
            reason: `Required pillar for family:${familyTag}`,
            confidence: 'high',
          });
        }

        // Add use if missing and family has one
        if (familyConfig.use && (!tags.namespaced['use'] || tags.namespaced['use'].length === 0)) {
          fixes.addTags.push({
            tag: `use:${familyConfig.use}`,
            reason: `Expected use for family:${familyTag}`,
            confidence: 'high',
          });
        }
      }
    }

    // 5. Correct wrong tags
    for (const tag of tags.raw) {
      if (FIX_RULES.tagCorrections[tag]) {
        fixes.correctTags.push({
          from: tag,
          to: FIX_RULES.tagCorrections[tag],
          reason: 'Known tag correction',
        });
      }
    }

    // 6. Remove orphaned tags
    for (const tag of tags.raw) {
      if (FIX_RULES.tagsToRemove.includes(tag)) {
        fixes.removeTags.push({
          tag,
          reason: 'Legacy/orphaned tag',
        });
      }
    }

    return fixes;
  }

  /**
   * Apply fixes to a product
   */
  applyFixes(product, fixes) {
    const currentTags = (product.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    let newTags = [...currentTags];

    // Remove tags
    for (const removal of fixes.removeTags) {
      newTags = newTags.filter(t => t !== removal.tag);
    }

    // Correct tags
    for (const correction of fixes.correctTags) {
      newTags = newTags.map(t => t === correction.from ? correction.to : t);
    }

    // Add tags
    for (const addition of fixes.addTags) {
      if (!newTags.includes(addition.tag)) {
        newTags.push(addition.tag);
      }
    }

    // Remove duplicates
    newTags = [...new Set(newTags)];

    return newTags.join(', ');
  }

  /**
   * Process a single product
   */
  async processProduct(product) {
    this.stats.productsAnalyzed++;

    const fixes = this.analyzeProduct(product);
    const hasChanges = fixes.addTags.length > 0 ||
                       fixes.removeTags.length > 0 ||
                       fixes.correctTags.length > 0;

    if (!hasChanges) return null;

    this.stats.productsNeedingFixes++;

    const newTags = this.applyFixes(product, fixes);
    const changeRecord = {
      productId: product.id,
      productTitle: product.title,
      productHandle: product.handle,
      originalTags: product.tags,
      newTags,
      fixes,
    };

    this.changes.push(changeRecord);

    if (!this.options.dryRun) {
      try {
        await api.updateProduct(product.id, { tags: newTags });
        this.stats.productsFixed++;
        this.stats.tagChanges += fixes.addTags.length + fixes.removeTags.length + fixes.correctTags.length;
        console.log(`  [FIXED] ${product.title}`);
      } catch (error) {
        console.error(`  [ERROR] Failed to update ${product.title}: ${error.message}`);
      }
    } else {
      console.log(`  [DRY-RUN] Would fix: ${product.title}`);
      for (const add of fixes.addTags) {
        console.log(`    + ADD: ${add.tag} (${add.confidence}) - ${add.reason}`);
      }
      for (const remove of fixes.removeTags) {
        console.log(`    - REMOVE: ${remove.tag} - ${remove.reason}`);
      }
      for (const correct of fixes.correctTags) {
        console.log(`    ~ CORRECT: ${correct.from} -> ${correct.to}`);
      }
    }

    return changeRecord;
  }

  /**
   * Process all products from a vendor
   */
  async processAllProducts(vendor = config.vendor) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('  METADATA FIXER - Automatic Tag Correction');
    console.log(`${'='.repeat(70)}\n`);

    if (this.options.dryRun) {
      console.log('MODE: DRY-RUN (no changes will be made)\n');
    } else {
      console.log('MODE: EXECUTE (changes will be applied)\n');
    }

    console.log(`Fetching products from vendor: ${vendor}...`);
    const products = await api.getAllProductsByVendor(vendor);
    this.stats.totalProducts = products.length;

    console.log(`\nAnalyzing ${products.length} products...\n`);

    for (const product of products) {
      await this.processProduct(product);
    }

    this.printSummary();
    return this.changes;
  }

  /**
   * Print summary of changes
   */
  printSummary() {
    console.log(`\n${'='.repeat(70)}`);
    console.log('  SUMMARY');
    console.log(`${'='.repeat(70)}\n`);

    console.log(`Total Products:           ${this.stats.totalProducts}`);
    console.log(`Products Analyzed:        ${this.stats.productsAnalyzed}`);
    console.log(`Products Needing Fixes:   ${this.stats.productsNeedingFixes}`);

    if (!this.options.dryRun) {
      console.log(`Products Fixed:           ${this.stats.productsFixed}`);
      console.log(`Total Tag Changes:        ${this.stats.tagChanges}`);
    }

    // Breakdown by fix type
    const addTagCount = this.changes.reduce((sum, c) => sum + c.fixes.addTags.length, 0);
    const removeTagCount = this.changes.reduce((sum, c) => sum + c.fixes.removeTags.length, 0);
    const correctTagCount = this.changes.reduce((sum, c) => sum + c.fixes.correctTags.length, 0);

    console.log(`\nChanges by type:`);
    console.log(`  Tags to add:      ${addTagCount}`);
    console.log(`  Tags to remove:   ${removeTagCount}`);
    console.log(`  Tags to correct:  ${correctTagCount}`);

    // Most common fixes
    const tagAdditions = {};
    for (const change of this.changes) {
      for (const add of change.fixes.addTags) {
        tagAdditions[add.tag] = (tagAdditions[add.tag] || 0) + 1;
      }
    }

    const sortedAdditions = Object.entries(tagAdditions)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    if (sortedAdditions.length > 0) {
      console.log(`\nMost common tag additions:`);
      for (const [tag, count] of sortedAdditions) {
        console.log(`  ${tag}: ${count}`);
      }
    }

    if (this.options.dryRun) {
      console.log(`\nTo apply these changes, run: npm run validate:fix:execute`);
    }

    console.log(`\n${'='.repeat(70)}\n`);
  }

  /**
   * Export changes to JSON file
   */
  exportChanges(filepath) {
    const fs = require('fs');
    fs.writeFileSync(filepath, JSON.stringify(this.changes, null, 2));
    console.log(`Changes exported to: ${filepath}`);
  }
}

// ============================================================================
// CLI EXECUTION
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute') || args.includes('-e');
  const verbose = args.includes('--verbose') || args.includes('-v');
  const onlyHighConfidence = args.includes('--high-confidence');
  const exportChanges = args.includes('--export');
  const vendor = args.find(a => a.startsWith('--vendor='))?.split('=')[1] || config.vendor;

  const fixer = new MetadataFixer({
    execute,
    verbose,
    onlyHighConfidence,
  });

  try {
    const changes = await fixer.processAllProducts(vendor);

    if (exportChanges) {
      const timestamp = new Date().toISOString().split('T')[0];
      fixer.exportChanges(`metadata-fixes-${timestamp}.json`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Fixer failed:', error.message);
    process.exit(1);
  }
}

// Export for use as module
export { MetadataFixer, FIX_RULES };

// Run if called directly
main();
