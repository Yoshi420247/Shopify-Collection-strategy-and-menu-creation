#!/usr/bin/env node
/**
 * Fix Homepage Issues - Diagnoses and deploys homepage fixes to the live Shopify store
 *
 * Two analysis modes:
 *   1. Visual (Gemini Flash) — downloads all homepage images, fetches rendered HTML,
 *      and uses Gemini 2.0 Flash to visually inspect for issues. Works with ANY theme.
 *   2. Structural (fallback) — checks JSON settings for empty values. Fast, no API key needed.
 *
 * Usage:
 *   node src/fix-homepage.js                  # Diagnose only (structural + visual if GOOGLE_API_KEY set)
 *   node src/fix-homepage.js --execute        # Diagnose then apply known fixes
 *   node src/fix-homepage.js --visual-only    # Only run Gemini visual analysis (no fixes)
 *   node src/fix-homepage.js --skip-visual    # Skip Gemini, structural checks only
 */

import 'dotenv/config';
import { config } from './config.js';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { analyzeHomepageVisually, printReport } from './visual-homepage-analyzer.js';

const STORE_URL = config.shopify.storeUrl;
const ACCESS_TOKEN = config.shopify.accessToken;
const API_VERSION = config.shopify.apiVersion;
const THEME_ID = process.env.SHOPIFY_THEME_ID || '140853018904';

const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

const DRY_RUN = !process.argv.includes('--execute');
const VISUAL_ONLY = process.argv.includes('--visual-only');
const SKIP_VISUAL = process.argv.includes('--skip-visual');

// ─── Desired homepage section configurations ───────────────────────────────
// These are the "known good" states for sections we can auto-fix.
// The visual analyzer handles discovery of NEW issues beyond these.

