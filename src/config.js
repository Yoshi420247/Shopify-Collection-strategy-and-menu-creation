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
      'extraction': 'For extraction surfaces, liners, and packaging',
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
      'ashtray': { use: 'flower-smoking', pillar: 'accessory', display: 'Ashtrays' },

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

      // Adapters & Misc Accessories
      'adapter': { use: 'flower-smoking', pillar: 'accessory', display: 'Adapters & Drop Downs' },
      'cleaning-supply': { use: null, pillar: 'accessory', display: 'Cleaning Supplies' },
      'lighter': { use: 'flower-smoking', pillar: 'accessory', display: 'Lighters' },
      'clip': { use: null, pillar: 'accessory', display: 'Clips & Holders' },
      'screen': { use: 'flower-smoking', pillar: 'accessory', display: 'Screens' },

      // Merch
      'merch-pendant': { use: null, pillar: 'merch', display: 'Pendants' },
      'merch-apparel': { use: null, pillar: 'merch', display: 'Apparel' },

      // Extraction & Packaging
      'fep-sheet': { use: 'extraction', pillar: 'packaging', display: 'FEP Sheets & Rolls' },
      'ptfe-sheet': { use: 'extraction', pillar: 'packaging', display: 'PTFE Sheets & Rolls' },
      'silicone-pad': { use: 'extraction', pillar: 'packaging', display: 'Silicone Pads & Mats' },
      'parchment-sheet': { use: 'extraction', pillar: 'packaging', display: 'Parchment Paper' },
      'glass-jar': { use: 'storage', pillar: 'packaging', display: 'Glass Jars' },
      'mylar-bag': { use: 'storage', pillar: 'packaging', display: 'Mylar Bags' },
      'joint-tube': { use: 'storage', pillar: 'packaging', display: 'Joint Tubes' },
    },

    // Expected material associations per family (for cross-validation)
    familyMaterials: {
      'glass-bong': ['glass', 'borosilicate'],
      'glass-rig': ['glass', 'borosilicate'],
      'silicone-rig': ['silicone'],
      'banger': ['quartz', 'titanium', 'ceramic'],
      'spoon-pipe': ['glass', 'silicone', 'metal', 'wood'],
      'bubbler': ['glass', 'silicone'],
    },

    // Materials (keep these - useful for filtering)
    materials: ['glass', 'silicone', 'quartz', 'metal', 'borosilicate', 'titanium', 'ceramic', 'wood', 'fep', 'ptfe', 'parchment'],

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

  // Collection strategy - Cleaned up and consolidated
  collections: {
    // Main landing collection
    main: {
      handle: 'smoke-and-vape',
      title: 'Smoke & Vape',
      rules: [{ column: 'vendor', relation: 'equals', condition: 'What You Need' }],
    },

    // Primary device collections (no redundant duplicates)
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
      // REMOVED: 'bongs' - identical rules to bongs-water-pipes (same 66 products)
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
      {
        handle: 'steamrollers',
        title: 'Steamrollers',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:steamroller' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      // Consolidated silicone: ONE collection for all silicone smoking devices
      {
        handle: 'silicone-rigs-bongs',
        title: 'Silicone Rigs & Bongs',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'material:silicone' },
          { column: 'tag', relation: 'equals', condition: 'pillar:smokeshop-device' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      // REMOVED: silicone-pipes (4 products - too thin), silicone-water-pipes (2 products - too thin),
      //          silicone-smoking-devices (superset that overlaps silicone-rigs-bongs)

      // NEW: Novelty & Character Pipes - 105 products tagged style:animal, high-demand browsing category
      {
        handle: 'novelty-character-pipes',
        title: 'Novelty & Character Pipes',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'style:animal' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
    ],

    // Accessory collections - split into sub-landing pages + individual categories
    accessories: [
      // Parent landing page (kept but customers should navigate to sub-landings)
      {
        handle: 'accessories',
        title: 'Accessories',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'pillar:accessory' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      // NEW: Dab Accessories sub-landing (bangers, carb caps, dab tools, torches)
      {
        handle: 'dab-accessories',
        title: 'Dab Accessories',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'pillar:accessory' },
          { column: 'tag', relation: 'equals', condition: 'use:dabbing' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      // NEW: Flower Accessories sub-landing (bowls, ash catchers, downstems, grinders, rolling)
      {
        handle: 'flower-accessories',
        title: 'Flower Accessories',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'pillar:accessory' },
          { column: 'tag', relation: 'equals', condition: 'use:flower-smoking' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      // Individual accessory collections
      {
        handle: 'quartz-bangers',
        title: 'Quartz Bangers',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:banger' },
          { column: 'tag', relation: 'equals', condition: 'material:quartz' },
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
        handle: 'rolling-papers-cones',
        title: 'Rolling Papers & Cones',
        // MERGED: rolling-papers + rolling-papers-cones into one canonical collection
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:rolling-paper' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      // REMOVED: 'rolling-papers' - identical rules to rolling-papers-cones (same 64 products)
      {
        handle: 'downstems',
        title: 'Downstems',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:downstem' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'ashtrays',
        title: 'Ashtrays',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:ashtray' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'vapes-electronics',
        title: 'Vapes & Electronics',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'use:vaping' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'storage-containers',
        title: 'Storage & Containers',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'use:storage' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'trays-work-surfaces',
        title: 'Trays & Work Surfaces',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:rolling-tray' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'pendants-merch',
        title: 'Pendants & Merch',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'pillar:merch' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      // NEW: Cleaning Supplies
      {
        handle: 'cleaning-supplies',
        title: 'Cleaning Supplies',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:cleaning-supply' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      // NEW: Adapters & Drop Downs
      {
        handle: 'adapters',
        title: 'Adapters & Drop Downs',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:adapter' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
    ],

    // Brand collections - all brands with 10+ products
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
      // NEW: Previously missing brand collections
      { handle: 'peaselburg', title: 'Peaselburg', tag: 'brand:peaselburg' },
      { handle: 'only-quartz', title: 'Only Quartz', tag: 'brand:only-quartz' },
      { handle: 'eo-vape', title: 'EO Vape', tag: 'brand:eo-vape' },
    ],

    // Style/feature collections (removed redundant made-in-usa-glass)
    features: [
      { handle: 'made-in-usa', title: 'Made in USA', tag: 'style:made-in-usa' },
      // REMOVED: 'made-in-usa-glass' - 90%+ overlap with made-in-usa (nearly all USA products are glass)
      { handle: 'heady-glass', title: 'Heady Glass', tag: 'style:heady' },
      { handle: 'travel-friendly', title: 'Travel Friendly', tag: 'style:travel-friendly' },
      { handle: 'gifts', title: 'Gifts', tag: 'style:gift' },
    ],

    // Additional category collections
    additionalCategories: [
      {
        handle: 'glass-pipes',
        title: 'Glass Pipes',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'material:glass' },
          { column: 'tag', relation: 'equals', condition: 'pillar:smokeshop-device' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'concentrate-jars',
        title: 'Concentrate Jars',
        // Cross-vendor: includes Oil Slick + What You Need jars
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:container' },
          { column: 'tag', relation: 'equals', condition: 'use:storage' },
        ],
        disjunctive: false,
      },
      {
        handle: 'electric-grinders',
        title: 'Electric Grinders',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:grinder' },
          { column: 'tag', relation: 'equals', condition: 'style:electric' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
      {
        handle: 'non-stick-silicone-dab-containers',
        title: 'Non-Stick Silicone Dab Containers',
        // Cross-vendor: Oil Slick core product line
        rules: [
          { column: 'tag', relation: 'equals', condition: 'material:silicone' },
          { column: 'tag', relation: 'equals', condition: 'family:container' },
        ],
        disjunctive: false,
      },
      // NEW: Glass Pendants - dedicated collection for ~20 pendant products
      {
        handle: 'glass-pendants',
        title: 'Glass Pendants',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:merch-pendant' },
          { column: 'vendor', relation: 'equals', condition: 'What You Need' },
        ],
        disjunctive: false,
      },
    ],

    // Extraction & Packaging collections (Oil Slick vendor) - already clean
    extractionCollections: [
      {
        handle: 'extraction-packaging',
        title: 'Extraction & Packaging',
        rules: [
          { column: 'vendor', relation: 'equals', condition: 'Oil Slick' },
        ],
        disjunctive: false,
      },
      {
        handle: 'fep-sheets',
        title: 'FEP Sheets & Rolls',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'material:fep' },
          { column: 'vendor', relation: 'equals', condition: 'Oil Slick' },
        ],
        disjunctive: false,
      },
      {
        handle: 'ptfe-sheets',
        title: 'PTFE Sheets & Rolls',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'material:ptfe' },
          { column: 'vendor', relation: 'equals', condition: 'Oil Slick' },
        ],
        disjunctive: false,
      },
      {
        handle: 'silicone-pads',
        title: 'Silicone Pads & Mats',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:silicone-pad' },
          { column: 'vendor', relation: 'equals', condition: 'Oil Slick' },
        ],
        disjunctive: false,
      },
      {
        handle: 'parchment-paper',
        title: 'Parchment Paper',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'material:parchment' },
          { column: 'vendor', relation: 'equals', condition: 'Oil Slick' },
        ],
        disjunctive: false,
      },
      {
        handle: 'glass-jars',
        title: 'Glass Jars',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:glass-jar' },
          { column: 'vendor', relation: 'equals', condition: 'Oil Slick' },
        ],
        disjunctive: false,
      },
      {
        handle: 'concentrate-containers',
        title: 'Concentrate Containers',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:container' },
          { column: 'vendor', relation: 'equals', condition: 'Oil Slick' },
        ],
        disjunctive: false,
      },
      {
        handle: 'mylar-bags',
        title: 'Mylar Bags',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:mylar-bag' },
          { column: 'vendor', relation: 'equals', condition: 'Oil Slick' },
        ],
        disjunctive: false,
      },
      {
        handle: 'joint-tubes',
        title: 'Joint Tubes',
        rules: [
          { column: 'tag', relation: 'equals', condition: 'family:joint-tube' },
          { column: 'vendor', relation: 'equals', condition: 'Oil Slick' },
        ],
        disjunctive: false,
      },
    ],

    // Collections to DELETE (duplicates, zombies, redundant, and size-based)
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
      // Size-based (too vague, not how customers search)
      'large-pipes-and-rigs', 'medium-pipes-and-rigs', 'small-pipes-rigs',
      // Seasonal / misc dead weight
      'spooky-haloween-sale', 'custom', 'other',
      // Cloud YHS is a vendor tag, not a browsing collection
      'cloud-yhs',
      // Merged redundant pairs (Action Plan items 2 & 7)
      'bongs',                  // Identical to bongs-water-pipes
      'rolling-papers',         // Identical to rolling-papers-cones
      'silicone-pipes',         // 4 products - consolidated into silicone-rigs-bongs
      'silicone-water-pipes',   // 2 products - consolidated into silicone-rigs-bongs
      'silicone-smoking-devices', // Superset overlap with silicone-rigs-bongs
      'made-in-usa-glass',      // 90%+ overlap with made-in-usa
    ],
  },

  // Menu structure - Restructured: core business first, full coverage, single source of truth
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
          title: 'Smoke & Vape',
          url: '/collections/smoke-and-vape',
          children: [
            { title: 'Bongs & Water Pipes', url: '/collections/bongs-water-pipes' },
            { title: 'Dab Rigs', url: '/collections/dab-rigs' },
            { title: 'Hand Pipes', url: '/collections/hand-pipes' },
            { title: 'Bubblers', url: '/collections/bubblers' },
            { title: 'Nectar Collectors', url: '/collections/nectar-collectors' },
            { title: 'One Hitters & Chillums', url: '/collections/one-hitters-chillums' },
            { title: 'Steamrollers', url: '/collections/steamrollers' },
            { title: 'Silicone Pieces', url: '/collections/silicone-rigs-bongs' },
            { title: 'Novelty & Character Pipes', url: '/collections/novelty-character-pipes' },
            { title: 'Vapes & Electronics', url: '/collections/vapes-electronics' },
            { title: 'Shop All Smoke & Vape', url: '/collections/smoke-and-vape' },
          ],
        },
        {
          title: 'Accessories',
          url: '/collections/accessories',
          children: [
            { title: 'Dab Accessories', url: '/collections/dab-accessories' },
            { title: 'Quartz Bangers', url: '/collections/quartz-bangers' },
            { title: 'Carb Caps', url: '/collections/carb-caps' },
            { title: 'Dab Tools', url: '/collections/dab-tools' },
            { title: 'Torches', url: '/collections/torches' },
            { title: 'Flower Accessories', url: '/collections/flower-accessories' },
            { title: 'Flower Bowls', url: '/collections/flower-bowls' },
            { title: 'Ash Catchers', url: '/collections/ash-catchers' },
            { title: 'Downstems', url: '/collections/downstems' },
            { title: 'Adapters & Drop Downs', url: '/collections/adapters' },
            { title: 'Ashtrays', url: '/collections/ashtrays' },
            { title: 'Grinders', url: '/collections/grinders' },
            { title: 'Rolling Papers & Cones', url: '/collections/rolling-papers-cones' },
            { title: 'Storage & Containers', url: '/collections/storage-containers' },
            { title: 'Trays & Work Surfaces', url: '/collections/trays-work-surfaces' },
            { title: 'Cleaning Supplies', url: '/collections/cleaning-supplies' },
          ],
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
            { title: '710 SCI', url: '/collections/710-sci' },
            { title: 'Scorch', url: '/collections/scorch' },
            { title: 'Peaselburg', url: '/collections/peaselburg' },
            { title: 'Only Quartz', url: '/collections/only-quartz' },
            { title: 'EO Vape', url: '/collections/eo-vape' },
          ],
        },
        {
          title: 'Featured',
          url: '#',
          children: [
            { title: 'New Arrivals', url: '/collections/new-arrivals' },
            { title: 'Best Sellers', url: '/collections/best-sellers' },
            { title: 'On Sale', url: '/collections/on-sale' },
            { title: 'Heady Glass', url: '/collections/heady-glass' },
            { title: 'Made In USA', url: '/collections/made-in-usa' },
            { title: 'Novelty & Character Pipes', url: '/collections/novelty-character-pipes' },
            { title: 'Glass Pendants', url: '/collections/glass-pendants' },
            { title: 'Pendants & Merch', url: '/collections/pendants-merch' },
            { title: 'Travel Friendly', url: '/collections/travel-friendly' },
            { title: 'Gifts', url: '/collections/gifts' },
            { title: 'Clearance', url: '/collections/clearance' },
          ],
        },
      ],
    },
    // Sidebar menu for mobile/navigation — full sub-navigation matching main menu
    sidebar: {
      title: 'Sidebar Menu',
      handle: 'sidebar-menu',
      items: [
        {
          title: 'Shop All',
          url: '/collections/all',
        },
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
            { title: 'Steamrollers', url: '/collections/steamrollers' },
            { title: 'Silicone Pieces', url: '/collections/silicone-rigs-bongs' },
            { title: 'Novelty & Character Pipes', url: '/collections/novelty-character-pipes' },
            { title: 'Vapes & Electronics', url: '/collections/vapes-electronics' },
          ],
        },
        {
          title: 'Accessories',
          url: '/collections/accessories',
          children: [
            { title: 'Dab Accessories', url: '/collections/dab-accessories' },
            { title: 'Flower Accessories', url: '/collections/flower-accessories' },
            { title: 'Quartz Bangers', url: '/collections/quartz-bangers' },
            { title: 'Carb Caps', url: '/collections/carb-caps' },
            { title: 'Dab Tools', url: '/collections/dab-tools' },
            { title: 'Flower Bowls', url: '/collections/flower-bowls' },
            { title: 'Ash Catchers', url: '/collections/ash-catchers' },
            { title: 'Downstems', url: '/collections/downstems' },
            { title: 'Torches', url: '/collections/torches' },
            { title: 'Adapters & Drop Downs', url: '/collections/adapters' },
            { title: 'Ashtrays', url: '/collections/ashtrays' },
            { title: 'Grinders', url: '/collections/grinders' },
            { title: 'Rolling Papers & Cones', url: '/collections/rolling-papers-cones' },
            { title: 'Storage & Containers', url: '/collections/storage-containers' },
            { title: 'Trays & Work Surfaces', url: '/collections/trays-work-surfaces' },
            { title: 'Cleaning Supplies', url: '/collections/cleaning-supplies' },
          ],
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
            { title: '710 SCI', url: '/collections/710-sci' },
            { title: 'Scorch', url: '/collections/scorch' },
            { title: 'Peaselburg', url: '/collections/peaselburg' },
            { title: 'Only Quartz', url: '/collections/only-quartz' },
            { title: 'EO Vape', url: '/collections/eo-vape' },
          ],
        },
        {
          title: 'Featured',
          url: '#',
          children: [
            { title: 'New Arrivals', url: '/collections/new-arrivals' },
            { title: 'Best Sellers', url: '/collections/best-sellers' },
            { title: 'On Sale', url: '/collections/on-sale' },
            { title: 'Heady Glass', url: '/collections/heady-glass' },
            { title: 'Made In USA', url: '/collections/made-in-usa' },
            { title: 'Novelty & Character Pipes', url: '/collections/novelty-character-pipes' },
            { title: 'Glass Pendants', url: '/collections/glass-pendants' },
            { title: 'Pendants & Merch', url: '/collections/pendants-merch' },
            { title: 'Travel Friendly', url: '/collections/travel-friendly' },
            { title: 'Gifts', url: '/collections/gifts' },
            { title: 'Clearance', url: '/collections/clearance' },
          ],
        },
      ],
    },
  },

  // Tags to remove (obsolete/redundant)
  // URL redirects: legacy/dead collection URLs → correct active collection URLs
  // These handle old bookmarks, external links, and SEO for deleted collections
  redirects: [
    // =====================================================
    // Legacy underscore format → correct hyphen format
    // =====================================================
    { from: '/collections/dab_rig', to: '/collections/dab-rigs' },
    { from: '/collections/hand_pipe', to: '/collections/hand-pipes' },
    { from: '/collections/quartz_banger', to: '/collections/quartz-bangers' },
    { from: '/collections/torch_tool', to: '/collections/torches' },
    { from: '/collections/water_pipe', to: '/collections/bongs-water-pipes' },

    // =====================================================
    // Redundant "-collection" suffix → clean handles
    // =====================================================
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

    // =====================================================
    // Alternate names / legacy "dabbers" variants → dab-tools
    // =====================================================
    { from: '/collections/dab-tools-dabbers', to: '/collections/dab-tools' },
    { from: '/collections/dabbers', to: '/collections/dab-tools' },

    // =====================================================
    // Numbered duplicates → primary collections
    // =====================================================
    { from: '/collections/clearance-1', to: '/collections/clearance' },
    { from: '/collections/clearance-2', to: '/collections/clearance' },
    { from: '/collections/nectar-collectors-1', to: '/collections/nectar-collectors' },
    { from: '/collections/mylar-bags-1', to: '/collections/mylar-bags' },

    // =====================================================
    // Overly specific duplicates → primary category
    // =====================================================
    { from: '/collections/dab-rigs-and-oil-rigs', to: '/collections/dab-rigs' },
    { from: '/collections/glass-bongs-and-water-pipes', to: '/collections/bongs-water-pipes' },

    // =====================================================
    // Duplicate Smoke & Vape landing pages → canonical URL
    // =====================================================
    { from: '/collections/smoke-vape', to: '/collections/smoke-and-vape' },
    { from: '/collections/smoke-shop-products', to: '/collections/smoke-and-vape' },
    { from: '/collections/all-headshop', to: '/collections/smoke-and-vape' },
    { from: '/collections/shop-all-what-you-need', to: '/collections/smoke-and-vape' },
    { from: '/collections/smoking', to: '/collections/smoke-and-vape' },
    { from: '/collections/smoking-devices', to: '/collections/smoke-and-vape' },

    // =====================================================
    // Duplicate accessory/rolling collections
    // =====================================================
    { from: '/collections/rolling-accessories', to: '/collections/rolling-papers' },
    { from: '/collections/ash-catchers-downstems', to: '/collections/ash-catchers' },
    { from: '/collections/papers', to: '/collections/rolling-papers' },
    { from: '/collections/spoons', to: '/collections/hand-pipes' },

    // =====================================================
    // Duplicate silicone collections → consolidated handle
    // =====================================================
    { from: '/collections/silicone-beaker-bongs', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/silicone-glass-hybrid-rigs-and-bubblers', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/cute-silicone-rigs', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/top-selling-silicone-rigs', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/silicone-ashtrays', to: '/collections/ashtrays' },

    // =====================================================
    // Duplicate extraction/packaging collections → canonical
    // =====================================================
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

    // =====================================================
    // Duplicate vape/misc collections
    // =====================================================
    { from: '/collections/vaporizer-parts-and-accessories', to: '/collections/vapes-electronics' },
    { from: '/collections/dabbing', to: '/collections/dab-rigs' },

    // =====================================================
    // Size-based browsing (too vague) → main landing
    // =====================================================
    { from: '/collections/large-pipes-and-rigs', to: '/collections/smoke-and-vape' },
    { from: '/collections/medium-pipes-and-rigs', to: '/collections/smoke-and-vape' },
    { from: '/collections/small-pipes-rigs', to: '/collections/smoke-and-vape' },

    // =====================================================
    // Seasonal / misc dead collections → best match
    // =====================================================
    { from: '/collections/spooky-haloween-sale', to: '/collections/clearance' },
    { from: '/collections/custom', to: '/collections/all' },
    { from: '/collections/other', to: '/collections/all' },

    // =====================================================
    // Legacy "grinder" singular → "grinders" plural
    // =====================================================
    { from: '/collections/grinder', to: '/collections/grinders' },

    // =====================================================
    // Cloud YHS vendor collection → all products
    // Cloud YHS is a vendor tag, not a browsing collection
    // =====================================================
    { from: '/collections/cloud-yhs', to: '/collections/all' },

    // =====================================================
    // Merged redundant pairs → canonical collections
    // =====================================================
    { from: '/collections/bongs', to: '/collections/bongs-water-pipes' },
    { from: '/collections/rolling-papers', to: '/collections/rolling-papers-cones' },
    { from: '/collections/silicone-pipes', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/silicone-water-pipes', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/silicone-smoking-devices', to: '/collections/silicone-rigs-bongs' },
    { from: '/collections/made-in-usa-glass', to: '/collections/made-in-usa' },

    // =====================================================
    // Wholesale/display duplicates → category collections
    // =====================================================
    { from: '/collections/wholesale-pipes', to: '/collections/hand-pipes' },
    { from: '/collections/grinders-in-retail-bulk-display', to: '/collections/grinders' },

    // =====================================================
    // Legacy browsing paths → new collections
    // =====================================================
    { from: '/collections/pendants-collection', to: '/collections/glass-pendants' },
  ],

  tagsToRemove: [
    // Legacy format tags superseded by family tags
    'format:bong', 'format:rig', 'format:pipe', 'format:bubbler',
    'format:nectar-collector', 'format:chillum', 'format:steamroller',
    'format:bowl', 'format:banger', 'format:carb-cap', 'format:dab-tool',
    'format:torch', 'format:grinder', 'format:paper', 'format:tray',
    'format:vape', 'format:pendant', 'format:ashtray', 'format:downstem',
    // Typos and malformed tags
    'famly:', 'famliy:', 'materail:', 'materal:',
  ],
};

export default config;
