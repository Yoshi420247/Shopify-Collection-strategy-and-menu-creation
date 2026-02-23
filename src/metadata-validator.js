#!/usr/bin/env node
/**
 * Metadata Validator
 *
 * Comprehensive product metadata and tag validation system that:
 * 1. Validates every product's tags against the defined taxonomy
 * 2. Cross-validates family tags with expected pillar/use/material
 * 3. Detects missing mandatory tags (family, pillar, use)
 * 4. Detects invalid/unknown tag values not in the taxonomy
 * 5. Detects conflicting tags (multiple families, conflicting use cases)
 * 6. Validates collection rules match correct products
 * 7. Generates detailed reports with severity levels
 * 8. Can auto-fix common issues when run with --fix
 *
 * Usage:
 *   node src/metadata-validator.js                # Full validation report
 *   node src/metadata-validator.js --fix          # Report + auto-fix (dry run)
 *   node src/metadata-validator.js --fix --execute # Apply auto-fixes
 *   node src/metadata-validator.js --json         # Output as JSON
 */

import 'dotenv/config';
import { config } from './config.js';
import api from './shopify-api.js';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
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

// Severity levels for issues
const SEVERITY = {
  CRITICAL: 'CRITICAL',  // Breaks collections or causes wrong product matches
  HIGH: 'HIGH',          // Product miscategorized or missing from collections
  MEDIUM: 'MEDIUM',      // Missing optional metadata, suboptimal tagging
  LOW: 'LOW',            // Style/cosmetic issues, minor inconsistencies
  INFO: 'INFO',          // Informational, no action needed
};

const SEVERITY_COLORS = {
  CRITICAL: 'red',
  HIGH: 'red',
  MEDIUM: 'yellow',
  LOW: 'blue',
  INFO: 'cyan',
};

// ============================================================================
// TAXONOMY HELPERS
// ============================================================================

/** Build lookup sets from the taxonomy config */
function buildTaxonomyLookups() {
  const taxonomy = config.taxonomy;

  const validFamilies = new Set(Object.keys(taxonomy.families));
  const validPillars = new Set(Object.keys(taxonomy.pillars));
  const validUses = new Set(Object.keys(taxonomy.uses));
  const validMaterials = new Set(taxonomy.materials);
  const validBrands = new Set(taxonomy.brands);
  const validStyles = new Set(taxonomy.styles);
  const validJointSizes = new Set(taxonomy.jointSpecs.sizes);
  const validJointGenders = new Set(taxonomy.jointSpecs.genders);
  const validJointAngles = new Set(taxonomy.jointSpecs.angles);

  // All valid prefixes and their allowed values
  const validNamespaces = {
    'family': validFamilies,
    'pillar': validPillars,
    'use': validUses,
    'material': validMaterials,
    'brand': validBrands,
    'style': validStyles,
    'joint_size': validJointSizes,
    'joint_gender': validJointGenders,
    'joint_angle': validJointAngles,
    // These don't have a fixed value set but are valid namespaces
    'length': null,
    'bundle': null,
    'format': null,  // Legacy but still valid
  };

  return {
    validFamilies,
    validPillars,
    validUses,
    validMaterials,
    validBrands,
    validStyles,
    validJointSizes,
    validJointGenders,
    validJointAngles,
    validNamespaces,
    familyDefinitions: taxonomy.families,
    familyMaterials: taxonomy.familyMaterials || {},
  };
}

/** Parse a product's tags string into structured data */
function parseProductTags(tagsString) {
  if (!tagsString) return { raw: [], byNamespace: {}, families: [], pillars: [], uses: [], materials: [], brands: [] };

  const raw = tagsString.split(',').map(t => t.trim()).filter(Boolean);
  const byNamespace = {};
  const families = [];
  const pillars = [];
  const uses = [];
  const materials = [];
  const brands = [];

  for (const tag of raw) {
    const colonIdx = tag.indexOf(':');
    if (colonIdx === -1) {
      if (!byNamespace['_unnamespaced']) byNamespace['_unnamespaced'] = [];
      byNamespace['_unnamespaced'].push(tag);
      continue;
    }

    const prefix = tag.substring(0, colonIdx);
    const value = tag.substring(colonIdx + 1);

    if (!byNamespace[prefix]) byNamespace[prefix] = [];
    byNamespace[prefix].push(value);

    if (prefix === 'family') families.push(value);
    if (prefix === 'pillar') pillars.push(value);
    if (prefix === 'use') uses.push(value);
    if (prefix === 'material') materials.push(value);
    if (prefix === 'brand') brands.push(value);
  }

  return { raw, byNamespace, families, pillars, uses, materials, brands };
}