const KNOWN_FIXES = {
  '1489285116594': {
    label: 'Shop By Category collection grid',
    section: {
      type: 'collection-list',
      blocks: {
        'cl-block-1': { type: 'collection', settings: { feature_collection: 'hand-pipes', image: 'shopify://shop_images/HP-69-3.5-Display-300x300_6acdada1-2332-4a59-b1f3-a912919564fc.png' } },
        'cl-block-2': { type: 'collection', settings: { feature_collection: 'bongs', image: 'shopify://shop_images/IMG_9314.2.22-300x300_88304ee8-d100-4fb8-a439-2663aeaddaaa.png' } },
        'cl-block-3': { type: 'collection', settings: { feature_collection: 'dab-rigs', image: 'shopify://shop_images/20240124_093738.25-300x300_db289371-2edc-4f15-883d-2ec39e4ff894.png' } },
        'cl-block-4': { type: 'collection', settings: { feature_collection: 'bubblers', image: 'shopify://shop_images/OMG-FWDryHammer-7.5-300x300_18c1b288-f281-422c-91cb-b02ea0ac76bc.png' } },
        'cl-block-5': { type: 'collection', settings: { feature_collection: 'rolling-papers-cones', image: 'shopify://shop_images/VIBES-x-Cookies-Cones-53mm-9-30-Display-Box-Blue-Ultra-Thin-300x300_084de0e4-2cbf-4bc1-ad99-723db177acb1.png' } },
        'cl-block-6': { type: 'collection', settings: { feature_collection: 'made-in-usa-glass', image: 'shopify://shop_images/CHV-FWR-VEN-10-300x300_4a4982ec-5c8c-4c93-a29e-e3570bfb6305.png' } },
        'cl-block-7': { type: 'collection', settings: { feature_collection: 'nectar-collectors', image: 'shopify://shop_images/silicone-nectar-collector-kit-238311.jpg' } },
        'cl-block-8': { type: 'collection', settings: { feature_collection: 'accessories', image: 'shopify://shop_images/GHQ-30-45-14-Display-300x300_4bb48a4a-9697-4d19-af0f-d44d0ab65364.png' } },
      },
      block_order: ['cl-block-1', 'cl-block-2', 'cl-block-3', 'cl-block-4', 'cl-block-5', 'cl-block-6', 'cl-block-7', 'cl-block-8'],
      settings: { title: 'Shop By Category', align_height: true, collection_height: 200, frontpage_collections_per_row: 4 }
    },
    check: (section) => {
      if (!section) return ['Section missing'];
      const blocks = section.blocks || {};
      const order = section.block_order || [];
      const issues = [];
      if (order.length === 0) issues.push('No blocks configured');
      for (const id of order) {
        const b = blocks[id];
        if (!b) { issues.push(`Block "${id}" missing`); continue; }
        if (!b.settings?.feature_collection) issues.push(`Block "${id}": empty collection → "COLLECTION TITLE" placeholder`);
        if (!b.settings?.image) issues.push(`Block "${id}": empty image → placeholder image`);
      }
      return issues;
    },
  },

  '1489283737905': {
    label: 'Featured promotions grid',
    section: {
      type: 'featured-promotions',
      blocks: {
        'promo-dab-rigs': { type: 'image', settings: { image: 'shopify://shop_images/IMG_5303.2.2-300x300_de7b49df-eee1-4aeb-a047-38e72d44f643.png', link: 'shopify://collections/dab-rigs', title: 'Dab Rigs', text: '<p>Premium glass dab rigs for the smoothest concentrate experience. From mini rigs to recyclers.</p>', button_label: 'Shop Dab Rigs' } },
        'promo-bongs': { type: 'image', settings: { image: 'shopify://shop_images/IMG_9314.2.22-300x300_88304ee8-d100-4fb8-a439-2663aeaddaaa.png', link: 'shopify://collections/bongs', title: 'Bongs & Water Pipes', text: '<p>High-quality glass bongs for flower enthusiasts. Beakers, straight tubes, and more.</p>', button_label: 'Shop Bongs' } },
        'promo-hand-pipes': { type: 'image', settings: { image: 'shopify://shop_images/HP-69-3.5-Display-300x300_6acdada1-2332-4a59-b1f3-a912919564fc.png', link: 'shopify://collections/hand-pipes', title: 'Hand Pipes', text: '<p>Portable glass spoon pipes, chillums, and one-hitters. Perfect for on-the-go.</p>', button_label: 'Shop Pipes' } },
        'promo-made-usa': { type: 'image', settings: { image: 'shopify://shop_images/CHV-FWR-VEN-10-300x300_4a4982ec-5c8c-4c93-a29e-e3570bfb6305.png', link: 'shopify://collections/made-in-usa-glass', title: 'Made in USA', text: '<p>Support American glassblowers. Premium quality, handcrafted in the USA.</p>', button_label: 'Shop USA Glass' } },
        'promo-quartz': { type: 'image', settings: { image: 'shopify://shop_images/GHQ-30-45-14-Display-300x300_4bb48a4a-9697-4d19-af0f-d44d0ab65364.png', link: 'shopify://collections/quartz-bangers', title: 'Quartz Bangers', text: '<p>Premium quartz bangers for perfect low-temp dabs. Multiple sizes and styles.</p>', button_label: 'Shop Quartz' } },
        'promo-extraction': { type: 'image', settings: { image: 'shopify://shop_images/18oz-child-resistant-glass-jars-with-black-caps-28-grams-1-ounce-capacity-airtight-and-durable-24-pack-the-ultimate-storage-solution-for-cannabis-flower-food-an-557906_abc9f373-8f50-4919-b36d-a294a802f4c8.jpg', link: 'shopify://collections/extraction-packaging', title: 'Extraction & Packaging', text: '<p>Professional-grade silicone mats, glass jars, and packaging supplies.</p>', button_label: 'Shop Extraction' } },
      },
      block_order: ['promo-dab-rigs', 'promo-bongs', 'promo-hand-pipes', 'promo-made-usa', 'promo-quartz', 'promo-extraction'],
      settings: { featured_promos_per_row: 3, featured_promos_grid: true, featured_links_animation: 'fadeInUp', feature_style: 'rounded', promo_text_on_image_enabled: true }
    },
    check: (section) => {
      if (!section) return ['Section missing'];
      const issues = [];
      for (const [id, block] of Object.entries(section.blocks || {})) {
        if (!block.settings?.image) issues.push(`Block "${id}" (${block.settings?.title || '?'}): missing image`);
        if (!block.settings?.link) issues.push(`Block "${id}" (${block.settings?.title || '?'}): missing link`);
      }
      return issues;
    },
  },

  '1489284503681': {
    label: 'Image-text feature blocks',
    section: {
      type: 'image-text',
      blocks: {
        'it-block-1': { type: 'image', settings: { image: 'shopify://shop_images/IMG_5303.2.2-300x300_de7b49df-eee1-4aeb-a047-38e72d44f643.png', image_crop: 'none', title: 'Premium Dab Rigs', text: '<p>Explore our collection of high-quality glass dab rigs. From mini rigs to recyclers, find the perfect piece for smooth, flavorful concentrates.</p>', button_label: 'Shop Dab Rigs', link: 'shopify://collections/dab-rigs', bg_color: '', text_color: '' } },
        'it-block-2': { type: 'image', settings: { image: 'shopify://shop_images/GHQ-30-45-14-Display-300x300_4bb48a4a-9697-4d19-af0f-d44d0ab65364.png', image_crop: 'none', title: 'Quartz Bangers and Accessories', text: '<p>Upgrade your setup with premium quartz bangers, carb caps, and dab tools. Quality accessories for the perfect low-temp dab.</p>', button_label: 'Shop Accessories', link: 'shopify://collections/quartz-bangers', bg_color: '', text_color: '' } },
        'it-block-3': { type: 'image', settings: { image: 'shopify://shop_images/CHV-FWR-VEN-10-300x300_4a4982ec-5c8c-4c93-a29e-e3570bfb6305.png', image_crop: 'none', title: 'Made in USA Glass', text: '<p>Support American craftsmanship with our selection of USA-made glass pieces. Handcrafted quality from domestic glassblowers.</p>', button_label: 'Shop USA Glass', link: 'shopify://collections/made-in-usa-glass', bg_color: '', text_color: '' } },
      },
      block_order: ['it-block-1', 'it-block-2', 'it-block-3'],
      settings: { frontpage_grid_style: false, featured_links_per_row: '1', frontpage_text_align: 'left', frontpage_image_position: 'left' }
    },
    check: (section) => {
      if (!section) return ['Section missing'];
      const issues = [];
      for (const [id, block] of Object.entries(section.blocks || {})) {
        if (!block.settings?.image) issues.push(`Block "${id}" (${block.settings?.title || '?'}): missing image`);
        if (!block.settings?.link) issues.push(`Block "${id}" (${block.settings?.title || '?'}): missing link`);
      }
      return issues;
    },
  },

  '1556571858712': {
    label: 'Featured: Affordable Dab Rigs',
    section: { type: 'featured-collection', settings: { title: 'Affordable Quality Dab Rigs', collection_description: false, collection: 'value-dab-rigs', collection_style: 'grid', products_per: 3, products_limit: 9 } },
    check: (s) => (!s?.settings?.collection ? ['Empty collection handle'] : []),
  },
  '1602299209890': {
    label: 'Featured: Hand Pipes',
    section: { type: 'featured-collection', settings: { title: 'Premium Hand Pipes', collection_description: false, collection: 'hand-pipes', collection_style: 'grid', products_per: 3, products_limit: 9 } },
    check: (s) => (!s?.settings?.collection ? ['Empty collection handle'] : []),
  },
  '1602299393597': {
    label: 'Featured: Made in USA Glass',
    section: { type: 'featured-collection', settings: { title: 'Made in USA Glass', collection_description: false, collection: 'made-in-usa-glass', collection_style: 'grid', products_per: 3, products_limit: 9 } },
    check: (s) => (!s?.settings?.collection ? ['Empty collection handle'] : []),
  },
  '1602299824926': {
    label: 'Featured: Everyday Essentials',
    section: { type: 'featured-collection', settings: { title: 'Everyday Essentials Under $50', collection_description: false, collection: 'everyday-essentials', collection_style: 'grid', products_per: 3, products_limit: 9 } },
    check: (s) => (!s?.settings?.collection ? ['Empty collection handle'] : []),
  },
};

