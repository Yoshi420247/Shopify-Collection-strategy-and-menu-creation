#!/usr/bin/env node
/**
 * Collection Cleanup Script
 *
 * This script identifies and fixes all collection issues:
 * 1. Broken silicone collections (missing material:silicone rule)
 * 2. Duplicate collections to delete
 * 3. Redundant collections to consolidate
 * 4. Product tag fixes
 *
 * Run with --dry-run (default) to preview changes
 * Run with --execute to apply changes
 */

import 'dotenv/config';
import { config } from './config.js';
import api from './shopify-api.js';

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
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

// ============================================================================
// COLLECTION ISSUES TO FIX
// ============================================================================

// Collections that are broken and need rule fixes
const BROKEN_COLLECTIONS = {
  'silicone-pipes': {
    issue: 'Missing material:silicone rule - matches ALL 751 products',
    fix: {
      rules: [
        { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        { column: 'tag', relation: 'equals', condition: 'material:silicone' },
        { column: 'tag', relation: 'equals', condition: 'family:spoon-pipe' },
      ],
      disjunctive: false,
    },
  },
  'silicone-water-pipes': {
    issue: 'Missing material:silicone rule - matches ALL 751 products',
    fix: {
      rules: [
        { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        { column: 'tag', relation: 'equals', condition: 'material:silicone' },
        { column: 'tag', relation: 'equals', condition: 'family:glass-bong' },
      ],
      disjunctive: false,
    },
  },
  'silicone-smoking-devices': {
    issue: 'Missing material:silicone rule - matches ALL 751 products',
    fix: {
      rules: [
        { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        { column: 'tag', relation: 'equals', condition: 'material:silicone' },
      ],
      disjunctive: false,
    },
  },
  'silicone-rigs-bongs': {
    issue: 'May need rule update for silicone material',
    fix: {
      rules: [
        { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        { column: 'tag', relation: 'equals', condition: 'material:silicone' },
      ],
      disjunctive: false,
    },
  },
};

// Duplicate collections to DELETE (keep the primary one)
const DUPLICATE_COLLECTIONS_TO_DELETE = [
  // Underscore versions (legacy format)
  'dab_rig',           // Keep: dab-rigs
  'hand_pipe',         // Keep: hand-pipes
  'quartz_banger',     // Keep: quartz-bangers
  'torch_tool',        // Keep: torches
  'water_pipe',        // Keep: bongs-water-pipes
  'grinder',           // Keep: grinders

  // Redundant "-collection" suffix versions
  'hand-pipes-collection',    // Keep: hand-pipes
  'flower-bowls-collection',  // Keep: flower-bowls
  'grinders-collection',      // Keep: grinders
  'torches-collection',       // Keep: torches
  'heady-glass-collection',   // Keep: heady-glass
  'pendants-collection',      // Keep: pendants-merch
  'one-hitter-and-chillums-collection', // Keep: one-hitters-chillums
  'nectar-collectors-collection', // Keep: nectar-collectors
  'carb-caps-collection',     // Keep: carb-caps
  'dabbers-collection',       // Keep: dab-tools
  'essentials-accessories-collection', // Keep: accessories

  // Redundant numbered versions
  'clearance-1',              // Keep: clearance
  'clearance-2',              // Keep: clearance
  'nectar-collectors-1',      // Keep: nectar-collectors
  'mylar-bags-1',             // Keep: mylar-bags

  // Overly specific duplicates
  'dab-rigs-and-oil-rigs',    // Keep: dab-rigs
  'glass-bongs-and-water-pipes', // Keep: bongs-water-pipes

  // Duplicate Smoke & Vape landing pages (keep smoke-and-vape)
  'smoke-vape',               // Keep: smoke-and-vape
  'smoke-shop-products',      // Keep: smoke-and-vape
  'all-headshop',             // Keep: smoke-and-vape
  'shop-all-what-you-need',   // Keep: smoke-and-vape
  'smoking',                  // Keep: smoke-and-vape
  'smoking-devices',          // Keep: smoke-and-vape (or create category)

  // Duplicate accessory collections
  'rolling-accessories',      // Keep: rolling-papers (or merge)
  'ash-catchers-downstems',   // Keep: ash-catchers (we'll create downstems separately)

  // Old/miscellaneous
  'spooky-haloween-sale',     // Seasonal - can delete if past
  'custom',                   // Not needed
  'other',                    // Not needed
  'large-pipes-and-rigs',     // Too vague
  'medium-pipes-and-rigs',    // Too vague
  'small-pipes-rigs',         // Too vague

  // Duplicate silicone collections (after fixing)
  'silicone-beaker-bongs',    // Keep: silicone-rigs-bongs
  'silicone-glass-hybrid-rigs-and-bubblers', // Keep: silicone-rigs-bongs
  'cute-silicone-rigs',       // Keep: silicone-rigs-bongs
  'top-selling-silicone-rigs', // Keep: silicone-rigs-bongs
  'silicone-ashtrays',        // Keep: ashtrays (add silicone filter)

  // Duplicate extraction/packaging
  'extract-packaging-jars-and-nonstick', // Keep: extraction-packaging
  'extraction-materials-packaging', // Keep: extraction-packaging
  'extraction-supplies',      // Keep: extraction-packaging
  'nonstick-materials-for-extraction', // Keep specific collections
  'non-stick-paper-and-ptfe', // Keep: ptfe-sheets
  'glass-jars-extract-packaging', // Keep: glass-jars
  'non-stick-containers',     // Keep: concentrate-containers
  'packaging-storage',        // Keep: storage-containers
  'storage-packaging',        // Keep: storage-containers
  'storage',                  // Keep: storage-containers
  'parchment-papers',         // Keep: parchment-paper (singular)

  // Vaporizer
  'vaporizer-parts-and-accessories', // Keep: vapes-electronics

  // Wholesale/display (may need review)
  'wholesale-pipes',          // Review - might be needed
  'grinders-in-retail-bulk-display', // Keep if bulk business
];

// Collections to KEEP but may need cleanup
const COLLECTIONS_TO_REVIEW = [
  'dabbing',                  // May overlap with dab-rigs
  'papers',                   // May overlap with rolling-papers
  'bulk-ptfe-fep',           // Keep if bulk business
  'custom-packaging-options', // Keep if custom orders
  'eo-vape',                  // Brand collection - keep
  'peaselburg',               // Brand collection - keep
  'only-quartz',              // Brand collection - keep
];

// ============================================================================
// COMPREHENSIVE PRODUCT TAG FIXES
// ============================================================================

// Products that need tag corrections - expanded to cover ALL product types
// that may have been imported with incomplete or incorrect tags
const PRODUCT_TAG_FIXES = [
  // ========================================================================
  // SILICONE PRODUCTS - Critical for silicone collections
  // ========================================================================
  {
    titleContains: 'silicone nectar',
    currentFamily: 'flower-bowl',
    correctFamily: 'nectar-collector',
    ensureTags: ['material:silicone', 'use:dabbing', 'pillar:smokeshop-device', 'family:nectar-collector'],
  },
  {
    titleContains: 'silicone bubbler',
    ensureTags: ['material:silicone', 'family:bubbler', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'silicone hammer',
    ensureTags: ['material:silicone'],
  },
  {
    titleContains: 'silicone rig',
    ensureTags: ['material:silicone', 'family:silicone-rig', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'silicone pipe',
    ensureTags: ['material:silicone', 'family:spoon-pipe', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'silicone bong',
    ensureTags: ['material:silicone', 'family:glass-bong', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'silicone water pipe',
    ensureTags: ['material:silicone', 'family:glass-bong', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'silicone beaker',
    ensureTags: ['material:silicone', 'family:glass-bong', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },

  // ========================================================================
  // WATER PIPES / BONGS - For bongs-water-pipes collection
  // ========================================================================
  {
    titleContains: 'water pipe',
    ensureTags: ['family:glass-bong', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'bong',
    ensureTags: ['family:glass-bong', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'beaker',
    ensureTags: ['family:glass-bong', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'straight tube',
    ensureTags: ['family:glass-bong', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },

  // ========================================================================
  // DAB RIGS - For dab-rigs collection
  // ========================================================================
  {
    titleContains: 'dab rig',
    ensureTags: ['family:glass-rig', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'oil rig',
    ensureTags: ['family:glass-rig', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'concentrate rig',
    ensureTags: ['family:glass-rig', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'recycler',
    ensureTags: ['family:glass-rig', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'incycler',
    ensureTags: ['family:glass-rig', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'mini rig',
    ensureTags: ['family:glass-rig', 'use:dabbing', 'pillar:smokeshop-device', 'style:travel-friendly'],
  },

  // ========================================================================
  // HAND PIPES - For hand-pipes collection
  // ========================================================================
  {
    titleContains: 'hand pipe',
    ensureTags: ['family:spoon-pipe', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'spoon pipe',
    ensureTags: ['family:spoon-pipe', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'sherlock',
    ensureTags: ['family:spoon-pipe', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },

  // ========================================================================
  // BUBBLERS - For bubblers collection
  // ========================================================================
  {
    titleContains: 'bubbler',
    ensureTags: ['family:bubbler', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },

  // ========================================================================
  // NECTAR COLLECTORS - For nectar-collectors collection
  // ========================================================================
  {
    titleContains: 'nectar collector',
    ensureTags: ['family:nectar-collector', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'nectar straw',
    ensureTags: ['family:nectar-collector', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'dab straw',
    ensureTags: ['family:nectar-collector', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'honey straw',
    ensureTags: ['family:nectar-collector', 'use:dabbing', 'pillar:smokeshop-device'],
  },

  // ========================================================================
  // ONE HITTERS / CHILLUMS - For one-hitters-chillums collection
  // ========================================================================
  {
    titleContains: 'one hitter',
    ensureTags: ['family:chillum-onehitter', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'chillum',
    ensureTags: ['family:chillum-onehitter', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'taster',
    ensureTags: ['family:chillum-onehitter', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },

  // ========================================================================
  // QUARTZ BANGERS - For quartz-bangers collection
  // ========================================================================
  {
    titleContains: 'banger',
    ensureTags: ['family:banger', 'use:dabbing', 'pillar:accessory', 'material:quartz'],
  },
  {
    titleContains: 'quartz nail',
    ensureTags: ['family:banger', 'use:dabbing', 'pillar:accessory', 'material:quartz'],
  },
  {
    titleContains: 'bucket',
    ensureTags: ['family:banger', 'use:dabbing', 'pillar:accessory'],
  },

  // ========================================================================
  // CARB CAPS - For carb-caps collection
  // ========================================================================
  {
    titleContains: 'carb cap',
    ensureTags: ['family:carb-cap', 'use:dabbing', 'pillar:accessory'],
  },
  {
    titleContains: 'spinner cap',
    ensureTags: ['family:carb-cap', 'use:dabbing', 'pillar:accessory'],
  },
  {
    titleContains: 'directional cap',
    ensureTags: ['family:carb-cap', 'use:dabbing', 'pillar:accessory'],
  },

  // ========================================================================
  // DAB TOOLS - For dab-tools collection
  // ========================================================================
  {
    titleContains: 'dab tool',
    ensureTags: ['family:dab-tool', 'use:dabbing', 'pillar:accessory'],
  },
  {
    titleContains: 'dabber',
    ensureTags: ['family:dab-tool', 'use:dabbing', 'pillar:accessory'],
  },
  {
    titleContains: 'wax tool',
    ensureTags: ['family:dab-tool', 'use:dabbing', 'pillar:accessory'],
  },

  // ========================================================================
  // FLOWER BOWLS - For flower-bowls collection
  // ========================================================================
  {
    titleContains: 'bowl',
    ensureTags: ['family:flower-bowl', 'use:flower-smoking', 'pillar:accessory'],
  },
  {
    titleContains: 'slide',
    ensureTags: ['family:flower-bowl', 'use:flower-smoking', 'pillar:accessory'],
  },

  // ========================================================================
  // ASH CATCHERS - For ash-catchers collection
  // ========================================================================
  {
    titleContains: 'ash catcher',
    ensureTags: ['family:ash-catcher', 'use:flower-smoking', 'pillar:accessory'],
  },
  {
    titleContains: 'precooler',
    ensureTags: ['family:ash-catcher', 'use:flower-smoking', 'pillar:accessory'],
  },

  // ========================================================================
  // TORCHES - For torches collection
  // ========================================================================
  {
    titleContains: 'torch',
    ensureTags: ['family:torch', 'use:dabbing', 'pillar:accessory'],
  },
  {
    titleContains: 'butane',
    ensureTags: ['family:torch', 'use:dabbing', 'pillar:accessory'],
  },

  // ========================================================================
  // GRINDERS - For grinders collection
  // ========================================================================
  {
    titleContains: 'grinder',
    ensureTags: ['family:grinder', 'use:preparation', 'pillar:accessory'],
  },

  // ========================================================================
  // ROLLING PAPERS - For rolling-papers collection
  // ========================================================================
  {
    titleContains: 'rolling paper',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: 'papers',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: 'cone',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: 'pre-roll',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: 'preroll',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: 'wrap',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: 'blunt',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },

  // ========================================================================
  // VAPES & ELECTRONICS - For vapes-electronics collection
  // ========================================================================
  {
    titleContains: 'battery',
    ensureTags: ['family:vape-battery', 'use:vaping', 'pillar:smokeshop-device'],
  },
  {
    titleContains: '510',
    ensureTags: ['family:vape-battery', 'use:vaping', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'vape pen',
    ensureTags: ['family:vape-battery', 'use:vaping', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'cartridge',
    ensureTags: ['family:vape-cartridge', 'use:vaping', 'pillar:accessory'],
  },

  // ========================================================================
  // STORAGE - For storage-containers collection
  // ========================================================================
  {
    titleContains: 'jar',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'container',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'stash',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },

  // ========================================================================
  // TRAYS - For trays-work-surfaces collection
  // ========================================================================
  {
    titleContains: 'rolling tray',
    ensureTags: ['family:rolling-tray', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: 'tray',
    ensureTags: ['family:rolling-tray', 'use:rolling', 'pillar:accessory'],
  },

  // ========================================================================
  // PENDANTS / MERCH - For pendants-merch collection
  // ========================================================================
  {
    titleContains: 'pendant',
    ensureTags: ['family:merch-pendant', 'pillar:merch'],
  },
  {
    titleContains: 'necklace',
    ensureTags: ['family:merch-pendant', 'pillar:merch'],
  },

  // ========================================================================
  // DOWNSTEMS / ADAPTERS
  // ========================================================================
  {
    titleContains: 'downstem',
    ensureTags: ['family:downstem', 'use:flower-smoking', 'pillar:accessory'],
  },
  {
    titleContains: 'adapter',
    ensureTags: ['family:downstem', 'use:flower-smoking', 'pillar:accessory'],
  },
  {
    titleContains: 'drop down',
    ensureTags: ['family:downstem', 'pillar:accessory'],
  },

  // ========================================================================
  // BRAND DETECTION - Ensure brand products are tagged
  // ========================================================================
  {
    titleContains: 'zig-zag',
    ensureTags: ['brand:zig-zag', 'style:brand-highlight'],
  },
  {
    titleContains: 'zig zag',
    ensureTags: ['brand:zig-zag', 'style:brand-highlight'],
  },
  {
    titleContains: 'raw ',  // space to avoid "straw"
    ensureTags: ['brand:raw', 'style:brand-highlight'],
  },
  {
    titleContains: 'cookies',
    ensureTags: ['brand:cookies', 'style:brand-highlight'],
  },
  {
    titleContains: 'maven',
    ensureTags: ['brand:maven', 'style:brand-highlight'],
  },
  {
    titleContains: 'vibes',
    ensureTags: ['brand:vibes', 'style:brand-highlight'],
  },
  {
    titleContains: 'monark',
    ensureTags: ['brand:monark', 'style:brand-highlight'],
  },
  {
    titleContains: 'elements',
    ensureTags: ['brand:elements', 'style:brand-highlight'],
  },
  {
    titleContains: 'puffco',
    ensureTags: ['brand:puffco', 'style:brand-highlight'],
  },
  {
    titleContains: 'lookah',
    ensureTags: ['brand:lookah', 'style:brand-highlight'],
  },
  {
    titleContains: 'g-pen',
    ensureTags: ['brand:g-pen', 'style:brand-highlight'],
  },
  {
    titleContains: 'g pen',
    ensureTags: ['brand:g-pen', 'style:brand-highlight'],
  },
  {
    titleContains: 'scorch',
    ensureTags: ['brand:scorch', 'style:brand-highlight'],
  },

  // ========================================================================
  // MATERIAL DETECTION - Ensure material tags
  // ========================================================================
  {
    titleContains: 'glass',
    ensureTags: ['material:glass'],
  },
  {
    titleContains: 'quartz',
    ensureTags: ['material:quartz'],
  },
  {
    titleContains: 'titanium',
    ensureTags: ['material:titanium'],
  },
  {
    titleContains: 'ceramic',
    ensureTags: ['material:ceramic'],
  },
  {
    titleContains: 'borosilicate',
    ensureTags: ['material:borosilicate', 'material:glass'],
  },

  // ========================================================================
  // JOINT SIZE DETECTION
  // ========================================================================
  {
    titleContains: '10mm',
    ensureTags: ['joint_size:10mm'],
  },
  {
    titleContains: '14mm',
    ensureTags: ['joint_size:14mm'],
  },
  {
    titleContains: '18mm',
    ensureTags: ['joint_size:18mm'],
  },

  // ========================================================================
  // STYLE DETECTION
  // ========================================================================
  {
    titleContains: 'made in usa',
    ensureTags: ['style:made-in-usa'],
  },
  {
    titleContains: 'american made',
    ensureTags: ['style:made-in-usa'],
  },
  {
    titleContains: 'heady',
    ensureTags: ['style:heady'],
  },
  {
    titleContains: 'wig wag',
    ensureTags: ['style:heady'],
  },
  {
    titleContains: 'wigwag',
    ensureTags: ['style:heady'],
  },
  {
    titleContains: 'fumed',
    ensureTags: ['style:heady'],
  },
  {
    titleContains: 'mini',
    ensureTags: ['style:travel-friendly'],
  },
  {
    titleContains: 'pocket',
    ensureTags: ['style:travel-friendly'],
  },
  {
    titleContains: 'travel',
    ensureTags: ['style:travel-friendly'],
  },
];

// ============================================================================
// MENU STRUCTURE - Cleaned up
// ============================================================================

const CLEAN_MENU_STRUCTURE = {
  mainMenu: {
    title: 'Main menu',
    items: [
      { title: 'Shop All', url: '/collections/all' },
      {
        title: 'Extraction & Packaging',
        url: '/collections/extraction-packaging',
        children: [
          { title: 'Silicone Pads & Mats', url: '/collections/silicone-pads' },
          { title: 'FEP Sheets & Rolls', url: '/collections/fep-sheets' },
          { title: 'PTFE Sheets & Rolls', url: '/collections/ptfe-sheets' },
          { title: 'Parchment Paper', url: '/collections/parchment-paper' },
          { title: 'Glass Jars', url: '/collections/glass-jars' },
          { title: 'Concentrate Containers', url: '/collections/concentrate-containers' },
          { title: 'Mylar Bags', url: '/collections/mylar-bags' },
          { title: 'Joint Tubes', url: '/collections/joint-tubes' },
          { title: 'Shop All Extraction', url: '/collections/extraction-packaging' },
        ],
      },
      {
        title: 'Smoke & Vape',
        url: '/collections/smoke-and-vape',
        children: [
          { title: 'Bongs & Water Pipes', url: '/collections/bongs-water-pipes' },
          { title: 'Dab Rigs', url: '/collections/dab-rigs' },
          { title: 'Hand Pipes', url: '/collections/hand-pipes' },
          { title: 'Bubblers', url: '/collections/bubblers' },
          { title: 'Nectar Collectors', url: '/collections/nectar-collectors' },
          { title: 'One Hitters & Chillums', url: '/collections/one-hitters-chillums' },
          { title: 'Silicone Pieces', url: '/collections/silicone-rigs-bongs' },
          { title: 'Shop All Smoke & Vape', url: '/collections/smoke-and-vape' },
        ],
      },
      {
        title: 'Accessories',
        url: '/collections/accessories',
        children: [
          { title: 'Quartz Bangers', url: '/collections/quartz-bangers' },
          { title: 'Carb Caps', url: '/collections/carb-caps' },
          { title: 'Dab Tools', url: '/collections/dab-tools' },
          { title: 'Flower Bowls', url: '/collections/flower-bowls' },
          { title: 'Ash Catchers', url: '/collections/ash-catchers' },
          { title: 'Torches', url: '/collections/torches' },
          { title: 'Grinders', url: '/collections/grinders' },
          { title: 'Rolling Papers & Cones', url: '/collections/rolling-papers' },
          { title: 'Vapes & Electronics', url: '/collections/vapes-electronics' },
          { title: 'Storage & Containers', url: '/collections/storage-containers' },
          { title: 'Trays & Work Surfaces', url: '/collections/trays-work-surfaces' },
        ],
      },
      {
        title: 'Brands',
        url: '#',
        children: [
          { title: 'RAW', url: '/collections/raw' },
          { title: 'Zig Zag', url: '/collections/zig-zag' },
          { title: 'Vibes', url: '/collections/vibes' },
          { title: 'Elements', url: '/collections/elements' },
          { title: 'Cookies', url: '/collections/cookies' },
          { title: 'Monark', url: '/collections/monark' },
          { title: 'Maven', url: '/collections/maven' },
          { title: 'Puffco', url: '/collections/puffco' },
          { title: 'Lookah', url: '/collections/lookah' },
          { title: 'G Pen', url: '/collections/g-pen' },
        ],
      },
      {
        title: 'Featured',
        url: '#',
        children: [
          { title: 'Heady Glass', url: '/collections/heady-glass' },
          { title: 'Made In USA', url: '/collections/made-in-usa' },
          { title: 'Travel Friendly', url: '/collections/travel-friendly' },
          { title: 'Clearance', url: '/collections/clearance' },
        ],
      },
    ],
  },
  sidebarMenu: {
    title: 'Sidebar Menu',
    items: [
      { title: 'Extraction & Packaging', url: '/collections/extraction-packaging' },
      {
        title: 'Smoke & Vape',
        url: '/collections/smoke-and-vape',
        children: [
          { title: 'Shop All Smoke & Vape', url: '/collections/smoke-and-vape' },
          { title: 'Bongs & Water Pipes', url: '/collections/bongs-water-pipes' },
          { title: 'Dab Rigs', url: '/collections/dab-rigs' },
          { title: 'Hand Pipes', url: '/collections/hand-pipes' },
          { title: 'Bubblers', url: '/collections/bubblers' },
          { title: 'Nectar Collectors', url: '/collections/nectar-collectors' },
          { title: 'One Hitters & Chillums', url: '/collections/one-hitters-chillums' },
        ],
      },
      {
        title: 'Accessories',
        url: '/collections/accessories',
        children: [
          { title: 'Quartz Bangers', url: '/collections/quartz-bangers' },
          { title: 'Carb Caps', url: '/collections/carb-caps' },
          { title: 'Dab Tools', url: '/collections/dab-tools' },
          { title: 'Flower Bowls', url: '/collections/flower-bowls' },
          { title: 'Ash Catchers', url: '/collections/ash-catchers' },
          { title: 'Torches', url: '/collections/torches' },
          { title: 'Grinders', url: '/collections/grinders' },
          { title: 'Rolling Papers', url: '/collections/rolling-papers' },
        ],
      },
      {
        title: 'Brands',
        url: '#',
        children: [
          { title: 'Monark', url: '/collections/monark' },
          { title: 'Zig Zag', url: '/collections/zig-zag' },
          { title: 'Cookies', url: '/collections/cookies' },
          { title: 'Maven', url: '/collections/maven' },
          { title: 'Vibes', url: '/collections/vibes' },
          { title: 'RAW', url: '/collections/raw' },
        ],
      },
      { title: 'Clearance', url: '/collections/clearance' },
    ],
  },
};

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

async function fetchAllCollections() {
  logSection('FETCHING ALL COLLECTIONS');

  const smartCollections = await api.getCollections('smart');
  const customCollections = await api.getCollections('custom');

  const allCollections = {};

  for (const col of smartCollections.smart_collections || []) {
    allCollections[col.handle] = { ...col, type: 'smart' };
  }

  for (const col of customCollections.custom_collections || []) {
    allCollections[col.handle] = { ...col, type: 'custom' };
  }

  log(`Found ${Object.keys(allCollections).length} total collections`, 'cyan');

  return allCollections;
}

async function analyzeCollections(collections) {
  logSection('ANALYZING COLLECTIONS FOR ISSUES');

  const issues = {
    broken: [],
    duplicates: [],
    toReview: [],
  };

  // Check for broken collections
  for (const [handle, fixInfo] of Object.entries(BROKEN_COLLECTIONS)) {
    if (collections[handle]) {
      issues.broken.push({
        handle,
        id: collections[handle].id,
        title: collections[handle].title,
        currentRules: collections[handle].rules,
        issue: fixInfo.issue,
        fix: fixInfo.fix,
      });
      log(`  BROKEN: ${handle} - ${fixInfo.issue}`, 'red');
    }
  }

  // Check for duplicates to delete
  for (const handle of DUPLICATE_COLLECTIONS_TO_DELETE) {
    if (collections[handle]) {
      issues.duplicates.push({
        handle,
        id: collections[handle].id,
        title: collections[handle].title,
        type: collections[handle].type,
      });
      log(`  DUPLICATE: ${handle} (${collections[handle].title})`, 'yellow');
    }
  }

  // Collections to review
  for (const handle of COLLECTIONS_TO_REVIEW) {
    if (collections[handle]) {
      issues.toReview.push({
        handle,
        id: collections[handle].id,
        title: collections[handle].title,
      });
      log(`  REVIEW: ${handle} (${collections[handle].title})`, 'blue');
    }
  }

  console.log('\n--- SUMMARY ---');
  log(`Broken collections to fix: ${issues.broken.length}`, 'red');
  log(`Duplicate collections to delete: ${issues.duplicates.length}`, 'yellow');
  log(`Collections to review: ${issues.toReview.length}`, 'blue');

  return issues;
}

async function fixBrokenCollections(issues, dryRun = true) {
  logSection('FIXING BROKEN COLLECTIONS');

  if (dryRun) {
    log('DRY RUN MODE - No changes will be made', 'yellow');
  }

  let fixed = 0;
  let errors = 0;

  for (const broken of issues.broken) {
    console.log(`\nFixing: ${broken.handle}`);
    console.log(`  Issue: ${broken.issue}`);
    console.log(`  Current rules: ${JSON.stringify(broken.currentRules, null, 2)}`);
    console.log(`  New rules: ${JSON.stringify(broken.fix.rules, null, 2)}`);

    if (!dryRun) {
      try {
        await api.updateSmartCollection(broken.id, {
          id: broken.id,
          rules: broken.fix.rules,
          disjunctive: broken.fix.disjunctive,
        });
        log(`  FIXED!`, 'green');
        fixed++;
      } catch (error) {
        log(`  ERROR: ${error.message}`, 'red');
        errors++;
      }
    } else {
      log(`  Would fix (dry run)`, 'yellow');
      fixed++;
    }
  }

  console.log(`\n--- RESULTS ---`);
  log(`Fixed: ${fixed}`, 'green');
  if (errors > 0) log(`Errors: ${errors}`, 'red');

  return { fixed, errors };
}

async function deleteDuplicateCollections(issues, dryRun = true) {
  logSection('DELETING DUPLICATE COLLECTIONS');

  if (dryRun) {
    log('DRY RUN MODE - No changes will be made', 'yellow');
  }

  let deleted = 0;
  let errors = 0;
  const skipped = [];

  for (const dup of issues.duplicates) {
    console.log(`\nDeleting: ${dup.handle} (${dup.title})`);

    if (dup.type === 'custom') {
      log(`  Skipping custom collection (manual review needed)`, 'yellow');
      skipped.push(dup);
      continue;
    }

    if (!dryRun) {
      try {
        await api.deleteSmartCollection(dup.id);
        log(`  DELETED!`, 'green');
        deleted++;
      } catch (error) {
        log(`  ERROR: ${error.message}`, 'red');
        errors++;
      }
    } else {
      log(`  Would delete (dry run)`, 'yellow');
      deleted++;
    }
  }

  console.log(`\n--- RESULTS ---`);
  log(`Deleted: ${deleted}`, 'green');
  if (skipped.length > 0) log(`Skipped (custom): ${skipped.length}`, 'yellow');
  if (errors > 0) log(`Errors: ${errors}`, 'red');

  return { deleted, errors, skipped };
}

async function fixProductTags(dryRun = true) {
  logSection('FIXING PRODUCT TAGS');

  if (dryRun) {
    log('DRY RUN MODE - No changes will be made', 'yellow');
  }

  // Fetch all products from vendor
  const products = await api.getAllProductsByVendor(config.vendor);
  log(`Fetched ${products.length} products`, 'cyan');

  let fixed = 0;
  let errors = 0;

  for (const product of products) {
    const title = product.title.toLowerCase();
    const currentTags = product.tags ? product.tags.split(',').map(t => t.trim()) : [];
    let needsUpdate = false;
    const newTags = new Set(currentTags);

    // Check each fix rule
    for (const fix of PRODUCT_TAG_FIXES) {
      if (title.includes(fix.titleContains.toLowerCase())) {
        // Check if we need to fix family tag
        if (fix.currentFamily && fix.correctFamily) {
          const wrongTag = `family:${fix.currentFamily}`;
          const rightTag = `family:${fix.correctFamily}`;
          if (newTags.has(wrongTag)) {
            newTags.delete(wrongTag);
            newTags.add(rightTag);
            needsUpdate = true;
            console.log(`\n  ${product.title}`);
            console.log(`    Fixing family: ${wrongTag} -> ${rightTag}`);
          }
        }

        // Ensure required tags are present
        if (fix.ensureTags) {
          for (const tag of fix.ensureTags) {
            if (!newTags.has(tag)) {
              newTags.add(tag);
              needsUpdate = true;
              console.log(`    Adding missing tag: ${tag}`);
            }
          }
        }
      }
    }

    // Also check for silicone products missing the material tag
    if (title.includes('silicone') && !newTags.has('material:silicone')) {
      newTags.add('material:silicone');
      needsUpdate = true;
      console.log(`\n  ${product.title}`);
      console.log(`    Adding missing tag: material:silicone`);
    }

    if (needsUpdate) {
      if (!dryRun) {
        try {
          await api.updateProduct(product.id, {
            id: product.id,
            tags: Array.from(newTags).join(', '),
          });
          fixed++;
        } catch (error) {
          log(`    ERROR: ${error.message}`, 'red');
          errors++;
        }
      } else {
        fixed++;
      }
    }
  }

  console.log(`\n--- RESULTS ---`);
  log(`Products fixed: ${fixed}`, 'green');
  if (errors > 0) log(`Errors: ${errors}`, 'red');

  return { fixed, errors };
}

async function generateMenuReport() {
  logSection('MENU STRUCTURE REPORT');

  console.log('\n--- RECOMMENDED MAIN MENU ---');
  printMenuStructure(CLEAN_MENU_STRUCTURE.mainMenu.items, 0);

  console.log('\n--- RECOMMENDED SIDEBAR MENU ---');
  printMenuStructure(CLEAN_MENU_STRUCTURE.sidebarMenu.items, 0);

  console.log('\n--- INSTRUCTIONS ---');
  console.log(`
To update menus in Shopify:
1. Go to Online Store > Navigation
2. Edit the Main menu and Sidebar Menu
3. Remove broken links and duplicates
4. Use the structure above as a guide
5. Ensure all collection handles exist before linking

For the automated menu API, you can use:
  node src/auto-menu-setup.js --execute
`);
}

function printMenuStructure(items, depth) {
  const indent = '  '.repeat(depth);
  for (const item of items) {
    console.log(`${indent}${item.title} -> ${item.url}`);
    if (item.children) {
      printMenuStructure(item.children, depth + 1);
    }
  }
}

async function generateCleanupReport(collections, issues) {
  logSection('COLLECTION CLEANUP REPORT');

  // List all collections by category
  console.log('\n--- COLLECTIONS TO KEEP (Primary) ---');
  const keepCollections = [
    // Main pages
    'all', 'smoke-and-vape', 'accessories', 'extraction-packaging',
    // Devices
    'bongs-water-pipes', 'dab-rigs', 'hand-pipes', 'bubblers',
    'nectar-collectors', 'one-hitters-chillums',
    // Accessories
    'quartz-bangers', 'carb-caps', 'dab-tools', 'flower-bowls',
    'ash-catchers', 'torches', 'grinders', 'rolling-papers',
    'vapes-electronics', 'storage-containers', 'trays-work-surfaces',
    // Extraction
    'silicone-pads', 'fep-sheets', 'ptfe-sheets', 'parchment-paper',
    'glass-jars', 'concentrate-containers', 'mylar-bags', 'joint-tubes',
    'rosin-extraction',
    // Brands
    'raw', 'zig-zag', 'vibes', 'elements', 'cookies', 'puffco',
    'lookah', 'maven', 'g-pen', 'monark', '710-sci', 'scorch',
    // Featured
    'heady-glass', 'made-in-usa', 'travel-friendly', 'clearance',
    'silicone-rigs-bongs', 'pendants-merch',
    // Bongs alternate
    'bongs',
  ];

  for (const handle of keepCollections) {
    if (collections[handle]) {
      console.log(`  [KEEP] ${handle} - ${collections[handle].title}`);
    } else {
      log(`  [MISSING] ${handle} - needs to be created`, 'yellow');
    }
  }

  console.log('\n--- COLLECTIONS TO DELETE ---');
  for (const dup of issues.duplicates) {
    console.log(`  [DELETE] ${dup.handle} - ${dup.title}`);
  }

  console.log('\n--- COLLECTIONS TO FIX ---');
  for (const broken of issues.broken) {
    console.log(`  [FIX] ${broken.handle} - ${broken.issue}`);
  }

  // Collections not in either list
  console.log('\n--- OTHER COLLECTIONS (review manually) ---');
  const allKnown = new Set([
    ...keepCollections,
    ...DUPLICATE_COLLECTIONS_TO_DELETE,
    ...Object.keys(BROKEN_COLLECTIONS),
    ...COLLECTIONS_TO_REVIEW,
  ]);

  for (const [handle, col] of Object.entries(collections)) {
    if (!allKnown.has(handle)) {
      console.log(`  [UNKNOWN] ${handle} - ${col.title}`);
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  const reportOnly = args.includes('--report');
  const fixCollections = args.includes('--fix-collections') || !reportOnly;
  const fixTags = args.includes('--fix-tags');
  const deleteCollections = args.includes('--delete-collections');

  console.log('\n' + '═'.repeat(70));
  log('  COLLECTION CLEANUP SCRIPT', 'bright');
  log(`  Store: ${config.shopify.storeUrl}`, 'cyan');
  log(`  Mode: ${dryRun ? 'DRY RUN (use --execute to make changes)' : 'EXECUTING CHANGES'}`, dryRun ? 'yellow' : 'green');
  console.log('═'.repeat(70));

  console.log('\nOptions:');
  console.log('  --execute           Apply changes (default: dry run)');
  console.log('  --report            Only generate report');
  console.log('  --fix-collections   Fix broken collection rules');
  console.log('  --fix-tags          Fix product tags');
  console.log('  --delete-collections Delete duplicate collections');
  console.log('');

  try {
    // Step 1: Fetch all collections
    const collections = await fetchAllCollections();

    // Step 2: Analyze for issues
    const issues = await analyzeCollections(collections);

    // Step 3: Generate report
    await generateCleanupReport(collections, issues);

    if (reportOnly) {
      await generateMenuReport();
      log('\nReport complete. Use --execute to apply changes.', 'cyan');
      return;
    }

    // Step 4: Fix broken collections
    if (fixCollections && issues.broken.length > 0) {
      await fixBrokenCollections(issues, dryRun);
    }

    // Step 5: Delete duplicates (only if explicitly requested)
    if (deleteCollections && issues.duplicates.length > 0) {
      await deleteDuplicateCollections(issues, dryRun);
    }

    // Step 6: Fix product tags
    if (fixTags) {
      await fixProductTags(dryRun);
    }

    // Step 7: Menu report
    await generateMenuReport();

    // Summary
    logSection('COMPLETE');
    if (dryRun) {
      log('\nThis was a DRY RUN. To execute changes:', 'yellow');
      console.log('  node src/collection-cleanup.js --execute --fix-collections');
      console.log('  node src/collection-cleanup.js --execute --delete-collections');
      console.log('  node src/collection-cleanup.js --execute --fix-tags');
    } else {
      log('\nChanges have been applied!', 'green');
    }

  } catch (error) {
    log(`\nFatal error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();