// ============================================================================
// VALIDATORS
// ============================================================================

/**
 * Validate a single product against the taxonomy.
 * Returns an array of issue objects.
 */
function validateProduct(product, lookups) {
  const issues = [];
  const tags = parseProductTags(product.tags);
  const title = product.title || '';
  const titleLower = title.toLowerCase();

  // --- 1. Missing mandatory family tag ---
  if (tags.families.length === 0) {
    issues.push({
      severity: SEVERITY.HIGH,
      code: 'MISSING_FAMILY',
      message: `No family: tag assigned`,
      suggestion: inferFamilyFromTitle(titleLower, lookups),
    });
  }

  // --- 2. Multiple conflicting family tags ---
  if (tags.families.length > 1) {
    // Check if the families are from different use-cases (conflict)
    const familyUses = tags.families.map(f => lookups.familyDefinitions[f]?.use).filter(Boolean);
    const uniqueUses = new Set(familyUses);
    if (uniqueUses.size > 1) {
      issues.push({
        severity: SEVERITY.HIGH,
        code: 'CONFLICTING_FAMILIES',
        message: `Multiple conflicting family tags: ${tags.families.map(f => `family:${f}`).join(', ')}`,
        detail: `These belong to different use cases: ${[...uniqueUses].join(', ')}`,
      });
    } else {
      issues.push({
        severity: SEVERITY.LOW,
        code: 'MULTIPLE_FAMILIES',
        message: `Multiple family tags: ${tags.families.map(f => `family:${f}`).join(', ')}`,
        detail: 'Same use-case, but product should generally have one primary family',
      });
    }
  }

  // --- 3. Invalid family value ---
  for (const family of tags.families) {
    if (!lookups.validFamilies.has(family)) {
      issues.push({
        severity: SEVERITY.MEDIUM,
        code: 'INVALID_FAMILY',
        message: `Unknown family tag value: family:${family}`,
        suggestion: findClosestMatch(family, [...lookups.validFamilies]),
      });
    }
  }

  // --- 4. Missing pillar tag ---
  if (tags.pillars.length === 0) {
    const expectedPillar = tags.families.length > 0
      ? lookups.familyDefinitions[tags.families[0]]?.pillar
      : null;
    issues.push({
      severity: SEVERITY.MEDIUM,
      code: 'MISSING_PILLAR',
      message: `No pillar: tag assigned`,
      suggestion: expectedPillar ? `Add pillar:${expectedPillar}` : null,
    });
  }

  // --- 5. Missing use tag ---
  if (tags.uses.length === 0 && tags.families.length > 0) {
    const expectedUse = lookups.familyDefinitions[tags.families[0]]?.use;
    if (expectedUse) {
      issues.push({
        severity: SEVERITY.MEDIUM,
        code: 'MISSING_USE',
        message: `No use: tag assigned`,
        suggestion: `Add use:${expectedUse}`,
      });
    }
  }

  // --- 6. Family-pillar mismatch ---
  if (tags.families.length > 0 && tags.pillars.length > 0) {
    for (const family of tags.families) {
      const definition = lookups.familyDefinitions[family];
      if (definition && definition.pillar && !tags.pillars.includes(definition.pillar)) {
        issues.push({
          severity: SEVERITY.HIGH,
          code: 'FAMILY_PILLAR_MISMATCH',
          message: `family:${family} expects pillar:${definition.pillar}, but has pillar:${tags.pillars.join(',')}`,
          fix: { remove: tags.pillars.map(p => `pillar:${p}`), add: [`pillar:${definition.pillar}`] },
        });
      }
    }
  }

  // --- 7. Family-use mismatch ---
  if (tags.families.length > 0 && tags.uses.length > 0) {
    for (const family of tags.families) {
      const definition = lookups.familyDefinitions[family];
      if (definition && definition.use && !tags.uses.includes(definition.use)) {
        issues.push({
          severity: SEVERITY.HIGH,
          code: 'FAMILY_USE_MISMATCH',
          message: `family:${family} expects use:${definition.use}, but has use:${tags.uses.join(',')}`,
          fix: { remove: tags.uses.map(u => `use:${u}`), add: [`use:${definition.use}`] },
        });
      }
    }
  }

  // --- 8. Material cross-validation ---
  if (tags.families.length > 0 && tags.materials.length > 0) {
    for (const family of tags.families) {
      const expectedMaterials = lookups.familyMaterials[family];
      if (expectedMaterials) {
        const hasValidMaterial = tags.materials.some(m => expectedMaterials.includes(m));
        if (!hasValidMaterial) {
          issues.push({
            severity: SEVERITY.MEDIUM,
            code: 'UNEXPECTED_MATERIAL',
            message: `family:${family} typically uses ${expectedMaterials.join('/')}, but has material:${tags.materials.join(',')}`,
            detail: 'This may be correct for a variant product, or may indicate a tagging error',
          });
        }
      }
    }
  }

  // --- 9. Title-based material inference check ---
  const materialKeywords = {
    'silicone': 'silicone',
    'quartz': 'quartz',
    'titanium': 'titanium',
    'ceramic': 'ceramic',
    'borosilicate': 'borosilicate',
    'wooden': 'wood',
    'wood ': 'wood',
    'metal ': 'metal',
    'stainless': 'metal',
    'fep': 'fep',
    'ptfe': 'ptfe',
    'parchment': 'parchment',
  };
  for (const [keyword, material] of Object.entries(materialKeywords)) {
    if (titleLower.includes(keyword) && !tags.materials.includes(material)) {
      issues.push({
        severity: SEVERITY.MEDIUM,
        code: 'MISSING_MATERIAL_FROM_TITLE',
        message: `Title contains "${keyword}" but missing material:${material} tag`,
        fix: { add: [`material:${material}`] },
      });
    }
  }

  // --- 10. Invalid namespace prefix ---
  for (const tag of tags.raw) {
    const colonIdx = tag.indexOf(':');
    if (colonIdx > 0) {
      const prefix = tag.substring(0, colonIdx);
      if (!lookups.validNamespaces.hasOwnProperty(prefix)) {
        issues.push({
          severity: SEVERITY.LOW,
          code: 'UNKNOWN_NAMESPACE',
          message: `Unknown tag namespace: "${prefix}" in tag "${tag}"`,
          suggestion: findClosestMatch(prefix, Object.keys(lookups.validNamespaces)),
        });
      }
    }
  }

  // --- 11. Invalid pillar value ---
  for (const pillar of tags.pillars) {
    if (!lookups.validPillars.has(pillar)) {
      issues.push({
        severity: SEVERITY.MEDIUM,
        code: 'INVALID_PILLAR',
        message: `Unknown pillar value: pillar:${pillar}`,
        suggestion: findClosestMatch(pillar, [...lookups.validPillars]),
      });
    }
  }

  // --- 12. Invalid use value ---
  for (const use of tags.uses) {
    if (!lookups.validUses.has(use)) {
      issues.push({
        severity: SEVERITY.MEDIUM,
        code: 'INVALID_USE',
        message: `Unknown use value: use:${use}`,
        suggestion: findClosestMatch(use, [...lookups.validUses]),
      });
    }
  }

  // --- 13. Invalid material value ---
  for (const material of tags.materials) {
    if (!lookups.validMaterials.has(material)) {
      issues.push({
        severity: SEVERITY.LOW,
        code: 'INVALID_MATERIAL',
        message: `Unknown material value: material:${material}`,
        suggestion: findClosestMatch(material, [...lookups.validMaterials]),
      });
    }
  }

  // --- 14. Legacy format tags that should be removed ---
  const formatTags = tags.byNamespace['format'] || [];
  if (formatTags.length > 0 && tags.families.length > 0) {
    issues.push({
      severity: SEVERITY.LOW,
      code: 'LEGACY_FORMAT_TAG',
      message: `Has legacy format: tags (${formatTags.map(f => `format:${f}`).join(', ')}) alongside family: tags`,
      fix: { remove: formatTags.map(f => `format:${f}`) },
    });
  }

  // --- 15. Silicone product tagged as rolling paper (substring 'cone' in 'silicone') ---
  if (titleLower.includes('silicone') && tags.families.includes('rolling-paper')) {
    issues.push({
      severity: SEVERITY.CRITICAL,
      code: 'SILICONE_ROLLING_PAPER_CONFLICT',
      message: `Silicone product incorrectly tagged as family:rolling-paper (likely "cone" substring match)`,
      fix: { remove: ['family:rolling-paper', 'use:rolling'] },
    });
  }

  // --- 16. Silicone nectar collector tagged as flower-bowl ---
  if (titleLower.includes('silicone') && titleLower.includes('nectar') && tags.families.includes('flower-bowl')) {
    issues.push({
      severity: SEVERITY.CRITICAL,
      code: 'WRONG_FAMILY_NECTAR',
      message: `Silicone nectar collector incorrectly tagged as family:flower-bowl`,
      fix: { remove: ['family:flower-bowl'], add: ['family:nectar-collector'] },
    });
  }

  // --- 17. Drop down / adapter products without family tag ---
  if ((titleLower.includes('drop down') || titleLower.includes('dropdown') || titleLower.includes('adapter'))
    && !tags.families.includes('adapter') && !tags.families.includes('downstem')) {
    issues.push({
      severity: SEVERITY.MEDIUM,
      code: 'MISSING_ADAPTER_FAMILY',
      message: `Product appears to be an adapter/dropdown but missing family:adapter tag`,
      fix: { add: ['family:adapter', 'pillar:accessory'] },
    });
  }

  // --- 18. Glass cleaner without family tag ---
  if ((titleLower.includes('glass cleaner') || titleLower.includes('cleaning solution') || titleLower.includes('pipe cleaner'))
    && !tags.families.includes('cleaning-supply')) {
    issues.push({
      severity: SEVERITY.MEDIUM,
      code: 'MISSING_CLEANING_FAMILY',
      message: `Cleaning product missing family:cleaning-supply tag`,
      fix: { add: ['family:cleaning-supply', 'pillar:accessory'] },
    });
  }

  // --- 19. Product has no tags at all ---
  if (tags.raw.length === 0) {
    issues.push({
      severity: SEVERITY.CRITICAL,
      code: 'NO_TAGS',
      message: `Product has no tags at all`,
    });
  }

  return issues;
}

