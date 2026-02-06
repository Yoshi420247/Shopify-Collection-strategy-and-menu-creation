import { describe, it, expect } from 'vitest';
import {
  parseTags,
  parseNamespacedTag,
  validateProductTags,
  analyzeProductTags,
  generateOptimalTags,
} from '../src/lib/tag-analysis.js';
import { taxonomy } from '../src/data/taxonomy.js';

// =============================================================================
// parseTags
// =============================================================================

describe('parseTags', () => {
  it('parses comma-separated tags', () => {
    expect(parseTags('family:glass-bong, material:glass, pillar:smokeshop-device'))
      .toEqual(['family:glass-bong', 'material:glass', 'pillar:smokeshop-device']);
  });

  it('handles empty string', () => {
    expect(parseTags('')).toEqual([]);
  });

  it('handles null/undefined', () => {
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
  });

  it('trims whitespace from tags', () => {
    expect(parseTags('  family:glass-bong  ,  material:glass  '))
      .toEqual(['family:glass-bong', 'material:glass']);
  });

  it('filters out empty entries', () => {
    expect(parseTags('family:glass-bong,,material:glass'))
      .toEqual(['family:glass-bong', 'material:glass']);
  });
});

// =============================================================================
// parseNamespacedTag
// =============================================================================

describe('parseNamespacedTag', () => {
  it('parses namespaced tag correctly', () => {
    expect(parseNamespacedTag('family:glass-bong'))
      .toEqual({ prefix: 'family', value: 'glass-bong' });
  });

  it('handles tags without colon', () => {
    expect(parseNamespacedTag('some-plain-tag'))
      .toEqual({ prefix: null, value: 'some-plain-tag' });
  });

  it('handles tags with multiple colons', () => {
    expect(parseNamespacedTag('family:some:thing'))
      .toEqual({ prefix: 'family', value: 'some:thing' });
  });

  it('handles empty value after colon', () => {
    expect(parseNamespacedTag('family:'))
      .toEqual({ prefix: 'family', value: '' });
  });
});

// =============================================================================
// validateProductTags
// =============================================================================

describe('validateProductTags', () => {
  it('identifies valid product with all correct tags', () => {
    const product = {
      id: 1,
      title: 'Test Bong',
      tags: 'family:glass-bong, pillar:smokeshop-device, use:flower-smoking, material:glass',
    };
    const result = validateProductTags(product);
    expect(result.hasFamily).toBe(true);
    expect(result.families).toEqual(['glass-bong']);
    expect(result.invalidTags).toHaveLength(0);
    expect(result.mismatches).toHaveLength(0);
  });

  it('flags product without family tag', () => {
    const product = {
      id: 2,
      title: 'Unknown Product',
      tags: 'material:glass, pillar:accessory',
    };
    const result = validateProductTags(product);
    expect(result.hasFamily).toBe(false);
  });

  it('detects unknown family tag', () => {
    const product = {
      id: 3,
      title: 'Bad Family',
      tags: 'family:not-a-real-family',
    };
    const result = validateProductTags(product);
    expect(result.invalidTags).toHaveLength(1);
    expect(result.invalidTags[0].tag).toBe('family:not-a-real-family');
  });

  it('detects unknown material', () => {
    const product = {
      id: 4,
      title: 'Mystery Material',
      tags: 'family:glass-bong, material:unobtanium',
    };
    const result = validateProductTags(product);
    expect(result.invalidTags.some(t => t.tag === 'material:unobtanium')).toBe(true);
  });

  it('detects family/pillar mismatch', () => {
    const product = {
      id: 5,
      title: 'Mismatched Tags',
      tags: 'family:glass-bong, pillar:accessory',
    };
    const result = validateProductTags(product);
    expect(result.mismatches.length).toBeGreaterThan(0);
    expect(result.mismatches[0]).toContain('Expected pillar:smokeshop-device');
  });

  it('detects family/use mismatch', () => {
    const product = {
      id: 6,
      title: 'Mismatched Use',
      tags: 'family:glass-bong, use:dabbing',
    };
    const result = validateProductTags(product);
    expect(result.mismatches.length).toBeGreaterThan(0);
    expect(result.mismatches[0]).toContain('Expected use:flower-smoking');
  });

  it('detects multiple family tags', () => {
    const product = {
      id: 7,
      title: 'Double Family',
      tags: 'family:glass-bong, family:bubbler',
    };
    const result = validateProductTags(product);
    expect(result.hasMultipleFamilies).toBe(true);
  });

  it('handles product with no tags', () => {
    const product = { id: 8, title: 'No Tags', tags: '' };
    const result = validateProductTags(product);
    expect(result.hasFamily).toBe(false);
    expect(result.tags).toHaveLength(0);
  });
});

