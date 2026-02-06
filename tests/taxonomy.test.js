import { describe, it, expect } from 'vitest';
import {
  taxonomy,
  pillars,
  uses,
  families,
  familyMaterials,
  materials,
  brands,
  styles,
  tagsToRemove,
} from '../src/data/taxonomy.js';

describe('taxonomy data integrity', () => {
  it('exports a complete taxonomy object', () => {
    expect(taxonomy).toBeDefined();
    expect(taxonomy.pillars).toBeDefined();
    expect(taxonomy.uses).toBeDefined();
    expect(taxonomy.families).toBeDefined();
    expect(taxonomy.materials).toBeDefined();
    expect(taxonomy.brands).toBeDefined();
  });

  it('has four pillars', () => {
    expect(Object.keys(pillars)).toHaveLength(4);
    expect(pillars).toHaveProperty('smokeshop-device');
    expect(pillars).toHaveProperty('accessory');
    expect(pillars).toHaveProperty('merch');
    expect(pillars).toHaveProperty('packaging');
  });

  it('has six use cases', () => {
    expect(Object.keys(uses)).toHaveLength(6);
  });

  it('every family references a valid pillar', () => {
    for (const [, def] of Object.entries(families)) {
      expect(Object.keys(pillars)).toContain(def.pillar);
    }
  });

  it('every family references a valid use or null', () => {
    for (const [, def] of Object.entries(families)) {
      if (def.use !== null) {
        expect(Object.keys(uses)).toContain(def.use);
      }
    }
  });

  it('every family has a display name', () => {
    for (const [, def] of Object.entries(families)) {
      expect(def.display).toBeTruthy();
    }
  });

  it('familyMaterials references valid families', () => {
    const familyNames = Object.keys(families);
    for (const family of Object.keys(familyMaterials)) {
      expect(familyNames).toContain(family);
    }
  });

  it('familyMaterials references valid materials', () => {
    for (const [family, mats] of Object.entries(familyMaterials)) {
      for (const mat of mats) {
        expect(materials).toContain(mat);
      }
    }
  });

  it('has at least 10 brands', () => {
    expect(brands.length).toBeGreaterThanOrEqual(10);
  });

  it('has at least 5 styles', () => {
    expect(styles.length).toBeGreaterThanOrEqual(5);
  });

  it('tagsToRemove are all format: or malformed prefix tags', () => {
    for (const tag of tagsToRemove) {
      expect(tag.includes(':')).toBe(true);
    }
  });
});
