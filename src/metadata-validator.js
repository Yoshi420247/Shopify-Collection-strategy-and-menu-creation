/**
 * Metadata Validator - Comprehensive Product Metadata Accuracy Checker
 *
 * This validator performs multiple layers of checks to ensure product metadata
 * is accurate and consistent. Misclassification can lead to:
 * - Products appearing in wrong collections
 * - Poor customer experience
 * - Lost sales from unfindable products
 *
 * Run: npm run validate
 * Run with auto-fix: npm run validate:fix
 */

import { config } from './config.js';
import * as api from './shopify-api.js';

// ============================================================================
// VALIDATION SCHEMA - The source of truth for metadata rules
// ============================================================================

const VALIDATION_SCHEMA = {
  // Required tags - every product MUST have these
  requiredTags: ['family', 'pillar'],

  // Recommended tags - products SHOULD have these
  recommendedTags: ['use', 'material'],

  // Valid values for each namespace (derived from config)
  validValues: {
    family: Object.keys(config.taxonomy.families),
    pillar: Object.keys(config.taxonomy.pillars),
    use: Object.keys(config.taxonomy.uses),
    material: config.taxonomy.materials,
    style: [...config.taxonomy.styles, 'electric', 'character', 'animal', 'sports', 'halloween', 'gift'],
    brand: config.taxonomy.brands,
    joint_size: config.taxonomy.jointSpecs.sizes,
    joint_gender: config.taxonomy.jointSpecs.genders,
    joint_angle: config.taxonomy.jointSpecs.angles,
  },

  // Family-to-pillar mapping (must match)
  familyToPillar: Object.fromEntries(
    Object.entries(config.taxonomy.families).map(([family, data]) => [family, data.pillar])
  ),

  // Family-to-use mapping (must match)
  familyToUse: Object.fromEntries(
    Object.entries(config.taxonomy.families)
      .filter(([, data]) => data.use)
      .map(([family, data]) => [family, data.use])
  ),

  // Incompatible tag combinations
  incompatibleCombinations: [
    // Glass families shouldn't have silicone material
    { if: { family: 'glass-bong' }, not: { material: 'silicone' }, severity: 'warning',
      message: 'Glass bong tagged with silicone material - should be family:silicone-bong or material:glass' },
    { if: { family: 'glass-rig' }, not: { material: 'silicone' }, severity: 'warning',
      message: 'Glass rig tagged with silicone material - should be family:silicone-rig or material:glass' },

    // Silicone families should have silicone material
    { if: { family: 'silicone-rig' }, requires: { material: 'silicone' }, severity: 'error',
      message: 'Silicone rig missing material:silicone tag' },

    // Quartz bangers must have quartz material
    { if: { family: 'banger' }, requires: { material: 'quartz' }, severity: 'warning',
      message: 'Banger should have material:quartz tag' },

    // Dabbing accessories should have dabbing use
    { if: { family: 'carb-cap' }, requires: { use: 'dabbing' }, severity: 'error',
      message: 'Carb cap should have use:dabbing tag' },
    { if: { family: 'dab-tool' }, requires: { use: 'dabbing' }, severity: 'error',
      message: 'Dab tool should have use:dabbing tag' },
    { if: { family: 'banger' }, requires: { use: 'dabbing' }, severity: 'error',
      message: 'Banger should have use:dabbing tag' },

    // Flower accessories should have flower-smoking use
    { if: { family: 'flower-bowl' }, requires: { use: 'flower-smoking' }, severity: 'error',
      message: 'Flower bowl should have use:flower-smoking tag' },
    { if: { family: 'ash-catcher' }, requires: { use: 'flower-smoking' }, severity: 'error',
      message: 'Ash catcher should have use:flower-smoking tag' },
  ],

  // Title patterns that suggest specific families
  titlePatterns: [
    // Devices
    { pattern: /\bbong\b/i, suggestsFamily: ['glass-bong', 'silicone-bong'], excludePatterns: [/silicone/i] },
    { pattern: /\bwater\s*pipe\b/i, suggestsFamily: ['glass-bong'], excludePatterns: [/silicone/i] },
    { pattern: /\bsilicone.*bong\b/i, suggestsFamily: ['silicone-bong'] },
    { pattern: /\bsilicone.*water\s*pipe\b/i, suggestsFamily: ['silicone-bong'] },
    { pattern: /\bdab\s*rig\b/i, suggestsFamily: ['glass-rig', 'silicone-rig', 'e-rig'] },
    { pattern: /\boil\s*rig\b/i, suggestsFamily: ['glass-rig'] },
    { pattern: /\brig\b/i, suggestsFamily: ['glass-rig', 'silicone-rig', 'e-rig'], excludePatterns: [/trigger/i] },
    { pattern: /\bbubbler\b/i, suggestsFamily: ['bubbler'] },
    { pattern: /\bspoon\s*pipe\b/i, suggestsFamily: ['spoon-pipe'] },
    { pattern: /\bhand\s*pipe\b/i, suggestsFamily: ['spoon-pipe'] },
    { pattern: /\bpipe\b/i, suggestsFamily: ['spoon-pipe'], excludePatterns: [/water/i, /down\s*stem/i] },
    { pattern: /\bnectar\s*collector\b/i, suggestsFamily: ['nectar-collector'] },
    { pattern: /\bhoney\s*straw\b/i, suggestsFamily: ['nectar-collector'] },
    { pattern: /\bchillum\b/i, suggestsFamily: ['chillum-onehitter'] },
    { pattern: /\bone\s*hitter\b/i, suggestsFamily: ['chillum-onehitter'] },
    { pattern: /\bsteamroller\b/i, suggestsFamily: ['steamroller'] },

    // Accessories
    { pattern: /\bbanger\b/i, suggestsFamily: ['banger'] },
    { pattern: /\bquartz.*nail\b/i, suggestsFamily: ['banger'] },
    { pattern: /\bcarb\s*cap\b/i, suggestsFamily: ['carb-cap'] },
    { pattern: /\bdab\s*tool\b/i, suggestsFamily: ['dab-tool'] },
    { pattern: /\bdabber\b/i, suggestsFamily: ['dab-tool'] },
    { pattern: /\bbowl\b/i, suggestsFamily: ['flower-bowl'], excludePatterns: [/ash/i, /grinder/i] },
    { pattern: /\bslide\b/i, suggestsFamily: ['flower-bowl'] },
    { pattern: /\bash\s*catcher\b/i, suggestsFamily: ['ash-catcher'] },
    { pattern: /\bdown\s*stem\b/i, suggestsFamily: ['downstem'] },
    { pattern: /\btorch\b/i, suggestsFamily: ['torch'] },
    { pattern: /\bgrinder\b/i, suggestsFamily: ['grinder'] },
    { pattern: /\brolling\s*paper\b/i, suggestsFamily: ['rolling-paper'] },
    { pattern: /\bcone\b/i, suggestsFamily: ['rolling-paper'], excludePatterns: [/incense/i] },
    { pattern: /\brolling\s*tray\b/i, suggestsFamily: ['rolling-tray'] },
    { pattern: /\btray\b/i, suggestsFamily: ['rolling-tray'], excludePatterns: [/ash/i] },
    { pattern: /\bashtray\b/i, suggestsFamily: ['ashtray'] },
    { pattern: /\bvape\b/i, suggestsFamily: ['vape-battery', 'vape-cartridge'] },
    { pattern: /\bbattery\b/i, suggestsFamily: ['vape-battery'] },
    { pattern: /\bcartridge\b/i, suggestsFamily: ['vape-cartridge'] },
    { pattern: /\bjar\b/i, suggestsFamily: ['container'] },
    { pattern: /\bcontainer\b/i, suggestsFamily: ['container'] },
    { pattern: /\bpendant\b/i, suggestsFamily: ['merch-pendant'] },
    { pattern: /\bscale\b/i, suggestsFamily: ['scale'] },
    { pattern: /\bdrop\s*down\b/i, suggestsFamily: ['downstem', 'adapter'] },
    { pattern: /\badapter\b/i, suggestsFamily: ['adapter', 'downstem'] },
    { pattern: /\bcleaner\b/i, suggestsFamily: ['cleaning-supply'] },
  ],

  // Material detection patterns
  materialPatterns: [
    { pattern: /\bglass\b/i, suggestsMaterial: 'glass' },
    { pattern: /\bsilicone\b/i, suggestsMaterial: 'silicone' },
    { pattern: /\bquartz\b/i, suggestsMaterial: 'quartz' },
    { pattern: /\bborosilicate\b/i, suggestsMaterial: 'borosilicate' },
    { pattern: /\btitanium\b/i, suggestsMaterial: 'titanium' },
    { pattern: /\bmetal\b/i, suggestsMaterial: 'metal' },
    { pattern: /\bceramic\b/i, suggestsMaterial: 'ceramic' },
    { pattern: /\bwood\b/i, suggestsMaterial: 'wood', excludePatterns: [/hollywood/i] },
  ],

  // Brand detection patterns (from title)
  brandPatterns: [
    { pattern: /\bmonark\b/i, suggestsBrand: 'monark' },
    { pattern: /\bzig\s*zag\b/i, suggestsBrand: 'zig-zag' },
    { pattern: /\bcookies\b/i, suggestsBrand: 'cookies' },
    { pattern: /\bmaven\b/i, suggestsBrand: 'maven' },
    { pattern: /\bvibes\b/i, suggestsBrand: 'vibes' },
    { pattern: /\braw\b/i, suggestsBrand: 'raw', excludePatterns: [/drawer/i] },
    { pattern: /\belements\b/i, suggestsBrand: 'elements' },
    { pattern: /\bpuffco\b/i, suggestsBrand: 'puffco' },
    { pattern: /\blookah\b/i, suggestsBrand: 'lookah' },
    { pattern: /\bg\s*pen\b/i, suggestsBrand: 'g-pen' },
    { pattern: /\b710\s*sci\b/i, suggestsBrand: '710-sci' },
    { pattern: /\bscorch\b/i, suggestsBrand: 'scorch' },
  ],

  // Joint size patterns
  jointSizePatterns: [
    { pattern: /\b10\s*mm\b/i, suggestsJointSize: '10mm' },
    { pattern: /\b14\s*mm\b/i, suggestsJointSize: '14mm' },
    { pattern: /\b18\s*mm\b/i, suggestsJointSize: '18mm' },
    { pattern: /\b14\.5\s*mm\b/i, suggestsJointSize: '14mm' },
    { pattern: /\b18\.8\s*mm\b/i, suggestsJointSize: '18mm' },
  ],

  // Joint gender patterns
  jointGenderPatterns: [
    { pattern: /\bmale\b/i, suggestsGender: 'male' },
    { pattern: /\bfemale\b/i, suggestsGender: 'female' },
    { pattern: /\b(\d+)\s*M\b/, suggestsGender: 'male' },
    { pattern: /\b(\d+)\s*F\b/, suggestsGender: 'female' },
  ],
};

