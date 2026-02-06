// =============================================================================
// Tag Analysis Module
// Pure functions for analyzing product tags against the taxonomy
// Extracted from collection-strategy-bot.js for reuse and testability
// =============================================================================

import taxonomy from '../data/taxonomy.js';

/**
 * Parse a product's comma-separated tag string into an array of trimmed tags.
 */
export function parseTags(tagString) {
  if (!tagString) return [];
  return tagString.split(',').map(t => t.trim()).filter(Boolean);
}

/**
 * Split a namespaced tag (e.g. "family:glass-bong") into { prefix, value }.
 * Returns { prefix: null, value: tag } for non-namespaced tags.
 */
export function parseNamespacedTag(tag) {
  const colonIdx = tag.indexOf(':');
  if (colonIdx === -1) return { prefix: null, value: tag };
  return { prefix: tag.substring(0, colonIdx), value: tag.substring(colonIdx + 1) };
}

/**
 * Validate a single product's tags against the taxonomy.
 * Returns a structured result with issues found.
 */
export function validateProductTags(product, taxonomyOverride = null) {
  const tx = taxonomyOverride || taxonomy;
  const validFamilies = new Set(Object.keys(tx.families));
  const validPillars = new Set(Object.keys(tx.pillars));
  const validUses = new Set(Object.keys(tx.uses));
  const validMaterials = new Set(tx.materials);
  const validBrands = new Set(tx.brands);

  const tags = parseTags(product.tags);
  const families = [];
  const pillars = [];
  const uses = [];
  const invalidTags = [];
  const mismatches = [];

  for (const tag of tags) {
    const { prefix, value } = parseNamespacedTag(tag);
    if (!prefix) continue;

    if (prefix === 'family') {
      families.push(value);
      if (!validFamilies.has(value)) {
        invalidTags.push({ tag, reason: `Unknown family: "${value}" not in taxonomy` });
      }
    }
    if (prefix === 'pillar') {
      pillars.push(value);
      if (!validPillars.has(value)) {
        invalidTags.push({ tag, reason: `Unknown pillar: "${value}"` });
      }
    }
    if (prefix === 'use') {
      uses.push(value);
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

  // Cross-validate family <-> pillar/use
  for (const family of families) {
    const def = tx.families[family];
    if (!def) continue;
    if (def.pillar && pillars.length > 0 && !pillars.includes(def.pillar)) {
      mismatches.push(`Expected pillar:${def.pillar}, found pillar:${pillars.join(',')}`);
    }
    if (def.use && uses.length > 0 && !uses.includes(def.use)) {
      mismatches.push(`Expected use:${def.use}, found use:${uses.join(',')}`);
    }
  }

  return {
    productId: product.id,
    productTitle: product.title,
    tags,
    families,
    pillars,
    uses,
    hasFamily: families.length > 0,
    hasMultipleFamilies: families.length > 1,
    invalidTags,
    mismatches,
  };
}

/**
 * Analyze tags for an array of products.
 * Returns aggregate statistics and per-product results.
 */
export function analyzeProductTags(products, taxonomyOverride = null) {
  const tx = taxonomyOverride || taxonomy;
  const validFamilies = new Set(Object.keys(tx.families));

  const results = products.map(p => validateProductTags(p, tx));
  const tagStats = {};
  const productsByFamily = {};
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
    const tags = parseTags(product.tags);
    for (const tag of tags) {
      tagStats[tag] = (tagStats[tag] || 0) + 1;
      const { prefix } = parseNamespacedTag(tag);
      const bucket = prefix && tagPatterns[prefix] ? prefix : 'other';
      tagPatterns[bucket].add(tag);
    }
  }

  for (const r of results) {
    for (const f of r.families) {
      if (!productsByFamily[f]) productsByFamily[f] = [];
      productsByFamily[f].push({ id: r.productId, title: r.productTitle });
    }
  }

  const withoutFamily = results.filter(r => !r.hasFamily);
  const withInvalidTags = results.filter(r => r.invalidTags.length > 0);
  const withMismatches = results.filter(r => r.mismatches.length > 0);
  const withMultipleFamilies = results.filter(r => r.hasMultipleFamilies);

  const total = products.length;
  const healthPct = total > 0 ? Math.round((total - withoutFamily.length) / total * 100) : 0;
  const invalidPct = total > 0 ? Math.round(withInvalidTags.length / total * 100) : 0;
  const mismatchPct = total > 0 ? Math.round(withMismatches.length / total * 100) : 0;

  let overall = 'HEALTHY';
  if (healthPct < 95 || invalidPct > 2 || mismatchPct > 2) overall = 'NEEDS ATTENTION';
  if (healthPct < 80 || invalidPct > 10 || mismatchPct > 10) overall = 'NEEDS FIXING';

  return {
    total,
    results,
    tagStats,
    tagPatterns,
    productsByFamily,
    withoutFamily,
    withInvalidTags,
    withMismatches,
    withMultipleFamilies,
    health: { familyCoverage: healthPct, invalidPct, mismatchPct, overall },
  };
}

/**
 * Generate optimal tags for a product based on taxonomy rules.
 * Keeps valid structured tags, removes legacy tags, and auto-infers missing pillar/use from family.
 */
export function generateOptimalTags(product, taxonomyOverride = null, tagsToRemove = []) {
  const tx = taxonomyOverride || taxonomy;
  const currentTags = parseTags(product.tags);
  const optimalTags = new Set();

  const validPrefixes = ['family', 'material', 'use', 'pillar', 'brand', 'style', 'joint_size', 'joint_gender', 'joint_angle'];

  // Step 1: Keep valid structured tags
  for (const tag of currentTags) {
    const { prefix } = parseNamespacedTag(tag);
    if (prefix && validPrefixes.includes(prefix)) {
      optimalTags.add(tag);
    }
  }

  // Step 2: Remove format tags when family exists
  const families = currentTags.filter(t => t.startsWith('family:'));
  if (families.length > 0) {
    for (const tag of currentTags) {
      if (tag.startsWith('format:')) optimalTags.delete(tag);
    }
  }

  // Step 3: Auto-add pillar/use from family definition
  for (const familyTag of families) {
    const familyName = familyTag.substring(7);
    const def = tx.families[familyName];
    if (!def) continue;
    if (def.pillar) optimalTags.add(`pillar:${def.pillar}`);
    if (def.use) optimalTags.add(`use:${def.use}`);
  }

  // Step 4: Keep length/bundle tags
  for (const tag of currentTags) {
    if (tag.startsWith('length:') || tag.startsWith('bundle:')) {
      optimalTags.add(tag);
    }
  }

  // Step 5: Remove legacy tags
  for (const tag of tagsToRemove) {
    optimalTags.delete(tag);
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

  return Array.from(optimalTags);
}

export default {
  parseTags,
  parseNamespacedTag,
  validateProductTags,
  analyzeProductTags,
  generateOptimalTags,
};
