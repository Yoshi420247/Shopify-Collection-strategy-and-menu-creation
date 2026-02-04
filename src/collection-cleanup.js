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
    issue: 'Too broad - matches silicone accessories/containers, not just rigs & bongs',
    fix: {
      rules: [
        { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        { column: 'tag', relation: 'equals', condition: 'material:silicone' },
        { column: 'tag', relation: 'equals', condition: 'pillar:smokeshop-device' },
      ],
      disjunctive: false,
    },
  },
  'quartz-bangers': {
    issue: 'Missing material:quartz rule - includes titanium and ceramic nails incorrectly',
    fix: {
      rules: [
        { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        { column: 'tag', relation: 'equals', condition: 'family:banger' },
        { column: 'tag', relation: 'equals', condition: 'material:quartz' },
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
// SILICONE PRODUCT TAG FIXES
// ============================================================================

// Products that need tag corrections
const PRODUCT_TAG_FIXES = [
  // Silicone nectar collectors tagged incorrectly
  {
    titleContains: 'silicone nectar',
    currentFamily: 'flower-bowl',
    correctFamily: 'nectar-collector',
    ensureTags: ['material:silicone', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  // Silicone bubblers
  {
    titleContains: 'silicone bubbler',
    ensureTags: ['material:silicone', 'family:bubbler', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'silicone hammer',
    ensureTags: ['material:silicone'],
  },
  // Silicone rigs
  {
    titleContains: 'silicone rig',
    ensureTags: ['material:silicone', 'family:silicone-rig', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'silicone pipe',
    ensureTags: ['material:silicone', 'family:spoon-pipe', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  // Silicone bongs and water pipes
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
  // Silicone accessories
  {
    titleContains: 'silicone ashtray',
    ensureTags: ['material:silicone', 'family:ashtray', 'use:flower-smoking', 'pillar:accessory'],
  },
  {
    titleContains: 'silicone container',
    ensureTags: ['material:silicone', 'family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'silicone jar',
    ensureTags: ['material:silicone', 'family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'dab container',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'concentrate jar',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'concentrate container',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'wax container',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'wax jar',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'non-stick container',
    ensureTags: ['material:silicone', 'family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'nonstick container',
    ensureTags: ['material:silicone', 'family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'non stick container',
    ensureTags: ['material:silicone', 'family:container', 'use:storage', 'pillar:accessory'],
  },
  // Oil Slick brand concentrate container patterns
  {
    titleContains: 'oil container',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'plastic container',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'glass jar',
    ensureTags: ['material:glass', 'family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'concentrate storage',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'extract jar',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'extract container',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'oil jar',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'child resistant jar',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'child-resistant jar',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'screw top jar',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'screw-top jar',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  // Glass products - ensure material tag
  {
    titleContains: 'glass bong',
    ensureTags: ['material:glass', 'family:glass-bong', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'glass pipe',
    ensureTags: ['material:glass', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'glass rig',
    ensureTags: ['material:glass', 'family:glass-rig', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'dab rig',
    ensureTags: ['family:glass-rig', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  // Quartz products
  {
    titleContains: 'quartz banger',
    ensureTags: ['material:quartz', 'family:banger', 'use:dabbing', 'pillar:accessory'],
  },
  {
    titleContains: 'quartz nail',
    ensureTags: ['material:quartz', 'family:banger', 'use:dabbing', 'pillar:accessory'],
  },
  // Titanium products
  {
    titleContains: 'titanium nail',
    ensureTags: ['material:titanium', 'family:banger', 'use:dabbing', 'pillar:accessory'],
  },
  {
    titleContains: 'titanium dab tool',
    ensureTags: ['material:titanium', 'family:dab-tool', 'use:dabbing', 'pillar:accessory'],
  },
  // Ceramic products
  {
    titleContains: 'ceramic nail',
    ensureTags: ['material:ceramic', 'family:banger', 'use:dabbing', 'pillar:accessory'],
  },
  // Carb caps
  {
    titleContains: 'carb cap',
    ensureTags: ['family:carb-cap', 'use:dabbing', 'pillar:accessory'],
  },
  // Dab tools
  {
    titleContains: 'dab tool',
    ensureTags: ['family:dab-tool', 'use:dabbing', 'pillar:accessory'],
  },
  {
    titleContains: 'dabber',
    ensureTags: ['family:dab-tool', 'use:dabbing', 'pillar:accessory'],
  },
  // Torches
  {
    titleContains: 'torch',
    ensureTags: ['family:torch', 'use:dabbing', 'pillar:accessory'],
  },
  // Grinders
  {
    titleContains: 'grinder',
    ensureTags: ['family:grinder', 'use:preparation', 'pillar:accessory'],
  },
  {
    titleContains: 'electric grinder',
    ensureTags: ['family:grinder', 'use:preparation', 'pillar:accessory', 'style:electric'],
  },
  // Rolling products
  {
    titleContains: 'rolling paper',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: 'rolling tray',
    ensureTags: ['family:rolling-tray', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: ' cone',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: 'cones ',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: 'cones-',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: 'pre-roll',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  // Nectar collectors
  {
    titleContains: 'nectar collector',
    ensureTags: ['family:nectar-collector', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'honey straw',
    ensureTags: ['family:nectar-collector', 'use:dabbing', 'pillar:smokeshop-device'],
  },
  // Bubblers
  {
    titleContains: 'bubbler',
    ensureTags: ['family:bubbler', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  // One hitters and chillums
  {
    titleContains: 'one hitter',
    ensureTags: ['family:chillum-onehitter', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'chillum',
    ensureTags: ['family:chillum-onehitter', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'dugout',
    ensureTags: ['family:chillum-onehitter', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  // Ash catchers and downstems
  {
    titleContains: 'ash catcher',
    ensureTags: ['family:ash-catcher', 'use:flower-smoking', 'pillar:accessory'],
  },
  {
    titleContains: 'downstem',
    ensureTags: ['family:downstem', 'use:flower-smoking', 'pillar:accessory'],
  },
  // Bowls
  {
    titleContains: 'flower bowl',
    ensureTags: ['family:flower-bowl', 'use:flower-smoking', 'pillar:accessory'],
  },
  {
    titleContains: 'bowl piece',
    ensureTags: ['family:flower-bowl', 'use:flower-smoking', 'pillar:accessory'],
  },
  // Vapes
  {
    titleContains: 'vape battery',
    ensureTags: ['family:vape-battery', 'use:vaping', 'pillar:smokeshop-device'],
  },
  {
    titleContains: '510 battery',
    ensureTags: ['family:vape-battery', 'use:vaping', 'pillar:smokeshop-device'],
  },
  {
    titleContains: 'vape pen',
    ensureTags: ['family:vape-battery', 'use:vaping', 'pillar:smokeshop-device'],
  },
  // Steamrollers
  {
    titleContains: 'steamroller',
    ensureTags: ['family:steamroller', 'use:flower-smoking', 'pillar:smokeshop-device'],
  },
  // Storage
  {
    titleContains: 'stash jar',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'storage container',
    ensureTags: ['family:storage-accessory', 'use:storage', 'pillar:accessory'],
  },
  {
    titleContains: 'wigwag jar',
    ensureTags: ['family:container', 'use:storage', 'pillar:accessory'],
  },
  // Additional rolling paper patterns
  {
    titleContains: 'blunt wrap',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: 'rolling cone',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: 'paper tips',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  {
    titleContains: 'filter tips',
    ensureTags: ['family:rolling-paper', 'use:rolling', 'pillar:accessory'],
  },
  // Additional quartz banger patterns
  {
    titleContains: 'banger',
    ensureTags: ['family:banger', 'use:dabbing', 'pillar:accessory'],
  },
  // Ensure quartz bangers get material:quartz tag
  {
    titleContains: 'quartz',
    ensureTags: ['material:quartz'],
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

  // Fetch products from ALL vendors (not just What You Need)
  // Concentrate jars, silicone containers etc. span multiple vendors
  const vendorsToFix = [config.vendor, 'Oil Slick', 'Cloud YHS'];
  let products = [];
  for (const vendor of vendorsToFix) {
    try {
      const vendorProducts = await api.getAllProductsByVendor(vendor);
      log(`  Fetched ${vendorProducts.length} products from "${vendor}"`, 'cyan');
      products.push(...vendorProducts);
    } catch (error) {
      log(`  Warning: Could not fetch "${vendor}" products: ${error.message}`, 'yellow');
    }
  }
  log(`Total: ${products.length} products across ${vendorsToFix.length} vendors`, 'cyan');

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

    // Fix silicone products incorrectly tagged as rolling papers
    // (caused by old 'cone' pattern matching substring in 'silicone')
    if (title.includes('silicone') && !title.includes('rolling') && !title.includes('paper')) {
      if (newTags.has('family:rolling-paper')) {
        newTags.delete('family:rolling-paper');
        needsUpdate = true;
        console.log(`\n  ${product.title}`);
        console.log(`    Removing incorrect tag: family:rolling-paper (silicone product, not rolling paper)`);
      }
      if (newTags.has('use:rolling')) {
        newTags.delete('use:rolling');
        needsUpdate = true;
        console.log(`    Removing incorrect tag: use:rolling (silicone product, not rolling paper)`);
      }
    }

    // Ensure quartz products have material:quartz tag
    if (title.includes('quartz') && !newTags.has('material:quartz')) {
      newTags.add('material:quartz');
      needsUpdate = true;
      console.log(`\n  ${product.title}`);
      console.log(`    Adding missing tag: material:quartz`);
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