// ============================================================================
// VALIDATION ENGINE
// ============================================================================

class MetadataValidator {
  constructor(options = {}) {
    this.options = {
      verbose: options.verbose || false,
      strictMode: options.strictMode || false,
      autoFix: options.autoFix || false,
      ...options
    };

    this.issues = [];
    this.stats = {
      totalProducts: 0,
      validProducts: 0,
      productsWithErrors: 0,
      productsWithWarnings: 0,
      totalErrors: 0,
      totalWarnings: 0,
      totalSuggestions: 0,
    };
  }

  /**
   * Parse tags from a product into a structured object
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
   * Check if a pattern matches while respecting exclusions
   */
  matchesPattern(text, pattern, excludePatterns = []) {
    if (!pattern.test(text)) return false;
    for (const exclude of excludePatterns) {
      if (exclude.test(text)) return false;
    }
    return true;
  }

  /**
   * Add an issue to the issues list
   */
  addIssue(product, type, severity, message, suggestion = null) {
    const issue = {
      productId: product.id,
      productTitle: product.title,
      productHandle: product.handle,
      vendor: product.vendor,
      type,
      severity, // 'error', 'warning', 'suggestion'
      message,
      suggestion,
      currentTags: product.tags,
    };

    this.issues.push(issue);

    if (severity === 'error') this.stats.totalErrors++;
    else if (severity === 'warning') this.stats.totalWarnings++;
    else if (severity === 'suggestion') this.stats.totalSuggestions++;
  }

