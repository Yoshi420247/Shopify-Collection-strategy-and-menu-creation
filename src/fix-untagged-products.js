import 'dotenv/config';
import api from './shopify-api.js';

async function setTags(productId, title, tags) {
  const data = await api.getProduct(productId);
  const product = data.product;
  const currentTags = product.tags ? product.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
  const newTags = new Set(currentTags);
  for (const tag of tags) {
    newTags.add(tag);
  }
  const updatedTags = Array.from(newTags).join(', ');
  if (updatedTags === product.tags) {
    console.log('  SKIP (already has tags):', title);
    return;
  }
  await api.updateProduct(productId, { id: productId, tags: updatedTags });
  console.log('  FIXED:', title);
  console.log('    Tags set:', tags.join(', '));
}

// === ZIG ZAG ROLLING PAPERS / WRAPS / TIPS ===
const zigZagRolling = [
  'family:rolling-paper', 'use:rolling', 'pillar:accessory', 'brand:zig-zag',
];
const zigZagWrap = [
  'family:rolling-paper', 'use:rolling', 'pillar:accessory', 'brand:zig-zag',
];

console.log('=== ZIG ZAG PAPERS / WRAPS / TIPS ===');
await setTags(9885280108824, 'Zig Zag Hemp Wraps Npp – Island Vibes', zigZagWrap);
await setTags(9885280141592, 'Zig Zag Hemp Wraps Npp – Blue Dream', zigZagWrap);
await setTags(9885284237592, 'Zig Zag 1 1/4 Unbleached Papers Carton', zigZagRolling);
await setTags(9885284270360, 'Zig Zag Unbleached King Slim Papers Carton', zigZagRolling);
await setTags(9885284335896, 'Zig Zag 1 1/4 Organic Hemp Papers', zigZagRolling);
await setTags(9885284630808, 'Zig Zag Mini Palm Rolls Carton 2pk', zigZagWrap);
await setTags(9885289808152, 'Zig Zag Original White Papers – $99.99', zigZagRolling);
await setTags(9885294821656, 'Zig Zag 1 1/4 French Orange Papers Promo Display', [...zigZagRolling, 'bundle:display-box']);
await setTags(9885294887192, 'Zig Zag  Original White Papers Promo Display', [...zigZagRolling, 'bundle:display-box']);
await setTags(10068159758616, 'Zig Zag Hemp Wraps Npp – Mellow Haze', zigZagWrap);
await setTags(10068161134872, 'Zig Zag Unbleached Rolling Tips 50 Pack Carton', zigZagRolling);
await setTags(10068161397016, 'Zig Zag Unbleached Wide Rolling Tips 50 Pack Carton', zigZagRolling);
await setTags(10068162052376, 'Zig Zag 1 1/4 Unbleached Papers Carton', zigZagRolling);
await setTags(10068162216216, 'Zig Zag 1 1/4 Organic Hemp Papers', zigZagRolling);
await setTags(10068164280600, 'Zig Zag Original White Papers Promo Display', [...zigZagRolling, 'bundle:display-box']);
await setTags(10068487471384, 'ZIG ZAG MINI PALM ROLLS CARTON 2PK – BANANA', zigZagWrap);
await setTags(10068487569688, 'ZIG ZAG MINI PALM ROLLS CARTON 2PK – NATURAL', zigZagWrap);
await setTags(10068487635224, 'ZIG ZAG MINI PALM ROLLS CARTON 2PK – GRAPE', zigZagWrap);
await setTags(10068487733528, 'ZIG ZAG MINI PALM ROLLS CARTON 2PK – VANILLA', zigZagWrap);

console.log('\n=== VIBES PAPERS ===');
await setTags(9885290692888, 'Vibes Hemp Papers Box – 1.25"',
  ['family:rolling-paper', 'use:rolling', 'pillar:accessory', 'brand:vibes']);

console.log('\n=== OCB PAPERS ===');
await setTags(10068146782488, 'OCB Bamboo 1 1/4 Papers + Tips',
  ['family:rolling-paper', 'use:rolling', 'pillar:accessory']);

console.log('\n=== RAW TIPS ===');
const rawTips = ['family:rolling-paper', 'use:rolling', 'pillar:accessory', 'brand:raw'];
await setTags(10068152058136, 'RAW Black Classic Extra Long Perforated Tips 36bx', rawTips);
await setTags(10068152189208, 'RAW Gummed Tips 33ct 24bx', rawTips);
await setTags(10068153729304, 'RAW Original Tips', rawTips);
await setTags(10068153860376, 'RAW Tips the Rawlbook 10 Pages 480 Tips Total 1PC', rawTips);

