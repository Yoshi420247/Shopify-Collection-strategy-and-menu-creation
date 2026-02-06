import { describe, it, expect } from 'vitest';
import {
  vendorRule,
  tagRule,
  familyCollection,
  tagCollection,
} from '../src/lib/rule-builder.js';

describe('vendorRule', () => {
  it('creates a vendor rule with default vendor', () => {
    const rule = vendorRule('What You Need');
    expect(rule).toEqual({
      column: 'vendor',
      relation: 'equals',
      condition: 'What You Need',
    });
  });
});

describe('tagRule', () => {
  it('creates a tag equals rule', () => {
    const rule = tagRule('family:glass-bong');
    expect(rule).toEqual({
      column: 'tag',
      relation: 'equals',
      condition: 'family:glass-bong',
    });
  });
});

describe('familyCollection', () => {
  it('creates a collection with family tag + vendor rule', () => {
    const col = familyCollection('bongs', 'Bongs', 'glass-bong', 'What You Need');
    expect(col.handle).toBe('bongs');
    expect(col.title).toBe('Bongs');
    expect(col.disjunctive).toBe(false);
    expect(col.rules).toHaveLength(2);
    expect(col.rules[0]).toEqual({
      column: 'tag',
      relation: 'equals',
      condition: 'family:glass-bong',
    });
    expect(col.rules[1]).toEqual({
      column: 'vendor',
      relation: 'equals',
      condition: 'What You Need',
    });
  });
});

describe('tagCollection', () => {
  it('creates a collection with multiple tags + vendor', () => {
    const col = tagCollection(
      'quartz-bangers', 'Quartz Bangers',
      ['family:banger', 'material:quartz'],
      { vendor: 'What You Need' }
    );
    expect(col.handle).toBe('quartz-bangers');
    expect(col.rules).toHaveLength(3);
    expect(col.rules[0].condition).toBe('family:banger');
    expect(col.rules[1].condition).toBe('material:quartz');
    expect(col.rules[2].condition).toBe('What You Need');
  });

  it('creates a collection without vendor when noVendor is true', () => {
    const col = tagCollection(
      'concentrate-jars', 'Concentrate Jars',
      ['family:container', 'use:storage'],
      { noVendor: true }
    );
    expect(col.rules).toHaveLength(2);
    expect(col.rules.every(r => r.column === 'tag')).toBe(true);
  });

  it('defaults disjunctive to false', () => {
    const col = tagCollection('test', 'Test', ['family:glass-bong'], { vendor: 'V' });
    expect(col.disjunctive).toBe(false);
  });
});
