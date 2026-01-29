#!/usr/bin/env node
/**
 * Comprehensive Product Tagger
 * ============================
 * Reviews ALL products and ensures they have correct tags for collection assignment.
 *
 * Key distinctions:
 * - DAB RIGS (family:glass-rig): For concentrates, smaller, use bangers/nails
 * - BONGS/WATER PIPES (family:glass-bong): For flower/dry herb, larger, use bowls
 * - BUBBLERS (family:bubbler): Handheld water pipes
 * - HAND PIPES (family:spoon-pipe): Dry pipes without water
 * - NECTAR COLLECTORS (family:nectar-collector): Straw-like dab devices
 */

import 'dotenv/config';
import api from '../src/shopify-api.js';

// ============================================================================
// INTELLIGENT PRODUCT CATEGORIZATION
// ============================================================================

/**
 * Analyze product and determine correct tags
 */
function analyzeProduct(product) {
  const title = product.title.toLowerCase();
  const description = (product.body_html || '').toLowerCase();
  const existingTags = product.tags || '';
  const combined = title + ' ' + description;

  const result = {
    productId: product.id,
    title: product.title,
    currentTags: existingTags,
    missingTags: [],
    incorrectTags: [],
    suggestedFamily: null,
    suggestedPillar: null,
    suggestedUse: null,
    suggestedMaterial: [],
    confidence: 'high'
  };

  // ========================================================================
  // PRODUCT FAMILY DETECTION (Most Important - Order Matters!)
  // ========================================================================

  // Keywords that indicate DAB RIG (NOT a bong)
  const dabRigIndicators = [
    'dab rig', 'oil rig', 'concentrate rig', 'mini rig', 'micro rig',
    'recycler rig', 'incycler', 'fab egg', 'klein recycler',
    'terp slurper', 'for concentrates', 'for dabs', 'for wax',
    'with banger', 'banger included', 'dab setup'
  ];

  // Keywords that indicate BONG/WATER PIPE (NOT a dab rig)
  const bongIndicators = [
    'water pipe', 'bong', 'beaker', 'straight tube', 'ice catcher',
    'ice pinch', 'for flower', 'for dry herb', 'with bowl',
    'bowl included', 'smoking pipe', 'tube bong', 'scientific bong'
  ];

  // Keywords that indicate the product is for DABBING
  const dabbingKeywords = [
    'dab', 'concentrate', 'wax', 'shatter', 'rosin', 'extract',
    'banger', 'nail', 'carb cap', 'terp', 'e-nail', 'enail'
  ];

  // Keywords that indicate the product is for FLOWER
  const flowerKeywords = [
    'flower', 'dry herb', 'bowl', 'smoking', 'tobacco'
  ];

  // Check for explicit dab rig indicators first
  const hasDabRigIndicator = dabRigIndicators.some(ind => title.includes(ind));
  const hasBongIndicator = bongIndicators.some(ind => title.includes(ind));
  const hasDabbingContext = dabbingKeywords.some(kw => combined.includes(kw));
  const hasFlowerContext = flowerKeywords.some(kw => combined.includes(kw));

  // NECTAR TIPS (accessories for nectar collectors)
  if (title.includes('nectar tip') || title.includes('dab tip')) {
    result.suggestedFamily = 'family:nectar-tip';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:dabbing';
  }

  // QUARTZ INSERTS (accessories for bangers)
  else if (title.includes('insert') && (title.includes('quartz') || title.includes('banger'))) {
    result.suggestedFamily = 'family:quartz-insert';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:dabbing';
  }

  // NECTAR COLLECTORS - Check first (most specific)
  else if (title.includes('nectar collector') || title.includes('nectar straw') ||
      title.includes('dab straw') || title.includes('honey straw') ||
      title.includes('honey collector')) {
    result.suggestedFamily = 'family:nectar-collector';
    result.suggestedPillar = 'pillar:smokeshop-device';
    result.suggestedUse = 'use:dabbing';
  }

  // E-RIGS / ELECTRONIC DEVICES (actual electronic rigs only - Puffco, Carta, etc.)
  else if ((title.includes('e-rig') || title.includes('erig') ||
           title.includes('electric rig') || title.includes('electronic rig') ||
           title.includes('puffco peak') || title.includes('carta focus')) &&
           !title.includes('cap') && !title.includes('insert') && !title.includes('attachment')) {
    result.suggestedFamily = 'family:e-rig';
    result.suggestedPillar = 'pillar:smokeshop-device';
    result.suggestedUse = 'use:dabbing';
  }

  // RECYCLERS / INCYCLERS / ZONGCYCLERS - Dab rigs
  else if (title.includes('recycler') || title.includes('incycler') ||
           title.includes('zongcycler') || title.includes('cycler')) {
    result.suggestedFamily = 'family:glass-rig';
    result.suggestedPillar = 'pillar:smokeshop-device';
    result.suggestedUse = 'use:dabbing';
  }

  // DAB RIGS - Glass rigs for concentrates
  // Includes: cake rig, turbine rig, fab egg, klein, stemline rig, etc.
  else if (title.includes(' rig') || title.includes('dab rig') || title.includes('oil rig') ||
           title.includes('fab egg') || title.includes('klein') ||
           title.includes('cake rig') || title.includes('turbine rig')) {
    result.suggestedFamily = 'family:glass-rig';
    result.suggestedPillar = 'pillar:smokeshop-device';
    result.suggestedUse = 'use:dabbing';
  }

  // BUBBLERS - Handheld water pipes
  else if (title.includes('bubbler')) {
    result.suggestedFamily = 'family:bubbler';
    result.suggestedPillar = 'pillar:smokeshop-device';
    result.suggestedUse = 'use:flower-smoking';
  }

  // BONGS / WATER PIPES (including "straight" which are straight tube bongs)
  // Note: "ratchet" by itself is a bong, but "ratchet carb cap" should be detected as carb cap first
  else if (hasBongIndicator || title.includes('water pipe') || title.includes('bong') ||
           title.includes('beaker') || title.includes('straight tube') ||
           (title.includes('straight') && !title.includes('adapter')) ||
           title.includes('zong') || title.includes('inline') ||
           (title.includes('ratchet') && !title.includes('cap')) ||
           title.includes('wine bottle') ||
           title.includes('multi-perc') || title.includes('multi perc') ||
           title.includes('dewar')) {
    result.suggestedFamily = 'family:glass-bong';
    result.suggestedPillar = 'pillar:smokeshop-device';
    result.suggestedUse = 'use:flower-smoking';
  }

  // HAND PIPES / SPOONS
  else if (title.includes('hand pipe') || title.includes('spoon pipe') ||
           title.includes('spoon') || title.includes('sherlock') ||
           (title.includes('pipe') && !title.includes('water') && !title.includes('nectar'))) {
    result.suggestedFamily = 'family:spoon-pipe';
    result.suggestedPillar = 'pillar:smokeshop-device';
    result.suggestedUse = 'use:flower-smoking';
  }

  // ONE HITTERS / CHILLUMS
  else if (title.includes('one hitter') || title.includes('onehitter') ||
           title.includes('chillum') || title.includes('taster') ||
           (title.includes('bat') && !title.includes('battery'))) {
    result.suggestedFamily = 'family:chillum-onehitter';
    result.suggestedPillar = 'pillar:smokeshop-device';
    result.suggestedUse = 'use:flower-smoking';
  }

  // STEAMROLLERS
  else if (title.includes('steamroller') || title.includes('steam roller')) {
    result.suggestedFamily = 'family:steamroller';
    result.suggestedPillar = 'pillar:smokeshop-device';
    result.suggestedUse = 'use:flower-smoking';
  }

  // HAMMER PIPES
  else if (title.includes('hammer') && !title.includes('rig')) {
    result.suggestedFamily = 'family:spoon-pipe';
    result.suggestedPillar = 'pillar:smokeshop-device';
    result.suggestedUse = 'use:flower-smoking';
  }

  // SIDECAR PIPES
  else if (title.includes('sidecar')) {
    result.suggestedFamily = 'family:spoon-pipe';
    result.suggestedPillar = 'pillar:smokeshop-device';
    result.suggestedUse = 'use:flower-smoking';
  }

  // DUGOUTS (one-hitter storage systems)
  else if (title.includes('dugout')) {
    result.suggestedFamily = 'family:dugout';
    result.suggestedPillar = 'pillar:smokeshop-device';
    result.suggestedUse = 'use:flower-smoking';
  }

  // ========================================================================
  // ACCESSORIES
  // ========================================================================

  // BANGER SETS / SLURPER SETS / GAVEL SETS
  else if (title.includes('box set') || title.includes('gavel set') ||
           title.includes('slurper set') || title.includes('blender set') ||
           title.includes('charmer set')) {
    result.suggestedFamily = 'family:banger-set';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:dabbing';
  }

  // TERP SLURPERS (specific type of banger)
  else if (title.includes('terp slurp') || title.includes('slurper')) {
    result.suggestedFamily = 'family:banger';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:dabbing';
  }

  // RECLAIM CATCHERS
  else if (title.includes('reclaim catcher') || title.includes('reclaim')) {
    result.suggestedFamily = 'family:reclaim-catcher';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:dabbing';
  }

  // NECTAR KITS
  else if (title.includes('nectar kit')) {
    result.suggestedFamily = 'family:nectar-collector';
    result.suggestedPillar = 'pillar:smokeshop-device';
    result.suggestedUse = 'use:dabbing';
  }

  // JOINT HOLDERS
  else if (title.includes('joint holder') || title.includes('donut holder')) {
    result.suggestedFamily = 'family:joint-holder';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:flower-smoking';
  }

  // QUARTZ BANGERS
  else if (title.includes('banger') || title.includes('quartz nail') ||
           (title.includes('bucket') && hasDabbingContext) ||
           title.includes('gavel')) {
    result.suggestedFamily = 'family:banger';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:dabbing';
  }

  // CARB CAPS
  else if (title.includes('carb cap') || title.includes('carbcap') ||
           title.includes('spinner cap') || title.includes('directional cap') ||
           title.includes('bubble cap')) {
    result.suggestedFamily = 'family:carb-cap';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:dabbing';
  }

  // TERP PEARLS / PILLS
  else if (title.includes('terp pearl') || title.includes('terp pill') ||
           title.includes('terp ball') || title.includes('dab pearl')) {
    result.suggestedFamily = 'family:terp-pearl';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:dabbing';
  }

  // DAB TOOLS / DABBERS
  else if (title.includes('dab tool') || title.includes('dabber') ||
           title.includes('dab stick') || title.includes('wax tool') ||
           title.includes('carving tool') || title.includes('butter knife')) {
    result.suggestedFamily = 'family:dab-tool';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:dabbing';
  }

  // TASSEL / DECORATIVE ACCESSORIES
  else if (title.includes('tassel')) {
    result.suggestedFamily = 'family:decorative-accessory';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = null;
  }

  // FLOWER BOWLS / SLIDES
  else if ((title.includes('bowl') || title.includes('slide')) &&
           !title.includes('carb') && !title.includes('grinder')) {
    result.suggestedFamily = 'family:flower-bowl';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:flower-smoking';
  }

  // ASH CATCHERS
  else if (title.includes('ash catcher') || title.includes('ashcatcher') ||
           title.includes('pre-cooler') || title.includes('precooler')) {
    result.suggestedFamily = 'family:ash-catcher';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:flower-smoking';
  }

  // DOWNSTEMS
  else if (title.includes('downstem') || title.includes('down stem')) {
    result.suggestedFamily = 'family:downstem';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:flower-smoking';
  }

  // ADAPTERS / DROP DOWNS
  else if (title.includes('adapter') || title.includes('drop down') ||
           title.includes('dropdown') || title.includes('converter')) {
    result.suggestedFamily = 'family:adapter';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = hasDabbingContext ? 'use:dabbing' : 'use:flower-smoking';
  }

  // TORCHES
  else if (title.includes('torch') || title.includes('butane') ||
           (title.includes('lighter') && !title.includes('hemp'))) {
    result.suggestedFamily = 'family:torch';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:dabbing';
  }

  // GRINDERS
  else if (title.includes('grinder')) {
    result.suggestedFamily = 'family:grinder';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:preparation';
  }

  // SCALES
  else if (title.includes('scale') && !title.includes('fish')) {
    result.suggestedFamily = 'family:scale';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:preparation';
  }

  // ROLLING PAPERS / CONES
  else if (title.includes('rolling paper') || title.includes('papers') ||
           title.includes('cone') || title.includes('pre-roll') ||
           title.includes('preroll') || title.includes('wrap') ||
           title.includes('blunt') || title.includes('the cali') ||
           title.includes('booklet') || title.includes('fatty')) {
    result.suggestedFamily = 'family:rolling-paper';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:rolling';
  }

  // ROLLING TRAYS
  else if (title.includes('rolling tray') || title.includes('tray')) {
    result.suggestedFamily = 'family:rolling-tray';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:rolling';
  }

  // VAPE BATTERIES
  else if (title.includes('battery') || title.includes('510') ||
           title.includes('vape pen') || title.includes('cart battery')) {
    result.suggestedFamily = 'family:vape-battery';
    result.suggestedPillar = 'pillar:smokeshop-device';
    result.suggestedUse = 'use:vaping';
  }

  // VAPE CARTRIDGES
  else if (title.includes('cartridge') || title.includes('cart') ||
           title.includes('pod')) {
    result.suggestedFamily = 'family:vape-cartridge';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:vaping';
  }

  // VAPE COILS / ATOMIZERS
  else if (title.includes('coil') || title.includes('atomizer')) {
    result.suggestedFamily = 'family:vape-coil';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:vaping';
  }

  // REPLACEMENT GLASS PARTS
  else if (title.includes('replacement glass') || title.includes('replacement part')) {
    result.suggestedFamily = 'family:replacement-part';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = null;
  }

  // ROLLING TIPS / FILTER TIPS
  else if (title.includes(' tip') && (title.includes('wide') || title.includes('filter') ||
           title.includes('rolling') || title.includes('booklet'))) {
    result.suggestedFamily = 'family:rolling-tips';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:rolling';
  }

  // DISPLAY BOXES (wholesale packaging)
  else if (title.includes('display box') || title.includes('display case')) {
    result.suggestedFamily = 'family:display-box';
    result.suggestedPillar = 'pillar:packaging';
    result.suggestedUse = null;
  }

  // STORAGE / JARS / CONTAINERS
  else if (title.includes('jar') || title.includes('container') ||
           title.includes('stash') || title.includes('storage') ||
           title.includes('case')) {
    result.suggestedFamily = 'family:container';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:storage';
  }

  // ASHTRAYS
  else if (title.includes('ashtray') || title.includes('ash tray')) {
    result.suggestedFamily = 'family:ashtray';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:storage';
  }

  // CLEANING SUPPLIES
  else if (title.includes('cleaner') || title.includes('cleaning') ||
           title.includes('isopropyl') || title.includes('alcohol') ||
           title.includes('brush') || title.includes('pipe cleaner')) {
    result.suggestedFamily = 'family:cleaning-supply';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = null;
  }

  // PENDANTS / JEWELRY
  else if (title.includes('pendant') || title.includes('necklace') ||
           title.includes('jewelry') || title.includes('chain')) {
    result.suggestedFamily = 'family:merch-pendant';
    result.suggestedPillar = 'pillar:merch';
    result.suggestedUse = null;
  }

  // ROACH CLIPS
  else if (title.includes('roach clip') || title.includes('roach holder')) {
    result.suggestedFamily = 'family:roach-clip';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:flower-smoking';
  }

  // HEMP WICKS / LIGHTERS
  else if (title.includes('hemp wick') || title.includes('wick')) {
    result.suggestedFamily = 'family:hemp-wick';
    result.suggestedPillar = 'pillar:accessory';
    result.suggestedUse = 'use:flower-smoking';
  }

  // ========================================================================
  // MATERIAL DETECTION (Only from title to be accurate)
  // ========================================================================

  // Only detect materials explicitly mentioned in the TITLE
  if (title.includes('silicone')) {
    result.suggestedMaterial.push('material:silicone');
  }
  if (title.includes('glass') || title.includes('borosilicate')) {
    result.suggestedMaterial.push('material:glass');
  }
  if (title.includes('quartz')) {
    result.suggestedMaterial.push('material:quartz');
  }
  if (title.includes('titanium')) {
    result.suggestedMaterial.push('material:titanium');
  }
  if (title.includes('ceramic')) {
    result.suggestedMaterial.push('material:ceramic');
  }
  if (title.includes('metal') || title.includes('steel') ||
      title.includes('aluminum') || title.includes('stainless')) {
    result.suggestedMaterial.push('material:metal');
  }
  if (title.includes('wood') || title.includes('wooden')) {
    result.suggestedMaterial.push('material:wood');
  }
  if (title.includes('acrylic')) {
    result.suggestedMaterial.push('material:acrylic');
  }

  // DON'T default to glass - only add material tags when explicitly mentioned

  // ========================================================================
  // CHECK WHAT'S MISSING
  // ========================================================================

  if (result.suggestedFamily && !existingTags.includes(result.suggestedFamily)) {
    result.missingTags.push(result.suggestedFamily);
  }
  if (result.suggestedPillar && !existingTags.includes(result.suggestedPillar)) {
    result.missingTags.push(result.suggestedPillar);
  }
  if (result.suggestedUse && !existingTags.includes(result.suggestedUse)) {
    result.missingTags.push(result.suggestedUse);
  }
  for (const mat of result.suggestedMaterial) {
    if (!existingTags.includes(mat)) {
      result.missingTags.push(mat);
    }
  }

  // ========================================================================
  // CHECK FOR INCORRECT TAGS (e.g., bong tagged as rig)
  // ========================================================================

  if (result.suggestedFamily === 'family:glass-rig' && existingTags.includes('family:glass-bong')) {
    result.incorrectTags.push({ current: 'family:glass-bong', correct: 'family:glass-rig' });
  }
  if (result.suggestedFamily === 'family:glass-bong' && existingTags.includes('family:glass-rig')) {
    result.incorrectTags.push({ current: 'family:glass-rig', correct: 'family:glass-bong' });
  }

  return result;
}