  /**
   * Validate required tags
   */
  checkRequiredTags(product, tags) {
    for (const required of VALIDATION_SCHEMA.requiredTags) {
      if (!tags.namespaced[required] || tags.namespaced[required].length === 0) {
        this.addIssue(
          product,
          'missing_required_tag',
          'error',
          `Missing required tag: ${required}:*`,
          `Add a ${required}: tag based on product type`
        );
      }
    }
  }

  /**
   * Validate recommended tags
   */
  checkRecommendedTags(product, tags) {
    for (const recommended of VALIDATION_SCHEMA.recommendedTags) {
      if (!tags.namespaced[recommended] || tags.namespaced[recommended].length === 0) {
        this.addIssue(
          product,
          'missing_recommended_tag',
          'warning',
          `Missing recommended tag: ${recommended}:*`,
          `Consider adding a ${recommended}: tag for better organization`
        );
      }
    }
  }

  /**
   * Validate tag values against allowed values
   */
  checkTagValues(product, tags) {
    for (const [namespace, values] of Object.entries(tags.namespaced)) {
      const validValues = VALIDATION_SCHEMA.validValues[namespace];

      if (validValues) {
        for (const value of values) {
          if (!validValues.includes(value)) {
            this.addIssue(
              product,
              'invalid_tag_value',
              'error',
              `Invalid ${namespace}:${value} - not in allowed values`,
              `Valid values: ${validValues.slice(0, 5).join(', ')}${validValues.length > 5 ? '...' : ''}`
            );
          }
        }
      }
    }
  }

