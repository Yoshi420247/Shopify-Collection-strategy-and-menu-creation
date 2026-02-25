#!/usr/bin/env node
/**
 * Fix Homepage Issues - Deploys corrected homepage settings to the live Shopify store
 *
 * Fixes:
 * 1. "COLLECTION TITLE" placeholder text in Shop by Category section
 *    (caused by empty feature_collection values in collection-list blocks)
 * 2. Missing/placeholder images in collection grid and featured sections
 * 3. Ensures all homepage sections have correct collection handles and product images
 *
 * Usage:
 *   node src/fix-homepage.js              # Dry run - show what would change
 *   node src/fix-homepage.js --execute    # Apply changes to live store
 */

import 'dotenv/config';
import { config } from './config.js';
import { execSync } from 'child_process';

const STORE_URL = config.shopify.storeUrl;
const ACCESS_TOKEN = config.shopify.accessToken;
const API_VERSION = config.shopify.apiVersion;
const THEME_ID = process.env.SHOPIFY_THEME_ID || '140853018904';

const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

const DRY_RUN = !process.argv.includes('--execute');

// ─── Desired homepage section configurations ───────────────────────────────

const COLLECTION_LIST_SECTION = {
  type: 'collection-list',
  blocks: {
    'cl-block-1': {
      type: 'collection',
      settings: {
        feature_collection: 'hand-pipes',
        image: 'shopify://shop_images/HP-69-3.5-Display-300x300_6acdada1-2332-4a59-b1f3-a912919564fc.png'
      }
    },
    'cl-block-2': {
      type: 'collection',
      settings: {
        feature_collection: 'bongs',
        image: 'shopify://shop_images/IMG_9314.2.22-300x300_88304ee8-d100-4fb8-a439-2663aeaddaaa.png'
      }
    },
    'cl-block-3': {
      type: 'collection',
      settings: {
        feature_collection: 'dab-rigs',
        image: 'shopify://shop_images/20240124_093738.25-300x300_db289371-2edc-4f15-883d-2ec39e4ff894.png'
      }
    },
    'cl-block-4': {
      type: 'collection',
      settings: {
        feature_collection: 'bubblers',
        image: 'shopify://shop_images/OMG-FWDryHammer-7.5-300x300_18c1b288-f281-422c-91cb-b02ea0ac76bc.png'
      }
    },
    'cl-block-5': {
      type: 'collection',
      settings: {
        feature_collection: 'rolling-papers-cones',
        image: 'shopify://shop_images/VIBES-x-Cookies-Cones-53mm-9-30-Display-Box-Blue-Ultra-Thin-300x300_084de0e4-2cbf-4bc1-ad99-723db177acb1.png'
      }
    },
    'cl-block-6': {
      type: 'collection',
      settings: {
        feature_collection: 'made-in-usa-glass',
        image: 'shopify://shop_images/CHV-FWR-VEN-10-300x300_4a4982ec-5c8c-4c93-a29e-e3570bfb6305.png'
      }
    },
    'cl-block-7': {
      type: 'collection',
      settings: {
        feature_collection: 'nectar-collectors',
        image: 'shopify://shop_images/silicone-nectar-collector-kit-238311.jpg'
      }
    },
    'cl-block-8': {
      type: 'collection',
      settings: {
        feature_collection: 'accessories',
        image: 'shopify://shop_images/GHQ-30-45-14-Display-300x300_4bb48a4a-9697-4d19-af0f-d44d0ab65364.png'
      }
    }
  },
  block_order: [
    'cl-block-1', 'cl-block-2', 'cl-block-3', 'cl-block-4',
    'cl-block-5', 'cl-block-6', 'cl-block-7', 'cl-block-8'
  ],
  settings: {
    title: 'Shop By Category',
    align_height: true,
    collection_height: 200,
    frontpage_collections_per_row: 4
  }
};

