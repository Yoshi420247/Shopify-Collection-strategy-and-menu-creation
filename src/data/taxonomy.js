// =============================================================================
// Product Taxonomy Data
// Extracted from config.js for reuse across tools without importing full config
// =============================================================================

export const pillars = {
  'smokeshop-device': 'Primary smoking/vaping devices',
  'accessory': 'Accessories and add-ons',
  'merch': 'Merchandise and branded items',
  'packaging': 'Packaging and storage solutions',
};

export const uses = {
  'flower-smoking': 'For smoking dry herb/flower',
  'dabbing': 'For concentrates/dabs/extracts',
  'rolling': 'For rolling papers and cones',
  'vaping': 'For vaporizers and e-devices',
  'preparation': 'For preparation (grinders, scales)',
  'storage': 'For storing products',
};

export const families = {
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
};

export const familyMaterials = {
  'glass-bong': ['glass', 'borosilicate'],
  'glass-rig': ['glass', 'borosilicate'],
  'silicone-rig': ['silicone'],
  'banger': ['quartz', 'titanium', 'ceramic'],
  'spoon-pipe': ['glass', 'silicone', 'metal', 'wood'],
  'bubbler': ['glass', 'silicone'],
};

export const materials = ['glass', 'silicone', 'quartz', 'metal', 'borosilicate', 'titanium', 'ceramic', 'wood'];

export const jointSpecs = {
  sizes: ['10mm', '14mm', '18mm'],
  genders: ['male', 'female'],
  angles: ['45', '90'],
};

export const styles = ['heady', 'made-in-usa', 'animal', 'travel-friendly', 'brand-highlight'];

export const brands = [
  'monark', 'zig-zag', 'cookies', 'maven', 'vibes', 'raw',
  'peaselburg', 'lookah', 'g-pen', 'puffco', 'elements',
  'scorch', 'only-quartz', '710-sci', 'eo-vape',
];

export const tagsToRemove = [
  // Legacy format tags superseded by family tags
  'format:bong', 'format:rig', 'format:pipe', 'format:bubbler',
  'format:nectar-collector', 'format:chillum', 'format:steamroller',
  'format:bowl', 'format:banger', 'format:carb-cap', 'format:dab-tool',
  'format:torch', 'format:grinder', 'format:paper', 'format:tray',
  'format:vape', 'format:pendant', 'format:ashtray', 'format:downstem',
  // Typos and malformed tags
  'famly:', 'famliy:', 'materail:', 'materal:',
];

// Full taxonomy object (for backwards compatibility with config.taxonomy)
export const taxonomy = {
  pillars,
  uses,
  families,
  familyMaterials,
  materials,
  jointSpecs,
  styles,
  brands,
};

export default taxonomy;