  /**
   * Check family-pillar consistency
   */
  checkFamilyPillarConsistency(product, tags) {
    const families = tags.namespaced['family'] || [];
    const pillars = tags.namespaced['pillar'] || [];

    for (const family of families) {
      const expectedPillar = VALIDATION_SCHEMA.familyToPillar[family];
      if (expectedPillar && pillars.length > 0 && !pillars.includes(expectedPillar)) {
        this.addIssue(
          product,
          'inconsistent_family_pillar',
          'error',
          `Family "${family}" expects pillar "${expectedPillar}" but found: ${pillars.join(', ')}`,
          `Change pillar to: pillar:${expectedPillar}`
        );
      }
    }
  }

  /**
   * Check family-use consistency
   */
  checkFamilyUseConsistency(product, tags) {
    const families = tags.namespaced['family'] || [];
    const uses = tags.namespaced['use'] || [];

    for (const family of families) {
      const expectedUse = VALIDATION_SCHEMA.familyToUse[family];
      if (expectedUse && uses.length > 0 && !uses.includes(expectedUse)) {
        this.addIssue(
          product,
          'inconsistent_family_use',
          'warning',
          `Family "${family}" typically has use "${expectedUse}" but found: ${uses.join(', ')}`,
          `Consider changing use to: use:${expectedUse}`
        );
      }
    }
  }