/**
 * Validate collection rules against the taxonomy and product data.
 */
function validateCollectionRules(collectionConfigs, products, lookups) {
  const issues = [];

  for (const col of collectionConfigs) {
    const rules = col.rules || [];
    if (rules.length === 0 && !col.tag) continue;

    // If collection uses a tag shorthand, expand to rules
    const effectiveRules = col.tag
      ? [{ column: 'tag', relation: 'equals', condition: col.tag }]
      : rules;

    // Check that all tag conditions reference valid taxonomy values
    for (const rule of effectiveRules) {
      if (rule.column === 'tag') {
        const tag = rule.condition;
        const colonIdx = tag.indexOf(':');
        if (colonIdx > 0) {
          const prefix = tag.substring(0, colonIdx);
          const value = tag.substring(colonIdx + 1);

          if (lookups.validNamespaces.hasOwnProperty(prefix)) {
            const validValues = lookups.validNamespaces[prefix];
            if (validValues && !validValues.has(value)) {
              issues.push({
                severity: SEVERITY.HIGH,
                code: 'COLLECTION_INVALID_TAG',
                collection: col.handle,
                message: `Collection "${col.title}" uses tag "${tag}" but "${value}" is not in the taxonomy for ${prefix}`,
              });
            }
          }
        }
      }
    }

    // Simulate which products match this collection's rules
    const matchingProducts = products.filter(product => {
      return matchesCollectionRules(product, effectiveRules, col.disjunctive || false);
    });

    // Flag collections with zero products (may indicate broken rules)
    if (matchingProducts.length === 0) {
      issues.push({
        severity: SEVERITY.MEDIUM,
        code: 'COLLECTION_EMPTY',
        collection: col.handle,
        message: `Collection "${col.title}" matches 0 products - rules may be too restrictive`,
      });
    }

    // Flag collections that match too many products (possible missing filter)
    if (matchingProducts.length > 500 && !['smoke-and-vape', 'all'].includes(col.handle)) {
      issues.push({
        severity: SEVERITY.CRITICAL,
        code: 'COLLECTION_TOO_BROAD',
        collection: col.handle,
        message: `Collection "${col.title}" matches ${matchingProducts.length} products - likely missing a filter rule`,
        matchCount: matchingProducts.length,
      });
    }
  }

  return issues;
}

