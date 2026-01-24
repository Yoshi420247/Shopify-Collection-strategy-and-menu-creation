// Configuration for the Shopify Collection Strategy Bot
import 'dotenv/config';

export const config = {
  shopify: {
    storeUrl: process.env.SHOPIFY_STORE_URL,
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
    apiVersion: process.env.SHOPIFY_API_VERSION || '2024-01',
  },

  vendor: 'What You Need',

  // Optimal tag taxonomy for smokeshop products
  taxonomy: {
    // Primary categories (pillar tags)
    pillars: {
      'smokeshop-device': 'Primary smoking/vaping devices',
      'accessory': 'Accessories and add-ons',
      'merch': 'Merchandise and branded items',
      'packaging': 'Packaging and storage solutions',
    },

    // Use cases
    uses: {
      'flower-smoking': 'For smoking dry herb/flower',
      'dabbing': 'For concentrates/dabs/extracts',
      'rolling': 'For rolling papers and cones',
      'vaping': 'For vaporizers and e-devices',
      'preparation': 'For preparation (grinders, scales)',
      'storage': 'For storing products',
    },

    // Product families - organized by category
    families: {
      // Flower Smoking Devices
      'glass-bong': { use: 'flower-smoking', pillar: 'smokeshop-device', display: 'Bongs & Water Pipes' },
      'bubbler': { use: 'flower-smoking', pillar: 'smokeshop-device', display: 'Bubblers' },
      'spoon-pipe': { use: 'flower-smoking', pillar: 'smokeshop-device', display: 'Hand Pipes' },
      'chillum-onehitter': { use: 'flower-smoking', pillar: 'smokeshop-device', display: 'One Hitters & Chillums' },
      'steamroller': { use: 'flower-smoking', pillar: 'smokeshop-device', display: 'Steamrollers' },

      // Dabbing Devices
      'glass-rig': { use: 'dabbing', pillar: 'smokeshop-device', display: 'Dab Rigs' },
      'silicone-rig': { use: 'dabbing', pillar: 'smokeshop-device', display: 'Silicone Rigs' },
      'nectar-collector': { use: 'dabbing', pillar: 'smokeshop-device', display: 'Nectar Collectors' },
      'e-rig': { use: 'dabbing', pillar: 'smokeshop-device', display: 'Electronic Rigs' },

      // Accessories - Dabbing
      'banger': { use: 'dabbing', pillar: 'accessory', display: 'Quartz Bangers' },
      'carb-cap': { use: 'dabbing', pillar: 'accessory', display: 'Carb Caps' },
      'dab-tool': { use: 'dabbing', pillar: 'accessory', display: 'Dab Tools' },
      'torch': { use: 'dabbing', pillar: 'accessory', display: 'Torches' },

      // Accessories - Flower
      'flower-bowl': { use: 'flower-smoking', pillar: 'accessory', display: 'Flower Bowls' },
      'ash-catcher': { use: 'flower-smoking', pillar: 'accessory', display: 'Ash Catchers' },
      'downstem': { use: 'flower-smoking', pillar: 'accessory', display: 'Downstems' },

      // Rolling
      'rolling-paper': { use: 'rolling', pillar: 'accessory', display: 'Rolling Papers' },
      'rolling-tray': { use: 'rolling', pillar: 'accessory', display: 'Rolling Trays' },
      'rolling-machine': { use: 'rolling', pillar: 'accessory', display: 'Rolling Machines' },

      // Vaping
      'vape-battery': { use: 'vaping', pillar: 'smokeshop-device', display: 'Vape Batteries' },
      'vape-cartridge': { use: 'vaping', pillar: 'accessory', display: 'Vape Cartridges' },

      // Preparation
      'grinder': { use: 'preparation', pillar: 'accessory', display: 'Grinders' },
      'scale': { use: 'preparation', pillar: 'accessory', display: 'Scales' },

      // Storage
      'storage-accessory': { use: 'storage', pillar: 'accessory', display: 'Storage' },
      'container': { use: 'storage', pillar: 'accessory', display: 'Containers' },

      // Merch
      'merch-pendant': { use: null, pillar: 'merch', display: 'Pendants' },
      'merch-apparel': { use: null, pillar: 'merch', display: 'Apparel' },
    },

    // Materials (keep these - useful for filtering)
    materials: ['glass', 'silicone', 'quartz', 'metal', 'borosilicate', 'titanium', 'ceramic', 'wood'],

    // Joint specs (keep these - important for compatibility)
    jointSpecs: {
      sizes: ['10mm', '14mm', '18mm'],
      genders: ['male', 'female'],
      angles: ['45', '90'],
    },

    // Styles (keep these - useful for browsing)
    styles: ['heady', 'made-in-usa', 'animal', 'travel-friendly', 'brand-highlight'],

    // Brands to keep
    brands: [
      'monark', 'zig-zag', 'cookies', 'maven', 'vibes', 'raw',
      'peaselburg', 'lookah', 'g-pen', 'puffco', 'elements',
      'scorch', 'only-quartz', '710-sci', 'eo-vape'
    ],
  },

  // Collection strategy for Smoke & Vape section
  collections: {
    // Main landing collection
    main: {
      handle: 'smoke-and-vape',
      title: 'Smoke & Vape',
      rules: [{ column: 'vendor', relation: 'equals', condition: 'What You Need' }],
    },

    // Primary category collections
    categories: [
      {
        handle: 'bongs-water-pipes',
        title: 'Bongs & Water Pipes',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:glass-bong' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'dab-rigs',
        title: 'Dab Rigs',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:glass-rig' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'hand-pipes',
        title: 'Hand Pipes',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:spoon-pipe' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'bubblers',
        title: 'Bubblers',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:bubbler' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'nectar-collectors',
        title: 'Nectar Collectors',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:nectar-collector' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'one-hitters-chillums',
        title: 'One Hitters & Chillums',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:chillum-onehitter' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
    ],

    // Accessory collections
    accessories: [
      {
        handle: 'quartz-bangers',
        title: 'Quartz Bangers',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:banger' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'carb-caps',
        title: 'Carb Caps',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:carb-cap' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'dab-tools',
        title: 'Dab Tools',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:dab-tool' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'flower-bowls',
        title: 'Flower Bowls',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:flower-bowl' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'ash-catchers',
        title: 'Ash Catchers',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:ash-catcher' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'torches',
        title: 'Torches',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:torch' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'grinders',
        title: 'Grinders',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:grinder' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'rolling-papers',
        title: 'Rolling Papers',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:rolling-paper' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'vapes-electronics',
        title: 'Vapes & Electronics',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:vape-battery' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'storage-containers',
        title: 'Storage & Containers',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:storage-accessory' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'pendants-merch',
        title: 'Pendants & Merch',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:merch-pendant' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
    ],

    // Brand collections
    brands: [
      { handle: 'monark', title: 'Monark', tag: 'brand:monark' },
      { handle: 'zig-zag', title: 'Zig Zag', tag: 'brand:zig-zag' },
      { handle: 'cookies', title: 'Cookies', tag: 'brand:cookies' },
      { handle: 'maven', title: 'Maven', tag: 'brand:maven' },
      { handle: 'vibes', title: 'Vibes', tag: 'brand:vibes' },
      { handle: 'raw', title: 'RAW', tag: 'brand:raw' },
    ],

    // Style/feature collections
    features: [
      { handle: 'made-in-usa', title: 'Made in USA', tag: 'style:made-in-usa' },
      { handle: 'heady-glass', title: 'Heady Glass', tag: 'style:heady' },
      { handle: 'travel-friendly', title: 'Travel Friendly', tag: 'style:travel-friendly' },
    ],
  },

  // Menu structure for Smoke & Vape section
  menuStructure: {
    main: {
      title: 'Smoke & Vape',
      handle: 'smoke-vape-menu',
      items: [
        {
          title: 'Shop All',
          url: '/collections/smoke-and-vape',
        },
        {
          title: 'Smoking Devices',
          url: '/collections/bongs-water-pipes',
          children: [
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
          title: 'Vapes & Electronics',
          url: '/collections/vapes-electronics',
        },
        {
          title: 'By Brand',
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
        {
          title: 'Featured',
          url: '#',
          children: [
            { title: 'Made in USA', url: '/collections/made-in-usa' },
            { title: 'Heady Glass', url: '/collections/heady-glass' },
            { title: 'Travel Friendly', url: '/collections/travel-friendly' },
          ],
        },
      ],
    },
  },

  // Tags to remove (obsolete/redundant)
  tagsToRemove: [
    // Keep format tags only where family doesn't exist
    // Remove duplicate/legacy tags
  ],
};

export default config;