  /**
   * Check for incompatible tag combinations
   */
  checkIncompatibleCombinations(product, tags) {
    for (const rule of VALIDATION_SCHEMA.incompatibleCombinations) {
      // Check if the "if" condition matches
      let conditionMatches = true;
      for (const [namespace, value] of Object.entries(rule.if)) {
        const productValues = tags.namespaced[namespace] || [];
        if (!productValues.includes(value)) {
          conditionMatches = false;
          break;
        }
      }

      if (!conditionMatches) continue;

      // Check "not" condition (should NOT have these tags)
      if (rule.not) {
        for (const [namespace, value] of Object.entries(rule.not)) {
          const productValues = tags.namespaced[namespace] || [];
          if (productValues.includes(value)) {
            this.addIssue(product, 'incompatible_tags', rule.severity, rule.message);
          }
        }
      }

      // Check "requires" condition (MUST have these tags)
      if (rule.requires) {
        for (const [namespace, value] of Object.entries(rule.requires)) {
          const productValues = tags.namespaced[namespace] || [];
          if (!productValues.includes(value)) {
            this.addIssue(
              product,
              'missing_required_combination',
              rule.severity,
              rule.message,
              `Add tag: ${namespace}:${value}`
            );
          }
        }
      }
    }
  }

  /**
   * Analyze title for potential misclassification
   */
  checkTitleFamilyMismatch(product, tags) {
    const title = product.title || '';
    const families = tags.namespaced['family'] || [];

    for (const rule of VALIDATION_SCHEMA.titlePatterns) {
      if (this.matchesPattern(title, rule.pattern, rule.excludePatterns || [])) {
        // Title suggests this family
        const suggestedFamilies = rule.suggestsFamily;

        // Check if product has any of the suggested families
        const hasMatch = suggestedFamilies.some(sf => families.includes(sf));

        if (!hasMatch && families.length > 0) {
          // Has a family tag but it doesn't match what title suggests
          this.addIssue(
            product,
            'title_family_mismatch',
            'warning',
            `Title "${title}" suggests family: ${suggestedFamilies.join(' or ')}, but tagged as: ${families.join(', ')}`,
            `Verify classification - consider: ${suggestedFamilies.map(f => `family:${f}`).join(' or ')}`
          );
        } else if (families.length === 0) {
          // Missing family tag but we can suggest one
          this.addIssue(
            product,
            'suggested_family',
            'suggestion',
            `Title "${title}" suggests family: ${suggestedFamilies.join(' or ')}`,
            `Add tag: ${suggestedFamilies.map(f => `family:${f}`).join(' or ')}`
          );
        }
      }
    }
  }

  /**
   * Check for missing material tags based on title
   */
  checkMissingMaterial(product, tags) {
    const title = product.title || '';
    const description = product.body_html || '';
    const text = `${title} ${description}`;
    const materials = tags.namespaced['material'] || [];

    for (const rule of VALIDATION_SCHEMA.materialPatterns) {
      if (this.matchesPattern(text, rule.pattern, rule.excludePatterns || [])) {
        if (!materials.includes(rule.suggestsMaterial)) {
          this.addIssue(
            product,
            'missing_material',
            'suggestion',
            `Product mentions "${rule.suggestsMaterial}" but missing material tag`,
            `Add tag: material:${rule.suggestsMaterial}`
          );
        }
      }
    }
  }

  /**
   * Check for missing brand tags based on title
   */
  checkMissingBrand(product, tags) {
    const title = product.title || '';
    const brands = tags.namespaced['brand'] || [];

    for (const rule of VALIDATION_SCHEMA.brandPatterns) {
      if (this.matchesPattern(title, rule.pattern, rule.excludePatterns || [])) {
        if (!brands.includes(rule.suggestsBrand)) {
          this.addIssue(
            product,
            'missing_brand',
            'suggestion',
            `Title mentions "${rule.suggestsBrand}" but missing brand tag`,
            `Add tag: brand:${rule.suggestsBrand}`
          );
        }
      }
    }
  }