/** Check if a product matches a set of collection rules */
function matchesCollectionRules(product, rules, disjunctive) {
  const tags = product.tags ? product.tags.split(',').map(t => t.trim()) : [];

  const results = rules.map(rule => {
    if (rule.column === 'tag') {
      return tags.includes(rule.condition);
    }
    if (rule.column === 'vendor') {
      return product.vendor === rule.condition;
    }
    if (rule.column === 'title') {
      return product.title?.toLowerCase().includes(rule.condition.toLowerCase());
    }
    return false;
  });

  return disjunctive
    ? results.some(Boolean)  // OR logic
    : results.every(Boolean); // AND logic
}

// ============================================================================
// AUTO-FIX ENGINE
// ============================================================================

/**
 * Given validation issues for a product, compute the fixed tag set.
 * Only applies fixes with severity CRITICAL or HIGH.
 */
function computeAutoFix(product, issues) {
  const currentTags = product.tags ? product.tags.split(',').map(t => t.trim()) : [];
  const tagSet = new Set(currentTags);
  let changed = false;
  const appliedFixes = [];

  // Sort: apply CRITICAL fixes first, then HIGH
  const fixableIssues = issues
    .filter(i => i.fix && (i.severity === SEVERITY.CRITICAL || i.severity === SEVERITY.HIGH))
    .sort((a, b) => {
      const order = { CRITICAL: 0, HIGH: 1 };
      return (order[a.severity] || 9) - (order[b.severity] || 9);
    });

  for (const issue of fixableIssues) {
    if (issue.fix.remove) {
      for (const tag of issue.fix.remove) {
        if (tagSet.has(tag)) {
          tagSet.delete(tag);
          changed = true;
        }
      }
    }
    if (issue.fix.add) {
      for (const tag of issue.fix.add) {
        if (!tagSet.has(tag)) {
          tagSet.add(tag);
          changed = true;
        }
      }
    }
    if (changed) {
      appliedFixes.push(issue.code);
    }
  }

  // Also remove known legacy tags from config.tagsToRemove
  if (config.tagsToRemove) {
    for (const tag of config.tagsToRemove) {
      if (tagSet.has(tag)) {
        tagSet.delete(tag);
        changed = true;
        appliedFixes.push('REMOVE_LEGACY_TAG');
      }
    }
  }

  return {
    changed,
    newTags: Array.from(tagSet),
    appliedFixes: [...new Set(appliedFixes)],
  };
}