// =============================================================================
// analyzeProductTags (aggregate)
// =============================================================================

describe('analyzeProductTags', () => {
  const products = [
    { id: 1, title: 'Bong A', tags: 'family:glass-bong, pillar:smokeshop-device, material:glass' },
    { id: 2, title: 'Bong B', tags: 'family:glass-bong, pillar:smokeshop-device, material:borosilicate' },
    { id: 3, title: 'Pipe A', tags: 'family:spoon-pipe, pillar:smokeshop-device' },
    { id: 4, title: 'No Family', tags: 'material:glass' },
    { id: 5, title: 'Bad Tag', tags: 'family:fake-family' },
  ];

  it('counts total products', () => {
    const analysis = analyzeProductTags(products);
    expect(analysis.total).toBe(5);
  });

  it('groups products by family', () => {
    const analysis = analyzeProductTags(products);
    expect(analysis.productsByFamily['glass-bong']).toHaveLength(2);
    expect(analysis.productsByFamily['spoon-pipe']).toHaveLength(1);
  });

  it('identifies products without family', () => {
    const analysis = analyzeProductTags(products);
    expect(analysis.withoutFamily).toHaveLength(1);
    expect(analysis.withoutFamily[0].productId).toBe(4);
  });

  it('identifies products with invalid tags', () => {
    const analysis = analyzeProductTags(products);
    expect(analysis.withInvalidTags).toHaveLength(1);
    expect(analysis.withInvalidTags[0].productId).toBe(5);
  });

  it('computes health score', () => {
    const analysis = analyzeProductTags(products);
    expect(analysis.health.familyCoverage).toBe(80);
    // 80% coverage + 20% invalid → NEEDS FIXING (invalidPct > 10)
    expect(analysis.health.overall).toBe('NEEDS FIXING');
  });

  it('handles empty product list', () => {
    const analysis = analyzeProductTags([]);
    expect(analysis.total).toBe(0);
    expect(analysis.health.familyCoverage).toBe(0);
  });
});

// =============================================================================
// generateOptimalTags
// =============================================================================

describe('generateOptimalTags', () => {
  it('keeps valid structured tags', () => {
    const product = { title: 'Test', tags: 'family:glass-bong, material:glass, pillar:smokeshop-device' };
    const tags = generateOptimalTags(product);
    expect(tags).toContain('family:glass-bong');
    expect(tags).toContain('material:glass');
    expect(tags).toContain('pillar:smokeshop-device');
  });

  it('removes format tags when family exists', () => {
    const product = { title: 'Test', tags: 'family:glass-bong, format:bong' };
    const tags = generateOptimalTags(product);
    expect(tags).toContain('family:glass-bong');
    expect(tags).not.toContain('format:bong');
  });

  it('auto-adds pillar and use from family definition', () => {
    const product = { title: 'Test', tags: 'family:glass-bong' };
    const tags = generateOptimalTags(product);
    expect(tags).toContain('pillar:smokeshop-device');
    expect(tags).toContain('use:flower-smoking');
  });

  it('infers material:silicone from title', () => {
    const product = { title: 'Silicone Bong', tags: 'family:glass-bong' };
    const tags = generateOptimalTags(product);
    expect(tags).toContain('material:silicone');
  });

  it('infers material:quartz from title', () => {
    const product = { title: 'Quartz Banger 14mm', tags: 'family:banger' };
    const tags = generateOptimalTags(product);
    expect(tags).toContain('material:quartz');
  });

  it('removes legacy tags from tagsToRemove list', () => {
    const product = { title: 'Test', tags: 'family:glass-bong, format:bong' };
    const tags = generateOptimalTags(product, null, ['format:bong']);
    expect(tags).not.toContain('format:bong');
  });

  it('keeps length and bundle tags', () => {
    const product = { title: 'Test', tags: 'family:glass-bong, length:12in, bundle:3pack' };
    const tags = generateOptimalTags(product);
    expect(tags).toContain('length:12in');
    expect(tags).toContain('bundle:3pack');
  });

  it('handles product with no tags', () => {
    const product = { title: 'Empty', tags: '' };
    const tags = generateOptimalTags(product);
    expect(Array.isArray(tags)).toBe(true);
  });
});
