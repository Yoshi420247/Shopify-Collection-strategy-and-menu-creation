// Configuration for the Shopify Collection Strategy Bot
import 'dotenv/config';
import { taxonomy, tagsToRemove } from './data/taxonomy.js';
import { familyCollection, tagCollection } from './lib/rule-builder.js';

// =============================================================================
// Environment Validation
// =============================================================================

function validateEnv() {
  const required = {
    SHOPIFY_STORE_URL: process.env.SHOPIFY_STORE_URL,
    SHOPIFY_ACCESS_TOKEN: process.env.SHOPIFY_ACCESS_TOKEN,
  };

  const missing = Object.entries(required)
    .filter(([, val]) => !val)
    .map(([key]) => key);

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Copy .env.example to .env and fill in the values.');
  }

  return missing.length === 0;
}

const envValid = validateEnv();

// =============================================================================
// Vendor (configurable via env or CLI)
// =============================================================================

const vendor = process.env.SHOPIFY_VENDOR || 'What You Need';

export const config = {
  shopify: {
    storeUrl: process.env.SHOPIFY_STORE_URL,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    apiVersion: process.env.SHOPIFY_API_VERSION || '2024-01',
  },

  envValid,

  vendor,

  // Taxonomy imported from data/taxonomy.js
  taxonomy,

  // Collection strategy for Smoke & Vape section
  collections: {
    // Main landing collection
    main: {
      handle: 'smoke-and-vape',
      title: 'Smoke & Vape',
      rules: [{ column: 'vendor', relation: 'equals', condition: vendor }],
    },

    // Primary category collections — using rule builders to reduce duplication
    categories: [
      familyCollection('bongs-water-pipes', 'Bongs & Water Pipes', 'glass-bong', vendor),
      familyCollection('bongs', 'Bongs', 'glass-bong', vendor),
      familyCollection('dab-rigs', 'Dab Rigs', 'glass-rig', vendor),
      familyCollection('hand-pipes', 'Hand Pipes', 'spoon-pipe', vendor),
      familyCollection('bubblers', 'Bubblers', 'bubbler', vendor),
      familyCollection('nectar-collectors', 'Nectar Collectors', 'nectar-collector', vendor),
      familyCollection('one-hitters-chillums', 'One Hitters & Chillums', 'chillum-onehitter', vendor),

      // SILICONE COLLECTIONS - Fixed to require material:silicone tag
      tagCollection('silicone-rigs-bongs', 'Silicone Rigs & Bongs', ['material:silicone', 'pillar:smokeshop-device'], { vendor }),
      tagCollection('silicone-pipes', 'Silicone Pipes', ['material:silicone', 'family:spoon-pipe'], { vendor }),
      tagCollection('silicone-water-pipes', 'Silicone Water Pipes', ['material:silicone', 'family:glass-bong'], { vendor }),
      tagCollection('silicone-smoking-devices', 'Silicone Smoking Devices', ['material:silicone'], { vendor }),
    ],

    // Accessory collections
    accessories: [
      tagCollection('accessories', 'Accessories', ['pillar:accessory'], { vendor }),
      tagCollection('quartz-bangers', 'Quartz Bangers', ['family:banger', 'material:quartz'], { vendor }),
      familyCollection('carb-caps', 'Carb Caps', 'carb-cap', vendor),
      familyCollection('dab-tools', 'Dab Tools', 'dab-tool', vendor),
      familyCollection('flower-bowls', 'Flower Bowls', 'flower-bowl', vendor),
      familyCollection('ash-catchers', 'Ash Catchers', 'ash-catcher', vendor),
      familyCollection('torches', 'Torches', 'torch', vendor),
      familyCollection('grinders', 'Grinders', 'grinder', vendor),
      familyCollection('rolling-papers', 'Rolling Papers', 'rolling-paper', vendor),
      tagCollection('vapes-electronics', 'Vapes & Electronics', ['use:vaping'], { vendor }),
      tagCollection('storage-containers', 'Storage & Containers', ['use:storage'], { vendor }),
      tagCollection('pendants-merch', 'Pendants & Merch', ['pillar:merch'], { vendor }),
      familyCollection('trays-work-surfaces', 'Trays & Work Surfaces', 'rolling-tray', vendor),
    ],

    // Brand collections
    brands: [
      { handle: 'monark', title: 'Monark', tag: 'brand:monark' },
      { handle: 'zig-zag', title: 'Zig Zag', tag: 'brand:zig-zag' },
      { handle: 'cookies', title: 'Cookies', tag: 'brand:cookies' },
      { handle: 'maven', title: 'Maven', tag: 'brand:maven' },
      { handle: 'vibes', title: 'Vibes', tag: 'brand:vibes' },
      { handle: 'raw', title: 'RAW', tag: 'brand:raw' },
      { handle: 'elements', title: 'Elements', tag: 'brand:elements' },
      { handle: 'puffco', title: 'Puffco', tag: 'brand:puffco' },
      { handle: 'lookah', title: 'Lookah', tag: 'brand:lookah' },
      { handle: 'g-pen', title: 'G Pen', tag: 'brand:g-pen' },
      { handle: '710-sci', title: '710 SCI', tag: 'brand:710-sci' },
      { handle: 'scorch', title: 'Scorch', tag: 'brand:scorch' },
    ],

    // Style/feature collections
    features: [
      { handle: 'made-in-usa', title: 'Made in USA', tag: 'style:made-in-usa' },
      tagCollection('made-in-usa-glass', 'Made In USA Glass', ['style:made-in-usa', 'material:glass'], { vendor }),
      { handle: 'heady-glass', title: 'Heady Glass', tag: 'style:heady' },
      { handle: 'travel-friendly', title: 'Travel Friendly', tag: 'style:travel-friendly' },
      { handle: 'gifts', title: 'Gifts', tag: 'style:gift' },
    ],

    // Additional category collections
    additionalCategories: [
      tagCollection('glass-pipes', 'Glass Pipes', ['material:glass', 'pillar:smokeshop-device'], { vendor }),
      familyCollection('downstems', 'Downstems', 'downstem', vendor),
      familyCollection('ashtrays', 'Ashtrays', 'ashtray', vendor),
      // No vendor filter — includes Oil Slick, What You Need, and Cloud YHS jars
      tagCollection('concentrate-jars', 'Concentrate Jars', ['family:container', 'use:storage'], { noVendor: true }),
      familyCollection('rolling-papers-cones', 'Rolling Papers & Cones', 'rolling-paper', vendor),
      familyCollection('steamrollers', 'Steamrollers', 'steamroller', vendor),
      tagCollection('electric-grinders', 'Electric Grinders', ['family:grinder', 'style:electric'], { vendor }),
      // No vendor filter — Oil Slick's core product line includes silicone containers
      tagCollection('non-stick-silicone-dab-containers', 'Non-Stick Silicone Dab Containers', ['material:silicone', 'family:container'], { noVendor: true }),
    ],

    // Collections to DELETE (duplicates and broken)
    toDelete: [
      // Legacy underscore format
      'dab_rig', 'hand_pipe', 'quartz_banger', 'torch_tool', 'water_pipe', 'grinder',
      // Redundant "-collection" suffix
      'hand-pipes-collection', 'flower-bowls-collection', 'grinders-collection',
      'torches-collection', 'heady-glass-collection', 'pendants-collection',
      'one-hitter-and-chillums-collection', 'nectar-collectors-collection',
      'carb-caps-collection', 'dabbers-collection', 'essentials-accessories-collection',
      // Numbered duplicates
      'clearance-1', 'clearance-2', 'nectar-collectors-1', 'mylar-bags-1',
      // Overly specific duplicates
      'dab-rigs-and-oil-rigs', 'glass-bongs-and-water-pipes',
      // Duplicate Smoke & Vape landing pages
      'smoke-vape', 'smoke-shop-products', 'all-headshop', 'shop-all-what-you-need',
      'smoking', 'smoking-devices',
      // Alternate dabber/dab-tool names
      'dab-tools-dabbers',
      // Duplicate silicone collections
      'silicone-beaker-bongs', 'silicone-glass-hybrid-rigs-and-bubblers',
      'cute-silicone-rigs', 'top-selling-silicone-rigs', 'silicone-ashtrays',
      // Duplicate extraction/packaging
      'extract-packaging-jars-and-nonstick', 'extraction-materials-packaging',
      'extraction-supplies', 'nonstick-materials-for-extraction',
      'non-stick-paper-and-ptfe', 'glass-jars-extract-packaging',
      'non-stick-containers', 'packaging-storage', 'storage-packaging',
      'storage', 'parchment-papers',
      // Duplicate accessory/misc
      'rolling-accessories', 'ash-catchers-downstems',
      'vaporizer-parts-and-accessories', 'spoons',
      // Size-based (too vague)
      'large-pipes-and-rigs', 'medium-pipes-and-rigs', 'small-pipes-rigs',
      // Seasonal / misc
      'spooky-haloween-sale', 'custom', 'other',
    ],
  },

  // Menu structure - Cleaned up and organized
  menuStructure: {
    // Main navigation menu
    main: {
      title: 'Main menu',
      handle: 'main-menu',
      items: [
        {
          title: 'Shop All',
          url: '/collections/all',
        },
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
    // Sidebar menu for mobile/navigation
    sidebar: {
      title: 'Sidebar Menu',
      handle: 'sidebar-menu',
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
  },

  // Tags to remove (imported from taxonomy data)
  tagsToRemove,

  // URL redirects: legacy/dead collection URLs -> correct active collection URLs
  redirects: [
    { from: '/collections/dab_rig', to: '/collections/dab-rigs' },
    { from: '/collections/hand_pipe', to: '/collections/hand-pipes' },
    { from: '/collections/quartz_banger', to: '/collections/quartz-bangers' },
    { from: '/collections/torch_tool', to: '/collections/torches' },
    { from: '/collections/water_pipe', to: '/collections/bongs-water-pipes' },
    { from: '/collections/hand-pipes-collection', to: '/collections/hand-pipes' },
    { from: '/collections/flower-bowls-collection', to: '/collections/flower-bowls' },
    { from: '/collections/grinders-collection', to: '/collections/grinders' },
    { from: '/collections/torches-collection', to: '/collections/torches' },
    { from: '/collections/heady-glass-collection', to: '/collections/heady-glass' },
    { from: '/collections/pendants-collection', to: '/collections/pendants-merch' },
    { from: '/collections/one-hitter-and-chillums-collection', to: '/collections/one-hitters-chillums' },
    { from: '/collections/nectar-collectors-collection', to: '/collections/nectar-collectors' },
    { from: '/collections/carb-caps-collection', to: '/collections/carb-caps' },
    { from: '/collections/dabbers-collection', to: '/collections/dab-tools' },
    { from: '/collections/essentials-accessories-collection', to: '/collections/accessories' },
    { from: '/collections/dab-tools-dabbers', to: '/collections/dab-tools' },
    { from: '/collections/dabbers', to: '/collections/dab-tools' },
    { from: '/collections/clearance-1', to: '/collections/clearance' },
    { from: '/collections/clearance-2', to: '/collections/clearance' },
    { from: '/collections/nectar-collectors-1', to: '/collections/nectar-collectors' },
    { from: '/collections/mylar-bags-1', to: '/collections/mylar-bags' },
    { from: '/collections/dab-rigs-and-oil-rigs', to: '/collections/dab-rigs' },
    { from: '/collections/glass-bongs-and-water-pipes', to: '/collections/bongs-water-pipes' },
    { from: '/collections/smoke-vape', to: '/collections/smoke-and-vape' },
    { from: '/collections/smoke-shop-products', to: '/collections/smoke-and-vape' },
    { from: '/collections/all-headshop', to: '/collections/smoke-and-vape' },
    { from: '/collections/shop-all-what-you-need', to: '/collections/smoke-and-vape' },
    { from: '/collections/smoking', to: '/collections/smoke-and-vape' },
    { from: '/collections/smoking-devices', to: '/collections/smoke-and-vape' },
    { from: '/collections/rolling-accessories', to: '/collections/rolling-papers' },
    { from: '/collections/ash-catchers-downstems', to: '/collections/ash-catchers' },
    { from: '/collections/papers', to: '/collections/rolling-papers' },
    { from: '/collections/spoons', to: '/collections/hand-pipes' },
    { from: '/collections/silicone-beaker-bongs', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/silicone-glass-hybrid-rigs-and-bubblers', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/cute-silicone-rigs', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/top-selling-silicone-rigs', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/silicone-ashtrays', to: '/collections/ashtrays' },
    { from: '/collections/extract-packaging-jars-and-nonstick', to: '/collections/extraction-packaging' },
    { from: '/collections/extraction-materials-packaging', to: '/collections/extraction-packaging' },
    { from: '/collections/extraction-supplies', to: '/collections/extraction-packaging' },
    { from: '/collections/nonstick-materials-for-extraction', to: '/collections/extraction-packaging' },
    { from: '/collections/non-stick-paper-and-ptfe', to: '/collections/ptfe-sheets' },
    { from: '/collections/glass-jars-extract-packaging', to: '/collections/glass-jars' },
    { from: '/collections/non-stick-containers', to: '/collections/concentrate-containers' },
    { from: '/collections/packaging-storage', to: '/collections/storage-containers' },
    { from: '/collections/storage-packaging', to: '/collections/storage-containers' },
    { from: '/collections/storage', to: '/collections/storage-containers' },
    { from: '/collections/parchment-papers', to: '/collections/parchment-paper' },
    { from: '/collections/vaporizer-parts-and-accessories', to: '/collections/vapes-electronics' },
    { from: '/collections/dabbing', to: '/collections/dab-rigs' },
    { from: '/collections/large-pipes-and-rigs', to: '/collections/smoke-and-vape' },
    { from: '/collections/medium-pipes-and-rigs', to: '/collections/smoke-and-vape' },
    { from: '/collections/small-pipes-rigs', to: '/collections/smoke-and-vape' },
    { from: '/collections/spooky-haloween-sale', to: '/collections/clearance' },
    { from: '/collections/custom', to: '/collections/all' },
    { from: '/collections/other', to: '/collections/all' },
    { from: '/collections/grinder', to: '/collections/grinders' },

    // Singular form redirects — common search terms and typos
    { from: '/collections/bong', to: '/collections/bongs' },
    { from: '/collections/pipe', to: '/collections/hand-pipes' },
    { from: '/collections/bubbler', to: '/collections/bubblers' },
    { from: '/collections/dab-rig', to: '/collections/dab-rigs' },
    { from: '/collections/nectar-collector', to: '/collections/nectar-collectors' },
    { from: '/collections/chillum', to: '/collections/one-hitters-chillums' },
    { from: '/collections/one-hitter', to: '/collections/one-hitters-chillums' },
    { from: '/collections/carb-cap', to: '/collections/carb-caps' },
    { from: '/collections/dab-tool', to: '/collections/dab-tools' },
    { from: '/collections/flower-bowl', to: '/collections/flower-bowls' },
    { from: '/collections/ash-catcher', to: '/collections/ash-catchers' },
    { from: '/collections/torch', to: '/collections/torches' },
    { from: '/collections/rolling-paper', to: '/collections/rolling-papers' },
    { from: '/collections/downstem', to: '/collections/downstems' },
    { from: '/collections/ashtray', to: '/collections/ashtrays' },
    { from: '/collections/steamroller', to: '/collections/steamrollers' },
    { from: '/collections/concentrate-jar', to: '/collections/concentrate-jars' },
    { from: '/collections/glass-jar', to: '/collections/glass-jars' },
    { from: '/collections/mylar-bag', to: '/collections/mylar-bags' },
    { from: '/collections/joint-tube', to: '/collections/joint-tubes' },
    { from: '/collections/silicone-pad', to: '/collections/silicone-pads' },
    { from: '/collections/fep-sheet', to: '/collections/fep-sheets' },
    { from: '/collections/ptfe-sheet', to: '/collections/ptfe-sheets' },
    { from: '/collections/vape', to: '/collections/vapes-electronics' },
    { from: '/collections/pendant', to: '/collections/pendants-merch' },
    { from: '/collections/tray', to: '/collections/trays-work-surfaces' },
    { from: '/collections/electric-grinder', to: '/collections/electric-grinders' },

    // Nectar collector / straw variants
    { from: '/collections/nectar-collectors-straws', to: '/collections/nectar-collectors' },
    { from: '/collections/nectar-straw', to: '/collections/nectar-collectors' },
    { from: '/collections/nectar-straws', to: '/collections/nectar-collectors' },
    { from: '/collections/dab-straw', to: '/collections/nectar-collectors' },
    { from: '/collections/dab-straws', to: '/collections/nectar-collectors' },

    // Alternate naming / common search variants
    { from: '/collections/water-pipe', to: '/collections/bongs-water-pipes' },
    { from: '/collections/water-pipes', to: '/collections/bongs-water-pipes' },
    { from: '/collections/glass-bong', to: '/collections/bongs-water-pipes' },
    { from: '/collections/glass-bongs', to: '/collections/bongs-water-pipes' },
    { from: '/collections/oil-rig', to: '/collections/dab-rigs' },
    { from: '/collections/oil-rigs', to: '/collections/dab-rigs' },
    { from: '/collections/rigs', to: '/collections/dab-rigs' },
    { from: '/collections/wax-rig', to: '/collections/dab-rigs' },
    { from: '/collections/wax-rigs', to: '/collections/dab-rigs' },
    { from: '/collections/concentrate-rig', to: '/collections/dab-rigs' },
    { from: '/collections/concentrate-rigs', to: '/collections/dab-rigs' },
    { from: '/collections/silicone-bong', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/silicone-bongs', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/silicone-rig', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/silicone-rigs', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/vapes', to: '/collections/vapes-electronics' },
    { from: '/collections/vaporizer', to: '/collections/vapes-electronics' },
    { from: '/collections/vaporizers', to: '/collections/vapes-electronics' },
    { from: '/collections/electronic', to: '/collections/vapes-electronics' },
    { from: '/collections/electronics', to: '/collections/vapes-electronics' },
    { from: '/collections/pendants', to: '/collections/pendants-merch' },
    { from: '/collections/merch', to: '/collections/pendants-merch' },
    { from: '/collections/merchandise', to: '/collections/pendants-merch' },
    { from: '/collections/trays', to: '/collections/trays-work-surfaces' },
    { from: '/collections/rolling-tray', to: '/collections/trays-work-surfaces' },
    { from: '/collections/rolling-trays', to: '/collections/trays-work-surfaces' },
    { from: '/collections/cones', to: '/collections/rolling-papers-cones' },
    { from: '/collections/pre-rolled-cones', to: '/collections/rolling-papers-cones' },
    { from: '/collections/bowls', to: '/collections/flower-bowls' },
    { from: '/collections/glass-bowls', to: '/collections/flower-bowls' },
    { from: '/collections/bangers', to: '/collections/quartz-bangers' },
    { from: '/collections/quartz', to: '/collections/quartz-bangers' },
    { from: '/collections/tools', to: '/collections/dab-tools' },
    { from: '/collections/dab-accessories', to: '/collections/accessories' },
    { from: '/collections/smoking-accessories', to: '/collections/accessories' },
    { from: '/collections/usa', to: '/collections/made-in-usa' },
    { from: '/collections/american-made', to: '/collections/made-in-usa' },
    { from: '/collections/usa-glass', to: '/collections/made-in-usa-glass' },
    { from: '/collections/american-glass', to: '/collections/made-in-usa-glass' },
    { from: '/collections/heady', to: '/collections/heady-glass' },
    { from: '/collections/gift', to: '/collections/gifts' },
    { from: '/collections/gift-ideas', to: '/collections/gifts' },
    { from: '/collections/parchment', to: '/collections/parchment-paper' },
    { from: '/collections/fep', to: '/collections/fep-sheets' },
    { from: '/collections/ptfe', to: '/collections/ptfe-sheets' },
    { from: '/collections/containers', to: '/collections/concentrate-containers' },
    { from: '/collections/jars', to: '/collections/glass-jars' },
  ],
};

export default config;