const FEATURED_PROMOTIONS_SECTION = {
  type: 'featured-promotions',
  blocks: {
    'promo-dab-rigs': {
      type: 'image',
      settings: {
        image: 'shopify://shop_images/IMG_5303.2.2-300x300_de7b49df-eee1-4aeb-a047-38e72d44f643.png',
        link: 'shopify://collections/dab-rigs',
        title: 'Dab Rigs',
        text: '<p>Premium glass dab rigs for the smoothest concentrate experience. From mini rigs to recyclers.</p>',
        button_label: 'Shop Dab Rigs'
      }
    },
    'promo-bongs': {
      type: 'image',
      settings: {
        image: 'shopify://shop_images/IMG_9314.2.22-300x300_88304ee8-d100-4fb8-a439-2663aeaddaaa.png',
        link: 'shopify://collections/bongs',
        title: 'Bongs & Water Pipes',
        text: '<p>High-quality glass bongs for flower enthusiasts. Beakers, straight tubes, and more.</p>',
        button_label: 'Shop Bongs'
      }
    },
    'promo-hand-pipes': {
      type: 'image',
      settings: {
        image: 'shopify://shop_images/HP-69-3.5-Display-300x300_6acdada1-2332-4a59-b1f3-a912919564fc.png',
        link: 'shopify://collections/hand-pipes',
        title: 'Hand Pipes',
        text: '<p>Portable glass spoon pipes, chillums, and one-hitters. Perfect for on-the-go.</p>',
        button_label: 'Shop Pipes'
      }
    },
    'promo-made-usa': {
      type: 'image',
      settings: {
        image: 'shopify://shop_images/CHV-FWR-VEN-10-300x300_4a4982ec-5c8c-4c93-a29e-e3570bfb6305.png',
        link: 'shopify://collections/made-in-usa-glass',
        title: 'Made in USA',
        text: '<p>Support American glassblowers. Premium quality, handcrafted in the USA.</p>',
        button_label: 'Shop USA Glass'
      }
    },
    'promo-quartz': {
      type: 'image',
      settings: {
        image: 'shopify://shop_images/GHQ-30-45-14-Display-300x300_4bb48a4a-9697-4d19-af0f-d44d0ab65364.png',
        link: 'shopify://collections/quartz-bangers',
        title: 'Quartz Bangers',
        text: '<p>Premium quartz bangers for perfect low-temp dabs. Multiple sizes and styles.</p>',
        button_label: 'Shop Quartz'
      }
    },
    'promo-extraction': {
      type: 'image',
      settings: {
        image: 'shopify://shop_images/18oz-child-resistant-glass-jars-with-black-caps-28-grams-1-ounce-capacity-airtight-and-durable-24-pack-the-ultimate-storage-solution-for-cannabis-flower-food-an-557906_abc9f373-8f50-4919-b36d-a294a802f4c8.jpg',
        link: 'shopify://collections/extraction-packaging',
        title: 'Extraction & Packaging',
        text: '<p>Professional-grade silicone mats, glass jars, and packaging supplies.</p>',
        button_label: 'Shop Extraction'
      }
    }
  },
  block_order: [
    'promo-dab-rigs', 'promo-bongs', 'promo-hand-pipes',
    'promo-made-usa', 'promo-quartz', 'promo-extraction'
  ],
  settings: {
    featured_promos_per_row: 3,
    featured_promos_grid: true,
    featured_links_animation: 'fadeInUp',
    feature_style: 'rounded',
    promo_text_on_image_enabled: true
  }
};

const IMAGE_TEXT_SECTION = {
  type: 'image-text',
  blocks: {
    'it-block-1': {
      type: 'image',
      settings: {
        image: 'shopify://shop_images/IMG_5303.2.2-300x300_de7b49df-eee1-4aeb-a047-38e72d44f643.png',
        image_crop: 'none',
        title: 'Premium Dab Rigs',
        text: '<p>Explore our collection of high-quality glass dab rigs. From mini rigs to recyclers, find the perfect piece for smooth, flavorful concentrates.</p>',
        button_label: 'Shop Dab Rigs',
        link: 'shopify://collections/dab-rigs',
        bg_color: '',
        text_color: ''
      }
    },
    'it-block-2': {
      type: 'image',
      settings: {
        image: 'shopify://shop_images/GHQ-30-45-14-Display-300x300_4bb48a4a-9697-4d19-af0f-d44d0ab65364.png',
        image_crop: 'none',
        title: 'Quartz Bangers and Accessories',
        text: '<p>Upgrade your setup with premium quartz bangers, carb caps, and dab tools. Quality accessories for the perfect low-temp dab.</p>',
        button_label: 'Shop Accessories',
        link: 'shopify://collections/quartz-bangers',
        bg_color: '',
        text_color: ''
      }
    },
    'it-block-3': {
      type: 'image',
      settings: {
        image: 'shopify://shop_images/CHV-FWR-VEN-10-300x300_4a4982ec-5c8c-4c93-a29e-e3570bfb6305.png',
        image_crop: 'none',
        title: 'Made in USA Glass',
        text: '<p>Support American craftsmanship with our selection of USA-made glass pieces. Handcrafted quality from domestic glassblowers.</p>',
        button_label: 'Shop USA Glass',
        link: 'shopify://collections/made-in-usa-glass',
        bg_color: '',
        text_color: ''
      }
    }
  },
  block_order: ['it-block-1', 'it-block-2', 'it-block-3'],
  settings: {
    frontpage_grid_style: false,
    featured_links_per_row: '1',
    frontpage_text_align: 'left',
    frontpage_image_position: 'left'
  }
};