// ============================================================================
// UTILITY HELPERS
// ============================================================================

/** Try to infer family from product title */
function inferFamilyFromTitle(titleLower, lookups) {
  const titlePatterns = [
    { pattern: /\bbong\b/, family: 'glass-bong' },
    { pattern: /\bwater pipe\b/, family: 'glass-bong' },
    { pattern: /\bdab rig\b/, family: 'glass-rig' },
    { pattern: /\bglass rig\b/, family: 'glass-rig' },
    { pattern: /\bsilicone rig\b/, family: 'silicone-rig' },
    { pattern: /\bhand pipe\b/, family: 'spoon-pipe' },
    { pattern: /\bspoon pipe\b/, family: 'spoon-pipe' },
    { pattern: /\bbubbler\b/, family: 'bubbler' },
    { pattern: /\bnectar collector\b/, family: 'nectar-collector' },
    { pattern: /\bhoney straw\b/, family: 'nectar-collector' },
    { pattern: /\bone hitter\b/, family: 'chillum-onehitter' },
    { pattern: /\bchillum\b/, family: 'chillum-onehitter' },
    { pattern: /\bdugout\b/, family: 'chillum-onehitter' },
    { pattern: /\bsteamroller\b/, family: 'steamroller' },
    { pattern: /\bbanger\b/, family: 'banger' },
    { pattern: /\bcarb cap\b/, family: 'carb-cap' },
    { pattern: /\bdab tool\b/, family: 'dab-tool' },
    { pattern: /\bdabber\b/, family: 'dab-tool' },
    { pattern: /\btorch\b/, family: 'torch' },
    { pattern: /\bgrinder\b/, family: 'grinder' },
    { pattern: /\brolling paper\b/, family: 'rolling-paper' },
    { pattern: /\brolling tray\b/, family: 'rolling-tray' },
    { pattern: /\bblunt wrap\b/, family: 'rolling-paper' },
    { pattern: /\bpre-roll\b/, family: 'rolling-paper' },
    { pattern: /\bflower bowl\b/, family: 'flower-bowl' },
    { pattern: /\bbowl piece\b/, family: 'flower-bowl' },
    { pattern: /\bash catcher\b/, family: 'ash-catcher' },
    { pattern: /\bdownstem\b/, family: 'downstem' },
    { pattern: /\bashtray\b/, family: 'ashtray' },
    { pattern: /\bvape battery\b/, family: 'vape-battery' },
    { pattern: /\bvape pen\b/, family: 'vape-battery' },
    { pattern: /\b510 battery\b/, family: 'vape-battery' },
    { pattern: /\bdrop ?down\b/, family: 'adapter' },
    { pattern: /\badapter\b/, family: 'adapter' },
    { pattern: /\bglass cleaner\b/, family: 'cleaning-supply' },
    { pattern: /\bpipe cleaner\b/, family: 'cleaning-supply' },
    { pattern: /\bpendant\b/, family: 'merch-pendant' },
    { pattern: /\bscale\b/, family: 'scale' },
    { pattern: /\bcontainer\b/, family: 'container' },
    { pattern: /\bjar\b/, family: 'container' },
    { pattern: /\blighter\b/, family: 'lighter' },
    { pattern: /\bscreen\b/, family: 'screen' },
    { pattern: /\bclip\b/, family: 'clip' },
    // Extraction & Packaging
    { pattern: /\bfep\b/i, family: 'fep-sheet' },
    { pattern: /\bptfe\b/i, family: 'ptfe-sheet' },
    { pattern: /\bparchment\b/, family: 'parchment-sheet' },
    { pattern: /\bsilicone pad\b/, family: 'silicone-pad' },
    { pattern: /\bsilicone mat\b/, family: 'silicone-pad' },
    { pattern: /\bdab mat\b/, family: 'silicone-pad' },
    { pattern: /\bmylar bag\b/, family: 'mylar-bag' },
    { pattern: /\bjoint tube\b/, family: 'joint-tube' },
    { pattern: /\bdoob tube\b/, family: 'joint-tube' },
  ];

  for (const { pattern, family } of titlePatterns) {
    if (pattern.test(titleLower)) {
      return `Suggest: family:${family}`;
    }
  }
  return null;
}