// ─── API helpers ────────────────────────────────────────────────────────────

function curlRequest(url, method = 'GET', bodyFile = null) {
  let cmd = `curl -s --max-time 60 -X ${method} "${url}" `;
  cmd += `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" `;
  cmd += `-H "Content-Type: application/json" `;
  if (bodyFile) {
    cmd += `-d @${bodyFile}`;
  }
  const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(result);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== FIX HOMEPAGE ISSUES ===');
  console.log(`Store: ${STORE_URL}`);
  console.log(`Theme: ${THEME_ID}`);
  console.log(`Mode: ${VISUAL_ONLY ? 'VISUAL ANALYSIS ONLY' : DRY_RUN ? 'DRY RUN (use --execute to apply)' : 'LIVE - changes will be applied'}`);
  console.log('');

  // ── Step 1: Fetch current live theme settings ───────────────────────────
  console.log('1. Fetching current theme settings from Shopify...');
  let liveSettings;
  try {
    const response = curlRequest(
      `${BASE_URL}/themes/${THEME_ID}/assets.json?asset%5Bkey%5D=config/settings_data.json`
    );
    liveSettings = JSON.parse(response.asset.value);
    console.log('   ✓ Fetched settings_data.json from live theme');
  } catch (err) {
    console.error('   ✗ Failed to fetch live settings:', err.message);
    console.error('   Make sure SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN are set in .env');
    process.exit(1);
  }

  const sections = liveSettings.current?.sections || {};

  // ── Step 2: Visual analysis with Gemini Flash ───────────────────────────
  let visualReport = null;
  if (!SKIP_VISUAL) {
    console.log('\n2. Running visual homepage analysis (Gemini Flash)...\n');
    try {
      visualReport = await analyzeHomepageVisually(liveSettings, STORE_URL, {
        verbose: true,
        skipHtmlAnalysis: false,
      });
      printReport(visualReport);
    } catch (err) {
      console.log(`   ⚠ Visual analysis failed: ${err.message}`);
      console.log('   Falling back to structural checks only.\n');
    }
  }

  if (VISUAL_ONLY) {
    console.log('\nVisual analysis complete. Use without --visual-only to see fix options.');
    return;
  }

  // ── Step 3: Structural diagnosis + auto-fix ─────────────────────────────
  console.log(`\n${SKIP_VISUAL ? '2' : '3'}. Running structural diagnosis...\n`);

  const fixable = [];
  for (const [sectionId, fix] of Object.entries(KNOWN_FIXES)) {
    const issues = fix.check(sections[sectionId]);
    if (issues.length > 0) {
      fixable.push({ sectionId, label: fix.label, issues, section: fix.section });
      console.log(`   ✗ ${fix.label} (${sectionId}):`);
      issues.forEach(i => console.log(`     - ${i}`));
    }
  }

  const totalStructural = fixable.reduce((sum, f) => sum + f.issues.length, 0);
  const totalVisual = visualReport?.totalIssues || 0;

  if (totalStructural === 0 && totalVisual === 0) {
    console.log('   ✓ No fixable issues found! Homepage looks good.');
    return;
  }

  if (totalStructural === 0) {
    console.log('   ✓ No auto-fixable structural issues (visual issues above need manual review).');
    return;
  }

  console.log(`\n   ${totalStructural} auto-fixable structural issue(s) across ${fixable.length} section(s).`);

  if (DRY_RUN) {
    console.log('\n   DRY RUN — no changes applied. Run with --execute to fix.');
    return;
  }

  // ── Step 4: Apply fixes ─────────────────────────────────────────────────
  console.log('\n4. Applying fixes...\n');

  for (const { sectionId, label, section } of fixable) {
    liveSettings.current.sections[sectionId] = section;
    console.log(`   ✓ Fixed: ${label}`);
  }

  // Update preset copies too
  if (liveSettings.presets) {
    console.log('\n   Updating preset copies to prevent future reversion...');
    for (const [presetName, presetData] of Object.entries(liveSettings.presets)) {
      if (typeof presetData !== 'object' || !presetData.sections) continue;
      let updated = false;
      for (const { sectionId, section } of fixable) {
        if (presetData.sections[sectionId]) {
          presetData.sections[sectionId] = section;
          updated = true;
        }
      }
      if (updated) console.log(`   ✓ Updated preset "${presetName}"`);
    }
  }

  // ── Step 5: Deploy ──────────────────────────────────────────────────────
  console.log('\n5. Deploying updated settings to Shopify...');

  const requestBody = {
    asset: {
      key: 'config/settings_data.json',
      value: JSON.stringify(liveSettings)
    }
  };

  writeFileSync('/tmp/homepage_fix_request.json', JSON.stringify(requestBody));

  try {
    const updateResponse = curlRequest(
      `${BASE_URL}/themes/${THEME_ID}/assets.json`,
      'PUT',
      '/tmp/homepage_fix_request.json'
    );

    if (updateResponse.asset) {
      console.log('\n   ✓ SUCCESS! Homepage settings updated on live store.');
      console.log('\n   Sections fixed:');
      fixable.forEach(f => console.log(`   • ${f.label}`));
      console.log('\n   Verify at: https://www.oilslickpad.com');
    } else if (updateResponse.errors) {
      console.error('\n   ✗ Error:', JSON.stringify(updateResponse.errors));
      process.exit(1);
    }
  } catch (err) {
    console.error('\n   ✗ Failed to deploy:', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