  /**
   * Check for duplicate namespace tags (should only have one value per namespace except style)
   */
  checkDuplicateNamespaceTags(product, tags) {
    const multiValueAllowed = ['style', 'brand']; // These can have multiple values

    for (const [namespace, values] of Object.entries(tags.namespaced)) {
      if (values.length > 1 && !multiValueAllowed.includes(namespace)) {
        this.addIssue(
          product,
          'duplicate_namespace',
          'warning',
          `Multiple ${namespace}: tags found: ${values.join(', ')} - should have only one`,
          `Keep only the most accurate: ${namespace}:${values[0]}`
        );
      }
    }
  }

  /**
   * Check for orphaned/legacy tags
   */
  checkOrphanedTags(product, tags) {
    const legacyTags = [
      'Bong', 'Pipe', 'Rig', 'Bowl', 'Grinder', 'Torch', 'Tray', 'Paper',
      'format:bong', 'format:pipe', 'format:rig', 'category:',
    ];

    for (const tag of tags.raw) {
      for (const legacy of legacyTags) {
        if (tag === legacy || tag.startsWith(legacy)) {
          this.addIssue(
            product,
            'orphaned_tag',
            'warning',
            `Found legacy/orphaned tag: "${tag}"`,
            `Remove this tag and ensure proper family: tag exists`
          );
        }
      }
    }
  }

  /**
   * Check for joint specification consistency
   */
  checkJointSpecifications(product, tags) {
    const title = product.title || '';
    const jointSizes = tags.namespaced['joint_size'] || [];
    const jointGenders = tags.namespaced['joint_gender'] || [];

    // Families that typically have joint specifications
    const familiesWithJoints = ['glass-bong', 'glass-rig', 'bubbler', 'ash-catcher', 'flower-bowl', 'banger', 'downstem'];
    const families = tags.namespaced['family'] || [];
    const hasJointFamily = families.some(f => familiesWithJoints.includes(f));

    if (hasJointFamily) {
      // Check for joint size in title
      for (const rule of VALIDATION_SCHEMA.jointSizePatterns) {
        if (rule.pattern.test(title) && !jointSizes.includes(rule.suggestsJointSize)) {
          this.addIssue(
            product,
            'missing_joint_size',
            'suggestion',
            `Title mentions joint size but missing tag`,
            `Add tag: joint_size:${rule.suggestsJointSize}`
          );
        }
      }

      // Check for joint gender in title
      for (const rule of VALIDATION_SCHEMA.jointGenderPatterns) {
        if (rule.pattern.test(title) && !jointGenders.includes(rule.suggestsGender)) {
          this.addIssue(
            product,
            'missing_joint_gender',
            'suggestion',
            `Title mentions joint gender but missing tag`,
            `Add tag: joint_gender:${rule.suggestsGender}`
          );
        }
      }
    }
  }

  /**
   * Validate a single product
   */
  validateProduct(product) {
    const tags = this.parseTags(product);
    const issueCountBefore = this.issues.length;

    // Run all validations
    this.checkRequiredTags(product, tags);
    this.checkRecommendedTags(product, tags);
    this.checkTagValues(product, tags);
    this.checkFamilyPillarConsistency(product, tags);
    this.checkFamilyUseConsistency(product, tags);
    this.checkIncompatibleCombinations(product, tags);
    this.checkTitleFamilyMismatch(product, tags);
    this.checkMissingMaterial(product, tags);
    this.checkMissingBrand(product, tags);
    this.checkDuplicateNamespaceTags(product, tags);
    this.checkOrphanedTags(product, tags);
    this.checkJointSpecifications(product, tags);

    const newIssues = this.issues.slice(issueCountBefore);
    const hasErrors = newIssues.some(i => i.severity === 'error');
    const hasWarnings = newIssues.some(i => i.severity === 'warning');

    if (hasErrors) {
      this.stats.productsWithErrors++;
    } else if (hasWarnings) {
      this.stats.productsWithWarnings++;
    } else if (newIssues.length === 0 || newIssues.every(i => i.severity === 'suggestion')) {
      this.stats.validProducts++;
    }

    return newIssues;
  }