console.log('\n=== BLAZY SUSAN FILTERS ===');
await setTags(10068149502232, 'Blazy Susan Purize Filters, 10ct Box, Regular, Pink',
  ['family:rolling-paper', 'use:rolling', 'pillar:accessory']);

console.log('\n=== CLIPPER LIGHTER ===');
await setTags(10068148781336, 'Clipper Classic Large | Zig-Zag – Collection 1',
  ['family:lighter', 'pillar:accessory', 'use:flower-smoking']);

console.log('\n=== GLASS DEVICES (NEED MANUAL VERIFICATION) ===');
// 4.5" WATERCOLOR DEWAR - "dewar" is a type of bubbler/rig
await setTags(10068496089368, '4.5" WATERCOLOR DEWAR',
  ['family:bubbler', 'material:glass', 'use:flower-smoking', 'pillar:smokeshop-device']);

// 4.5" COLOR DOG R - likely a small hand pipe (already has style:animal)
await setTags(10068500119832, '4.5" COLOR DOG R',
  ['family:spoon-pipe', 'material:glass', 'use:flower-smoking', 'pillar:smokeshop-device']);

// KERBY ARMED BOT – ORANGE (already has style:made-in-usa) - character pipe
await setTags(10068502544664, 'KERBY ARMED BOT – ORANGE',
  ['family:spoon-pipe', 'material:glass', 'use:flower-smoking', 'pillar:smokeshop-device', 'style:animal']);

console.log('\n=== DAB TOOLS / ACCESSORIES ===');
// ZENBLAZE HOT KNIFE - electronic dab tool
await setTags(10068503134488, 'ZENBLAZE HOT KNIFE W/ LED FLASHLIGHT',
  ['family:dab-tool', 'use:dabbing', 'pillar:accessory']);

// 2.5" RECLAIM CATCHER - reclaim catcher = ash catcher for rigs
await setTags(10068514439448, '2.5" RECLAIM CATCHER',
  ['family:ash-catcher', 'material:glass', 'use:dabbing', 'pillar:accessory']);

// 4" CRYSTAL POKER (already has style:made-in-usa)
await setTags(10068522860824, '4" CRYSTAL POKER – MADE IN USA',
  ['family:dab-tool', 'material:glass', 'use:dabbing', 'pillar:accessory']);

console.log('\n=== TORCHES ===');
// MAVEN PRISM 4 PACK DISPLAY - Maven = torch brand
await setTags(10068516241688, 'MAVEN PRISM – 4 PACK DISPLAY',
  ['family:torch', 'use:dabbing', 'pillar:accessory', 'brand:maven', 'bundle:display-box']);

console.log('\n=== VAPE BATTERIES ===');
// NEBUL BY VIXOR - 510 battery
await setTags(10068521615640, '3.5" 480MAH NEBUL BY VIXOR – BOX OF 20 STICK BATTERIES',
  ['family:vape-battery', 'use:vaping', 'pillar:smokeshop-device']);

console.log('\n=== SCREENS ===');
await setTags(10068522271000, 'GLASS SCREENS – 10 PACK',
  ['family:screen', 'material:glass', 'use:flower-smoking', 'pillar:accessory']);
await setTags(10068522533144, 'BOX OF SCREENS – METAL',
  ['family:screen', 'material:metal', 'use:flower-smoking', 'pillar:accessory']);
await setTags(10068522631448, 'BOX OF SCREENS – BRASS',
  ['family:screen', 'material:metal', 'use:flower-smoking', 'pillar:accessory']);

console.log('\n=== MISC ACCESSORIES ===');
// HORNET HEMP WICK - hemp wick for lighting bowls
await setTags(10068523057432, 'HORNET HEMP WICK 60PCS',
  ['family:lighter', 'use:flower-smoking', 'pillar:accessory']);

console.log('\n=== OIL SLICK WHOLESALE (minimal tagging) ===');
await setTags(4480871071843, 'Blank Boxes for Jars',
  ['pillar:packaging', 'use:storage']);
await setTags(4480868286563, 'Custom Oil Slick Duo',
  ['family:silicone-pad', 'pillar:packaging', 'use:extraction', 'material:silicone']);
await setTags(4480877690979, 'Slick Ball Mini Bulk Bag',
  ['family:container', 'material:silicone', 'use:storage', 'pillar:packaging']);

console.log('\nDone! All 42 untagged products now have proper tags.');
