// =============================================================================
// Collection Rule Builders
// DRY helpers that reduce duplication in collection config definitions
// =============================================================================

const DEFAULT_VENDOR = process.env.SHOPIFY_VENDOR || 'What You Need';

/**
 * Create a vendor filter rule.
 */
export function vendorRule(vendor = DEFAULT_VENDOR) {
  return { column: 'vendor', relation: 'equals', condition: vendor };
}

/**
 * Create a tag-equals rule.
 */
export function tagRule(tag) {
  return { column: 'tag', relation: 'equals', condition: tag };
}

/**
 * Collection filtered by a single family tag + vendor.
 * Covers the most common pattern: family:X + vendor:Y
 */
export function familyCollection(handle, title, family, vendor = DEFAULT_VENDOR) {
  return {
    handle,
    title,
    rules: [tagRule(`family:${family}`), vendorRule(vendor)],
    disjunctive: false,
  };
}

/**
 * Collection filtered by multiple tags + vendor.
 */
export function tagCollection(handle, title, tags, { vendor = DEFAULT_VENDOR, disjunctive = false, noVendor = false } = {}) {
  const rules = tags.map(t => tagRule(t));
  if (!noVendor) rules.push(vendorRule(vendor));
  return { handle, title, rules, disjunctive };
}

/**
 * Brand collection: brand tag + vendor.
 */
export function brandCollection(handle, title, brandTag) {
  return { handle, title, tag: `brand:${brandTag}` };
}

/**
 * Feature/style collection: style tag + vendor.
 */
export function featureCollection(handle, title, styleTag) {
  return { handle, title, tag: `style:${styleTag}` };
}

export default {
  vendorRule,
  tagRule,
  familyCollection,
  tagCollection,
  brandCollection,
  featureCollection,
};