  /**
   * Validate all products from a vendor
   */
  async validateAllProducts(vendor = config.vendor) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('  METADATA VALIDATOR - Comprehensive Product Accuracy Check');
    console.log(`${'='.repeat(70)}\n`);

    console.log(`Fetching products from vendor: ${vendor}...`);
    const products = await api.getAllProductsByVendor(vendor);
    this.stats.totalProducts = products.length;

    console.log(`\nValidating ${products.length} products...\n`);

    for (const product of products) {
      this.validateProduct(product);
    }

    return this.generateReport();
  }

  /**
   * Generate a comprehensive report
   */
  generateReport() {
    const report = {
      summary: this.stats,
      issuesByType: {},
      issuesBySeverity: {
        error: [],
        warning: [],
        suggestion: [],
      },
      issuesByProduct: {},
    };

    // Organize issues
    for (const issue of this.issues) {
      // By type
      if (!report.issuesByType[issue.type]) {
        report.issuesByType[issue.type] = [];
      }
      report.issuesByType[issue.type].push(issue);

      // By severity
      report.issuesBySeverity[issue.severity].push(issue);

      // By product
      if (!report.issuesByProduct[issue.productId]) {
        report.issuesByProduct[issue.productId] = {
          title: issue.productTitle,
          handle: issue.productHandle,
          issues: [],
        };
      }
      report.issuesByProduct[issue.productId].issues.push(issue);
    }

    return report;
  }

  /**
   * Print a formatted console report
   */
  printReport(report) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('  VALIDATION REPORT');
    console.log(`${'='.repeat(70)}\n`);

    // Summary
    console.log('SUMMARY');
    console.log('-'.repeat(40));
    console.log(`Total Products Analyzed:  ${report.summary.totalProducts}`);
    console.log(`Valid Products:           ${report.summary.validProducts} (${((report.summary.validProducts / report.summary.totalProducts) * 100).toFixed(1)}%)`);
    console.log(`Products with Errors:     ${report.summary.productsWithErrors}`);
    console.log(`Products with Warnings:   ${report.summary.productsWithWarnings}`);
    console.log();
    console.log(`Total Errors:             ${report.summary.totalErrors}`);
    console.log(`Total Warnings:           ${report.summary.totalWarnings}`);
    console.log(`Total Suggestions:        ${report.summary.totalSuggestions}`);

    // Issues by type
    console.log(`\n${'='.repeat(70)}`);
    console.log('ISSUES BY TYPE');
    console.log('-'.repeat(40));

    const typeCounts = Object.entries(report.issuesByType)
      .map(([type, issues]) => ({ type, count: issues.length }))
      .sort((a, b) => b.count - a.count);

    for (const { type, count } of typeCounts) {
      const severity = report.issuesByType[type][0]?.severity || 'unknown';
      const icon = severity === 'error' ? '[X]' : severity === 'warning' ? '[!]' : '[i]';
      console.log(`  ${icon} ${type}: ${count}`);
    }

    // Critical errors (show all)
    if (report.issuesBySeverity.error.length > 0) {
      console.log(`\n${'='.repeat(70)}`);
      console.log('CRITICAL ERRORS (Must Fix)');
      console.log('-'.repeat(40));

      for (const issue of report.issuesBySeverity.error.slice(0, 50)) {
        console.log(`\n[X] ${issue.productTitle}`);
        console.log(`    ID: ${issue.productId}`);
        console.log(`    Issue: ${issue.message}`);
        if (issue.suggestion) {
          console.log(`    Fix: ${issue.suggestion}`);
        }
      }

      if (report.issuesBySeverity.error.length > 50) {
        console.log(`\n... and ${report.issuesBySeverity.error.length - 50} more errors`);
      }
    }

    // Warnings (show sample)
    if (report.issuesBySeverity.warning.length > 0) {
      console.log(`\n${'='.repeat(70)}`);
      console.log('WARNINGS (Should Fix)');
      console.log('-'.repeat(40));

      for (const issue of report.issuesBySeverity.warning.slice(0, 30)) {
        console.log(`\n[!] ${issue.productTitle}`);
        console.log(`    Issue: ${issue.message}`);
        if (issue.suggestion) {
          console.log(`    Fix: ${issue.suggestion}`);
        }
      }

      if (report.issuesBySeverity.warning.length > 30) {
        console.log(`\n... and ${report.issuesBySeverity.warning.length - 30} more warnings`);
      }
    }

    // Products with most issues
    console.log(`\n${'='.repeat(70)}`);
    console.log('PRODUCTS WITH MOST ISSUES');
    console.log('-'.repeat(40));

    const productsByIssueCount = Object.entries(report.issuesByProduct)
      .map(([id, data]) => ({ id, ...data, issueCount: data.issues.length }))
      .sort((a, b) => b.issueCount - a.issueCount)
      .slice(0, 20);

    for (const product of productsByIssueCount) {
      const errorCount = product.issues.filter(i => i.severity === 'error').length;
      const warnCount = product.issues.filter(i => i.severity === 'warning').length;
      console.log(`  ${product.title.substring(0, 50).padEnd(50)} | Errors: ${errorCount} | Warnings: ${warnCount}`);
    }

    // Actionable recommendations
    console.log(`\n${'='.repeat(70)}`);
    console.log('RECOMMENDED ACTIONS');
    console.log('-'.repeat(40));

    if (report.summary.totalErrors > 0) {
      console.log(`\n1. CRITICAL: Fix ${report.summary.totalErrors} errors immediately`);
      console.log('   These products may be in wrong collections or missing from collections entirely.');
    }

    if (report.issuesByType['missing_required_tag']) {
      console.log(`\n2. Add missing required tags to ${report.issuesByType['missing_required_tag'].length} products`);
      console.log('   Run: npm run validate:fix to auto-suggest corrections');
    }

    if (report.issuesByType['title_family_mismatch']) {
      console.log(`\n3. Review ${report.issuesByType['title_family_mismatch'].length} potential misclassifications`);
      console.log('   Product titles suggest different families than current tags.');
    }

    console.log(`\n${'='.repeat(70)}\n`);

    return report;
  }

  /**
   * Export issues as JSON for further processing
   */
  exportIssues(filepath) {
    const fs = require('fs');
    fs.writeFileSync(filepath, JSON.stringify(this.issues, null, 2));
    console.log(`Issues exported to: ${filepath}`);
  }
}

// ============================================================================
// CLI EXECUTION
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const autoFix = args.includes('--fix') || args.includes('--auto-fix');
  const exportJson = args.includes('--export') || args.includes('-e');
  const vendor = args.find(a => a.startsWith('--vendor='))?.split('=')[1] || config.vendor;

  const validator = new MetadataValidator({ verbose, autoFix });

  try {
    const report = await validator.validateAllProducts(vendor);
    validator.printReport(report);

    if (exportJson) {
      const timestamp = new Date().toISOString().split('T')[0];
      validator.exportIssues(`validation-issues-${timestamp}.json`);
    }

    // Exit with error code if there are critical issues
    if (report.summary.totalErrors > 0) {
      console.log('Validation completed with errors. Please fix critical issues.\n');
      process.exit(1);
    }

    console.log('Validation completed successfully.\n');
    process.exit(0);
  } catch (error) {
    console.error('Validation failed:', error.message);
    process.exit(1);
  }
}

// Export for use as module
export { MetadataValidator, VALIDATION_SCHEMA };

// Run if called directly
main();