/** Find the closest match from a list (simple Levenshtein-like) */
function findClosestMatch(input, candidates) {
  if (candidates.length === 0) return null;

  let bestMatch = null;
  let bestScore = Infinity;

  for (const candidate of candidates) {
    const score = levenshtein(input.toLowerCase(), candidate.toLowerCase());
    if (score < bestScore && score <= Math.max(input.length, candidate.length) * 0.5) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestMatch ? `Did you mean: "${bestMatch}"?` : null;
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(productIssues, collectionIssues) {
  logSection('VALIDATION REPORT');

  // Count by severity
  const allIssues = [];
  for (const { issues } of productIssues) {
    allIssues.push(...issues);
  }
  allIssues.push(...collectionIssues);

  const counts = {};
  for (const sev of Object.values(SEVERITY)) {
    counts[sev] = allIssues.filter(i => i.severity === sev).length;
  }

  // Summary header
  console.log('\n--- ISSUE SUMMARY ---');
  for (const [sev, count] of Object.entries(counts)) {
    if (count > 0) {
      log(`  ${sev}: ${count} issues`, SEVERITY_COLORS[sev]);
    }
  }
  log(`  Total: ${allIssues.length} issues across ${productIssues.length} products checked`, 'cyan');

  const productsWithIssues = productIssues.filter(p => p.issues.length > 0);
  log(`  Products with issues: ${productsWithIssues.length}`, productsWithIssues.length > 0 ? 'yellow' : 'green');
  log(`  Products clean: ${productIssues.length - productsWithIssues.length}`, 'green');

  // Critical issues detail
  const criticalProducts = productIssues.filter(p =>
    p.issues.some(i => i.severity === SEVERITY.CRITICAL)
  );
  if (criticalProducts.length > 0) {
    logSection('CRITICAL ISSUES (require immediate attention)');
    for (const { product, issues } of criticalProducts) {
      const criticals = issues.filter(i => i.severity === SEVERITY.CRITICAL);
      console.log(`\n  ${product.title} (ID: ${product.id})`);
      console.log(`    Tags: ${product.tags || '(none)'}`);
      for (const issue of criticals) {
        log(`    [${issue.code}] ${issue.message}`, 'red');
        if (issue.fix) {
          const fixParts = [];
          if (issue.fix.remove) fixParts.push(`remove: ${issue.fix.remove.join(', ')}`);
          if (issue.fix.add) fixParts.push(`add: ${issue.fix.add.join(', ')}`);
          log(`      Fix: ${fixParts.join(' | ')}`, 'green');
        }
      }
    }
  }

  // High issues detail
  const highProducts = productIssues.filter(p =>
    p.issues.some(i => i.severity === SEVERITY.HIGH)
  );
  if (highProducts.length > 0) {
    logSection('HIGH PRIORITY ISSUES');
    for (const { product, issues } of highProducts) {
      const highs = issues.filter(i => i.severity === SEVERITY.HIGH);
      console.log(`\n  ${product.title} (ID: ${product.id})`);
      for (const issue of highs) {
        log(`    [${issue.code}] ${issue.message}`, 'red');
        if (issue.suggestion) log(`      Suggestion: ${issue.suggestion}`, 'cyan');
        if (issue.fix) {
          const fixParts = [];
          if (issue.fix.remove) fixParts.push(`remove: ${issue.fix.remove.join(', ')}`);
          if (issue.fix.add) fixParts.push(`add: ${issue.fix.add.join(', ')}`);
          log(`      Fix: ${fixParts.join(' | ')}`, 'green');
        }
      }
    }
  }

  // Collection issues
  if (collectionIssues.length > 0) {
    logSection('COLLECTION RULE ISSUES');
    for (const issue of collectionIssues) {
      log(`  [${issue.severity}] ${issue.collection}: ${issue.message}`, SEVERITY_COLORS[issue.severity]);
    }
  }

  // Medium issues (summary only)
  const mediumCount = allIssues.filter(i => i.severity === SEVERITY.MEDIUM).length;
  if (mediumCount > 0) {
    logSection(`MEDIUM ISSUES (${mediumCount} total)`);
    const mediumProducts = productIssues.filter(p =>
      p.issues.some(i => i.severity === SEVERITY.MEDIUM)
    );
    // Group by issue code
    const byCode = {};
    for (const { issues } of mediumProducts) {
      for (const issue of issues.filter(i => i.severity === SEVERITY.MEDIUM)) {
        if (!byCode[issue.code]) byCode[issue.code] = 0;
        byCode[issue.code]++;
      }
    }
    for (const [code, count] of Object.entries(byCode).sort((a, b) => b[1] - a[1])) {
      log(`    ${code}: ${count} products`, 'yellow');
    }
  }

  // Tag distribution summary
  logSection('TAG COVERAGE STATISTICS');
  const stats = computeTagStats(productIssues.map(p => p.product));
  console.log(`\n  Family tags:    ${stats.withFamily}/${stats.total} products (${pct(stats.withFamily, stats.total)})`);
  console.log(`  Pillar tags:    ${stats.withPillar}/${stats.total} products (${pct(stats.withPillar, stats.total)})`);
  console.log(`  Use tags:       ${stats.withUse}/${stats.total} products (${pct(stats.withUse, stats.total)})`);
  console.log(`  Material tags:  ${stats.withMaterial}/${stats.total} products (${pct(stats.withMaterial, stats.total)})`);
  console.log(`  Brand tags:     ${stats.withBrand}/${stats.total} products (${pct(stats.withBrand, stats.total)})`);

  if (stats.familyDistribution) {
    console.log('\n  Family distribution (top 15):');
    const sorted = Object.entries(stats.familyDistribution).sort((a, b) => b[1] - a[1]);
    for (const [family, count] of sorted.slice(0, 15)) {
      const bar = '█'.repeat(Math.min(50, Math.round(count / stats.total * 200)));
      console.log(`    ${family.padEnd(20)} ${String(count).padStart(4)} ${bar}`);
    }
  }

  return { counts, productsWithIssues: productsWithIssues.length };
}

function computeTagStats(products) {
  const stats = {
    total: products.length,
    withFamily: 0,
    withPillar: 0,
    withUse: 0,
    withMaterial: 0,
    withBrand: 0,
    familyDistribution: {},
  };

  for (const product of products) {
    const tags = parseProductTags(product.tags);
    if (tags.families.length > 0) stats.withFamily++;
    if (tags.pillars.length > 0) stats.withPillar++;
    if (tags.uses.length > 0) stats.withUse++;
    if (tags.materials.length > 0) stats.withMaterial++;
    if (tags.brands.length > 0) stats.withBrand++;

    for (const family of tags.families) {
      stats.familyDistribution[family] = (stats.familyDistribution[family] || 0) + 1;
    }
  }

  return stats;
}

function pct(n, total) {
  if (total === 0) return '0%';
  return `${Math.round(n / total * 100)}%`;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  const execute = args.includes('--execute');
  const jsonOutput = args.includes('--json');

  console.log('\n' + '═'.repeat(70));
  log('  METADATA VALIDATOR', 'bright');
  log(`  Store: ${config.shopify.storeUrl}`, 'cyan');
  log(`  Mode: ${shouldFix ? (execute ? 'FIX + EXECUTE' : 'FIX (dry run)') : 'REPORT ONLY'}`, shouldFix ? (execute ? 'green' : 'yellow') : 'cyan');
  console.log('═'.repeat(70));

  try {
    // Step 1: Fetch products from all vendors
    logSection('STEP 1: FETCHING PRODUCTS');
    const vendors = [config.vendor, 'Oil Slick', 'Cloud YHS'];
    let allProducts = [];

    for (const vendor of vendors) {
      try {
        const products = await api.getAllProductsByVendor(vendor);
        log(`  Fetched ${products.length} products from "${vendor}"`, 'cyan');
        allProducts.push(...products);
      } catch (error) {
        log(`  Warning: Could not fetch "${vendor}" products: ${error.message}`, 'yellow');
      }
    }
    log(`  Total: ${allProducts.length} products`, 'bright');

    // Step 2: Build taxonomy lookups
    const lookups = buildTaxonomyLookups();
    log(`  Taxonomy: ${lookups.validFamilies.size} families, ${lookups.validPillars.size} pillars, ${lookups.validUses.size} uses`, 'cyan');

    // Step 3: Validate each product
    logSection('STEP 2: VALIDATING PRODUCTS');
    const productIssues = [];

    for (const product of allProducts) {
      const issues = validateProduct(product, lookups);
      productIssues.push({ product, issues });
    }

    // Step 4: Validate collection rules
    logSection('STEP 3: VALIDATING COLLECTION RULES');
    const allCollections = [
      config.collections.main,
      ...config.collections.categories,
      ...config.collections.accessories,
      ...(config.collections.additionalCategories || []),
      ...(config.collections.extractionCollections || []),
    ];
    // Expand brand/feature collections
    for (const brand of config.collections.brands) {
      allCollections.push({
        handle: brand.handle,
        title: brand.title,
        rules: [
          { column: 'tag', relation: 'equals', condition: brand.tag },
          { column: 'vendor', relation: 'equals', condition: config.vendor },
        ],
        disjunctive: false,
      });
    }
    for (const feature of config.collections.features) {
      if (feature.rules) {
        allCollections.push(feature);
      } else {
        allCollections.push({
          handle: feature.handle,
          title: feature.title,
          rules: [
            { column: 'tag', relation: 'equals', condition: feature.tag },
            { column: 'vendor', relation: 'equals', condition: config.vendor },
          ],
          disjunctive: false,
        });
      }
    }

    const collectionIssues = validateCollectionRules(allCollections, allProducts, lookups);

    // Step 5: Generate report
    if (jsonOutput) {
      const output = {
        summary: {
          totalProducts: allProducts.length,
          productsWithIssues: productIssues.filter(p => p.issues.length > 0).length,
          collectionIssues: collectionIssues.length,
        },
        productIssues: productIssues
          .filter(p => p.issues.length > 0)
          .map(p => ({
            id: p.product.id,
            title: p.product.title,
            vendor: p.product.vendor,
            tags: p.product.tags,
            issues: p.issues,
          })),
        collectionIssues,
      };
      console.log(JSON.stringify(output, null, 2));
    } else {
      const reportResult = generateReport(productIssues, collectionIssues);

      // Step 6: Apply fixes if requested
      if (shouldFix) {
        logSection('STEP 4: AUTO-FIX');
        if (!execute) {
          log('DRY RUN MODE - No changes will be made', 'yellow');
        }

        let fixed = 0;
        let errors = 0;

        for (const { product, issues } of productIssues) {
          if (issues.length === 0) continue;

          const result = computeAutoFix(product, issues);
          if (!result.changed) continue;

          console.log(`\n  ${product.title} (ID: ${product.id})`);
          log(`    Fixes: ${result.appliedFixes.join(', ')}`, 'green');
          log(`    New tags: ${result.newTags.join(', ')}`, 'cyan');

          if (execute) {
            try {
              await api.updateProduct(product.id, {
                id: product.id,
                tags: result.newTags.join(', '),
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
        }

        console.log(`\n--- AUTO-FIX RESULTS ---`);
        log(`  Products fixed: ${fixed}`, 'green');
        if (errors > 0) log(`  Errors: ${errors}`, 'red');

        if (!execute) {
          log('\nTo apply fixes, run with --fix --execute', 'yellow');
        }
      }
    }

    logSection('COMPLETE');

  } catch (error) {
    log(`\nFatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

// Export for use by other scripts
export {
  validateProduct,
  validateCollectionRules,
  parseProductTags,
  buildTaxonomyLookups,
  computeAutoFix,
  inferFamilyFromTitle,
  SEVERITY,
};

main();