const FEATURED_COLLECTIONS = {
  '1556571858712': {
    type: 'featured-collection',
    settings: {
      title: 'Affordable Quality Dab Rigs',
      collection_description: false,
      collection: 'value-dab-rigs',
      collection_style: 'grid',
      products_per: 3,
      products_limit: 9
    }
  },
  '1602299209890': {
    type: 'featured-collection',
    settings: {
      title: 'Premium Hand Pipes',
      collection_description: false,
      collection: 'hand-pipes',
      collection_style: 'grid',
      products_per: 3,
      products_limit: 9
    }
  },
  '1602299393597': {
    type: 'featured-collection',
    settings: {
      title: 'Made in USA Glass',
      collection_description: false,
      collection: 'made-in-usa-glass',
      collection_style: 'grid',
      products_per: 3,
      products_limit: 9
    }
  },
  '1602299824926': {
    type: 'featured-collection',
    settings: {
      title: 'Everyday Essentials Under $50',
      collection_description: false,
      collection: 'everyday-essentials',
      collection_style: 'grid',
      products_per: 3,
      products_limit: 9
    }
  }
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

function sleep(ms) {
  execSync(`sleep ${ms / 1000}`);
}

// ─── Diagnosis helpers ──────────────────────────────────────────────────────

function diagnoseCollectionList(section) {
  const issues = [];
  if (!section) {
    issues.push('Section 1489285116594 (Shop By Category) is MISSING from theme settings');
    return issues;
  }

  const blocks = section.blocks || {};
  const blockOrder = section.block_order || [];

  if (blockOrder.length === 0) {
    issues.push('Collection list has no blocks configured (empty grid)');
    return issues;
  }

  for (const blockId of blockOrder) {
    const block = blocks[blockId];
    if (!block) {
      issues.push(`Block "${blockId}" is in block_order but not defined in blocks`);
      continue;
    }
    const settings = block.settings || {};
    if (!settings.feature_collection || settings.feature_collection === '') {
      issues.push(`Block "${blockId}": empty feature_collection → shows "COLLECTION TITLE" placeholder`);
    }
    if (!settings.image || settings.image === '') {
      issues.push(`Block "${blockId}": empty image → shows placeholder image`);
    }
  }

  if (section.settings?.title !== 'Shop By Category') {
    issues.push(`Section title is "${section.settings?.title}" instead of "Shop By Category"`);
  }

  return issues;
}

function diagnoseFeaturedCollections(sections) {
  const issues = [];
  for (const [sectionId, desired] of Object.entries(FEATURED_COLLECTIONS)) {
    const live = sections[sectionId];
    if (!live) {
      issues.push(`Featured collection section ${sectionId} (${desired.settings.title}) is MISSING`);
      continue;
    }
    if (!live.settings?.collection || live.settings.collection === '') {
      issues.push(`Section ${sectionId} (${desired.settings.title}): empty collection handle`);
    }
  }
  return issues;
}

function diagnosePromotions(section) {
  const issues = [];
  if (!section) {
    issues.push('Featured promotions section 1489283737905 is MISSING');
    return issues;
  }

  const blocks = section.blocks || {};
  for (const [blockId, block] of Object.entries(blocks)) {
    const settings = block.settings || {};
    if (!settings.image || settings.image === '') {
      issues.push(`Promotions block "${blockId}" (${settings.title || 'untitled'}): missing image`);
    }
    if (!settings.link || settings.link === '') {
      issues.push(`Promotions block "${blockId}" (${settings.title || 'untitled'}): missing link`);
    }
  }
  return issues;
}

function diagnoseImageText(section) {
  const issues = [];
  if (!section) {
    issues.push('Image-text section 1489284503681 is MISSING');
    return issues;
  }

  const blocks = section.blocks || {};
  for (const [blockId, block] of Object.entries(blocks)) {
    const settings = block.settings || {};
    if (!settings.image || settings.image === '') {
      issues.push(`Image-text block "${blockId}" (${settings.title || 'untitled'}): missing image`);
    }
    if (!settings.link || settings.link === '') {
      issues.push(`Image-text block "${blockId}" (${settings.title || 'untitled'}): missing link`);
    }
  }
  return issues;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== FIX HOMEPAGE ISSUES ===');
  console.log(`Store: ${STORE_URL}`);
  console.log(`Theme: ${THEME_ID}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (use --execute to apply)' : 'LIVE - changes will be applied'}`);
  console.log('');

  // Step 1: Fetch current live theme settings
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
  let changesMade = false;

  // Step 2: Diagnose issues
  console.log('\n2. Diagnosing homepage issues...\n');

  const clIssues = diagnoseCollectionList(sections['1489285116594']);
  const fcIssues = diagnoseFeaturedCollections(sections);
  const promoIssues = diagnosePromotions(sections['1489283737905']);
  const itIssues = diagnoseImageText(sections['1489284503681']);

  const allIssues = [...clIssues, ...fcIssues, ...promoIssues, ...itIssues];

  if (allIssues.length === 0) {
    console.log('   ✓ No issues found! Homepage sections are correctly configured.');
    console.log('\n   All collection blocks have valid handles and images.');
    console.log('   No "COLLECTION TITLE" placeholder text should appear.');
    return;
  }

  console.log(`   Found ${allIssues.length} issue(s):\n`);
  allIssues.forEach((issue, i) => console.log(`   ${i + 1}. ${issue}`));

  // Step 3: Apply fixes
  console.log('\n3. Applying fixes...\n');

  // Fix collection-list section (Shop by Category)
  if (clIssues.length > 0) {
    console.log('   → Fixing "Shop By Category" collection grid...');
    liveSettings.current.sections['1489285116594'] = COLLECTION_LIST_SECTION;
    console.log('     ✓ Set 8 collection blocks with valid handles and product images');
    changesMade = true;
  }

  // Fix featured collection sections
  if (fcIssues.length > 0) {
    console.log('   → Fixing featured collection sections...');
    for (const [sectionId, desired] of Object.entries(FEATURED_COLLECTIONS)) {
      liveSettings.current.sections[sectionId] = desired;
      console.log(`     ✓ ${desired.settings.title} → ${desired.settings.collection}`);
    }
    changesMade = true;
  }

  // Fix featured promotions
  if (promoIssues.length > 0) {
    console.log('   → Fixing featured promotions grid...');
    liveSettings.current.sections['1489283737905'] = FEATURED_PROMOTIONS_SECTION;
    console.log('     ✓ Set 6 promo blocks with product images and collection links');
    changesMade = true;
  }

  // Fix image-text blocks
  if (itIssues.length > 0) {
    console.log('   → Fixing image-text feature blocks...');
    liveSettings.current.sections['1489284503681'] = IMAGE_TEXT_SECTION;
    console.log('     ✓ Set 3 image-text blocks (Dab Rigs, Quartz Bangers, Made in USA)');
    changesMade = true;
  }

  // Also fix preset copies to prevent reversion
  if (changesMade && liveSettings.presets) {
    console.log('\n   → Updating preset copies to prevent future reversion...');
    for (const [presetName, presetData] of Object.entries(liveSettings.presets)) {
      if (typeof presetData === 'object' && presetData.sections) {
        if (presetData.sections['1489285116594']) {
          presetData.sections['1489285116594'] = COLLECTION_LIST_SECTION;
        }
        if (presetData.sections['1489283737905']) {
          presetData.sections['1489283737905'] = FEATURED_PROMOTIONS_SECTION;
        }
        if (presetData.sections['1489284503681']) {
          presetData.sections['1489284503681'] = IMAGE_TEXT_SECTION;
        }
        for (const [sectionId, desired] of Object.entries(FEATURED_COLLECTIONS)) {
          if (presetData.sections[sectionId]) {
            presetData.sections[sectionId] = desired;
          }
        }
        console.log(`     ✓ Updated preset "${presetName}"`);
      }
    }
  }

  if (!changesMade) {
    console.log('\n   No changes needed.');
    return;
  }

  // Step 4: Deploy
  if (DRY_RUN) {
    console.log('\n4. DRY RUN - changes NOT applied.');
    console.log('   Run with --execute to push changes to the live store.');
    return;
  }

  console.log('\n4. Deploying updated settings to Shopify...');

  const { writeFileSync } = await import('fs');
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
      console.log('\n   Changes applied:');
      if (clIssues.length > 0) console.log('   • "Shop By Category" grid: 8 collections with product images');
      if (fcIssues.length > 0) console.log('   • Featured collections: Dab Rigs, Hand Pipes, Made in USA, Essentials');
      if (promoIssues.length > 0) console.log('   • Promotions grid: 6 category promo blocks');
      if (itIssues.length > 0) console.log('   • Image-text blocks: 3 feature blocks with product images');
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
