import 'dotenv/config';
import * as api from '../src/shopify-api.js';

/**
 * Comprehensive SEO Redirects
 * Based on Google Search Console data analysis
 * Creates 301 redirects from missing/deleted collection URLs to existing collections
 */

const REDIRECTS = [
  // High Priority - From Search Console data with clicks/impressions
  { from: '/collections/parchment-papers', to: '/collections/parchment-paper', clicks: 304, impressions: 17889 },
  { from: '/collections/glass-jars-extract-packaging', to: '/collections/extraction-packaging', clicks: 164, impressions: 14651 },
  { from: '/collections/silicone-glass-hybrid-rigs-and-bubblers', to: '/collections/silicone-pipes', clicks: 53, impressions: 3391 },
  { from: '/collections/cute-silicone-rigs', to: '/collections/silicone-pipes', clicks: 15, impressions: 1534 },
  { from: '/collections/extract-packaging-jars-and-nonstick', to: '/collections/extraction-packaging', clicks: 12, impressions: 10786 },
  { from: '/collections/storage-packaging', to: '/collections/extraction-packaging', clicks: 9, impressions: 882 },
  { from: '/collections/silicone-beaker-bongs', to: '/collections/silicone-pipes', clicks: 6, impressions: 1305 },
  { from: '/collections/smoke-shop-products', to: '/collections/smoke-and-vape', clicks: 5, impressions: 192 },

  // Medium Priority - Lower clicks but significant impressions
  { from: '/collections/silicone-ashtrays', to: '/collections/ashtrays', clicks: 2, impressions: 143 },
  { from: '/collections/extraction-materials-packaging', to: '/collections/extraction-packaging', clicks: 0, impressions: 457 },
  { from: '/collections/glass-bongs-and-water-pipes', to: '/collections/bongs-water-pipes', clicks: 0, impressions: 66 },
  { from: '/collections/dab-rigs-and-oil-rigs', to: '/collections/dab-rigs', clicks: 1, impressions: 165 },
  { from: '/collections/smoking', to: '/collections/smoke-and-vape', clicks: 1, impressions: 117 },

  // Size-based pipe collections
  { from: '/collections/small-pipes-rigs', to: '/collections/hand-pipes', clicks: 1, impressions: 114 },
  { from: '/collections/medium-pipes-and-rigs', to: '/collections/silicone-pipes', clicks: 9, impressions: 0 },
  { from: '/collections/large-pipes-and-rigs', to: '/collections/bongs-water-pipes', clicks: 0, impressions: 50 },

  // Extraction related
  { from: '/collections/extraction-supplies', to: '/collections/extraction-packaging', clicks: 1, impressions: 323 },

  // Collection name variations with "-collection" suffix
  { from: '/collections/grinders-collection', to: '/collections/grinders', clicks: 11, impressions: 0 },
  { from: '/collections/flower-bowls-collection', to: '/collections/flower-bowls', clicks: 10, impressions: 0 },
  { from: '/collections/carb-caps-collection', to: '/collections/carb-caps', clicks: 9, impressions: 0 },
  { from: '/collections/one-hitter-and-chillums-collection', to: '/collections/one-hitters-chillums', clicks: 15, impressions: 0 },
  { from: '/collections/dabbers-collection', to: '/collections/accessories', clicks: 34, impressions: 0 },

  // Other variations
  { from: '/collections/silicone-water-pipes', to: '/collections/silicone-pipes', clicks: 2, impressions: 2072 },
  { from: '/collections/accessories-for-extractors', to: '/collections/extraction-packaging', clicks: 0, impressions: 15 },
  { from: '/collections/nonstick-materials-for-extraction', to: '/collections/extraction-packaging', clicks: 1, impressions: 7 },
  { from: '/collections/spooky-haloween-sale', to: '/collections/silicone-pipes', clicks: 0, impressions: 48 },
  { from: '/collections/glass-jars', to: '/collections/concentrate-jars', clicks: 0, impressions: 32 },
  { from: '/collections/glass-pipes', to: '/collections/hand-pipes', clicks: 8, impressions: 0 },
  { from: '/collections/silicone-hand-pipes', to: '/collections/hand-pipes', clicks: 10, impressions: 0 },

  // Clearance variations
  { from: '/collections/clearance', to: '/collections/clearance-2', clicks: 8, impressions: 0 },

  // Custom collection redirects
  { from: '/collections/custom', to: '/collections/custom-packaging-options', clicks: 0, impressions: 55 },

  // Mylar bags variation
  { from: '/collections/mylar-bags-1', to: '/collections/mylar-bags', clicks: 1, impressions: 191 },

  // Heady glass
  { from: '/collections/heady-glass', to: '/collections/dab-rigs', clicks: 0, impressions: 14 },

  // Google collection redirect
  { from: '/collections/google-collection', to: '/collections/smoke-and-vape', clicks: 0, impressions: 0 },
  { from: '/collections/google-ads-approved', to: '/collections/smoke-and-vape', clicks: 0, impressions: 20 },

  // Torches
  { from: '/collections/torches', to: '/collections/accessories', clicks: 0, impressions: 9 },

  // Gifts
  { from: '/collections/gifts', to: '/collections/smoke-and-vape', clicks: 0, impressions: 15 },
];

async function createRedirects() {
  console.log('Creating SEO redirects from Search Console data...\n');

  // Get existing redirects to avoid duplicates
  const existingData = await api.get('redirects.json?limit=250');
  const existingPaths = new Set((existingData.redirects || []).map(r => r.path));

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const redirect of REDIRECTS) {
    if (existingPaths.has(redirect.from)) {
      console.log(`SKIP: ${redirect.from} (already exists)`);
      skipped++;
      continue;
    }

    try {
      await api.post('redirects.json', {
        redirect: {
          path: redirect.from,
          target: redirect.to
        }
      });
      console.log(`OK: ${redirect.from} -> ${redirect.to} (${redirect.clicks} clicks, ${redirect.impressions} impressions)`);
      created++;
    } catch (err) {
      console.log(`FAIL: ${redirect.from} - ${err.message}`);
      failed++;
    }
  }

  console.log(`\n=== SUMMARY ===`);
  console.log(`Created: ${created}`);
  console.log(`Skipped (existing): ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total attempted: ${REDIRECTS.length}`);

  // Calculate traffic recovery potential
  const totalClicks = REDIRECTS.reduce((sum, r) => sum + r.clicks, 0);
  const totalImpressions = REDIRECTS.reduce((sum, r) => sum + r.impressions, 0);
  console.log(`\nTraffic Recovery Potential:`);
  console.log(`  Clicks preserved: ${totalClicks}`);
  console.log(`  Impressions preserved: ${totalImpressions}`);
}

createRedirects();
