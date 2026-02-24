import 'dotenv/config';
import api from './shopify-api.js';

async function replaceTag(productId, title, oldTag, newTag) {
  const data = await api.getProduct(productId);
  const product = data.product;
  const currentTags = product.tags ? product.tags.split(',').map(t => t.trim()) : [];

  console.log('  Current tags for:', title);
  const relevant = currentTags.filter(t =>
    t.startsWith('family:') || t.startsWith('use:') ||
    t.startsWith('material:') || t.startsWith('pillar:'));
  console.log('    Relevant:', relevant.join(', '));

  const newTags = currentTags.map(t => t === oldTag ? newTag : t);

  if (newTags.indexOf('use:dabbing') === -1) newTags.push('use:dabbing');
  if (newTags.indexOf('pillar:accessory') === -1) newTags.push('pillar:accessory');

  const updatedTags = newTags.join(', ');
  await api.updateProduct(productId, { id: productId, tags: updatedTags });
  console.log('    FIXED: Replaced', oldTag, '->', newTag);
}

console.log('=== FIX: Nectar tips mis-tagged as flower-bowl ===');
console.log('These are nectar collector tips, not flower bowls.\n');

await replaceTag(9885269557528,
  '1.5" CERAMIC 10MM NECTAR TIP – 5-Pack',
  'family:flower-bowl', 'family:nectar-collector');

await replaceTag(9885267624216,
  '2.5" 14mm Quartz Nectar Tip',
  'family:flower-bowl', 'family:nectar-collector');

await replaceTag(9885267591448,
  '2.5" 14mm Titanium Nectar Tip',
  'family:flower-bowl', 'family:nectar-collector');

console.log('\nDone! 3 nectar tips moved from flower-bowls to nectar-collectors.');