/**
 * Build complete tag string for a product
 */
function buildTags(product, analysis) {
  const existingTags = product.tags ? product.tags.split(', ').map(t => t.trim()) : [];
  const newTags = new Set(existingTags);

  // Remove incorrect tags
  for (const fix of analysis.incorrectTags) {
    newTags.delete(fix.current);
  }

  // Add missing tags
  for (const tag of analysis.missingTags) {
    newTags.add(tag);
  }

  // Add correct family tag if we're replacing
  if (analysis.suggestedFamily) {
    newTags.add(analysis.suggestedFamily);
  }
  if (analysis.suggestedPillar) {
    newTags.add(analysis.suggestedPillar);
  }
  if (analysis.suggestedUse) {
    newTags.add(analysis.suggestedUse);
  }

  return Array.from(newTags).join(', ');
}

/**
 * Update a product's tags using the Shopify API wrapper
 */
async function updateProductTags(productId, newTags) {
  return await api.updateProduct(productId, { tags: newTags });
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  const verbose = args.includes('--verbose');
  const limit = args.find(a => a.startsWith('--limit='));
  const maxProducts = limit ? parseInt(limit.split('=')[1]) : null;

  console.log('\n' + '═'.repeat(70));
  console.log('  COMPREHENSIVE PRODUCT TAGGER');
  console.log('═'.repeat(70));
  console.log(dryRun ? '  Mode: DRY RUN (use --execute to apply changes)' : '  Mode: EXECUTING CHANGES');
  console.log('');

  // Fetch all products
  console.log('Fetching all products...');
  const products = await api.getAllProductsByVendor('What You Need');
  console.log(`Found ${products.length} products\n`);

  const toProcess = maxProducts ? products.slice(0, maxProducts) : products;

  // Analyze all products
  const needsUpdate = [];
  const alreadyCorrect = [];
  const unidentified = [];

  console.log('Analyzing products...\n');

  for (let i = 0; i < toProcess.length; i++) {
    const product = toProcess[i];
    const analysis = analyzeProduct(product);

    if (analysis.missingTags.length > 0 || analysis.incorrectTags.length > 0) {
      needsUpdate.push({ product, analysis });

      if (verbose || needsUpdate.length <= 20) {
        console.log(`[${i + 1}/${toProcess.length}] NEEDS UPDATE: ${product.title.substring(0, 50)}`);
        if (analysis.missingTags.length > 0) {
          console.log(`    Missing: ${analysis.missingTags.join(', ')}`);
        }
        if (analysis.incorrectTags.length > 0) {
          console.log(`    Incorrect: ${analysis.incorrectTags.map(t => `${t.current} → ${t.correct}`).join(', ')}`);
        }
      }
    } else if (analysis.suggestedFamily) {
      alreadyCorrect.push({ product, analysis });
    } else {
      unidentified.push({ product, analysis });
      if (verbose) {
        console.log(`[${i + 1}/${toProcess.length}] UNIDENTIFIED: ${product.title.substring(0, 50)}`);
      }
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(70));
  console.log('ANALYSIS SUMMARY');
  console.log('─'.repeat(70));
  console.log(`Total products analyzed: ${toProcess.length}`);
  console.log(`Already correct:         ${alreadyCorrect.length}`);
  console.log(`Need updates:            ${needsUpdate.length}`);
  console.log(`Unidentified:            ${unidentified.length}`);

  if (needsUpdate.length === 0) {
    console.log('\nAll products are correctly tagged!');
    return;
  }

  // Apply updates
  if (!dryRun) {
    console.log('\n' + '─'.repeat(70));
    console.log('APPLYING UPDATES');
    console.log('─'.repeat(70));

    let updated = 0;
    let failed = 0;

    for (let i = 0; i < needsUpdate.length; i++) {
      const { product, analysis } = needsUpdate[i];
      const newTags = buildTags(product, analysis);

      try {
        await updateProductTags(product.id, newTags);
        updated++;
        console.log(`[${i + 1}/${needsUpdate.length}] ✓ Updated: ${product.title.substring(0, 45)}`);

        // Rate limiting
        if (i % 5 === 0) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (error) {
        failed++;
        console.log(`[${i + 1}/${needsUpdate.length}] ✗ Failed: ${product.title.substring(0, 45)} - ${error.message}`);
      }
    }

    console.log('\n' + '─'.repeat(70));
    console.log('RESULTS');
    console.log('─'.repeat(70));
    console.log(`Successfully updated: ${updated}`);
    console.log(`Failed:               ${failed}`);
  } else {
    console.log('\n' + '─'.repeat(70));
    console.log('DRY RUN - No changes made');
    console.log('Run with --execute to apply these changes');
    console.log('─'.repeat(70));

    // Show sample of what would be updated
    console.log('\nSample of products that would be updated:\n');
    for (let i = 0; i < Math.min(10, needsUpdate.length); i++) {
      const { product, analysis } = needsUpdate[i];
      console.log(`${i + 1}. ${product.title.substring(0, 50)}`);
      console.log(`   Family: ${analysis.suggestedFamily || 'unknown'}`);
      console.log(`   Missing: ${analysis.missingTags.join(', ') || 'none'}`);
      if (analysis.incorrectTags.length > 0) {
        console.log(`   Fix: ${analysis.incorrectTags.map(t => `${t.current} → ${t.correct}`).join(', ')}`);
      }
      console.log('');
    }
  }

  // List unidentified products
  if (unidentified.length > 0) {
    console.log('\n' + '─'.repeat(70));
    console.log('UNIDENTIFIED PRODUCTS (need manual review)');
    console.log('─'.repeat(70));
    for (let i = 0; i < Math.min(20, unidentified.length); i++) {
      console.log(`  - ${unidentified[i].product.title}`);
    }
    if (unidentified.length > 20) {
      console.log(`  ... and ${unidentified.length - 20} more`);
    }
  }
}

main().catch(console.error);
