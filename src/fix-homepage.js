#!/usr/bin/env node
/**
 * Fix Homepage Issues — Agentic Shopify homepage repair
 *
 * Acts like a human web designer: investigates the live site, identifies root causes,
 * applies fixes at the correct level (theme settings, collection objects, or section templates),
 * then verifies the result by re-checking the live page.
 *
 * Agentic loop: investigate → diagnose → fix → verify → retry if needed
 *
 * Usage:
 *   node src/fix-homepage.js                  # Diagnose only (no changes)
 *   node src/fix-homepage.js --execute        # Diagnose, fix, and verify
 *   node src/fix-homepage.js --visual-only    # Only run Gemini visual analysis
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
const STOREFRONT_URL = `https://${STORE_URL.replace('.myshopify.com', '.com')}`;

const DRY_RUN = !process.argv.includes('--execute');
const VISUAL_ONLY = process.argv.includes('--visual-only');
const SKIP_VISUAL = process.argv.includes('--skip-visual');

// ─── Desired block configurations for Shop By Category grid ─────────────────
// Each block maps a Shopify collection handle to a product image.
// NOTE: The theme renders {{ collection.title }} from the collection object,
// NOT block.settings.title (which Shopify strips since the schema doesn't define it).
// The handle MUST resolve to an existing Shopify collection or the theme falls back
// to the "Collection title" onboarding placeholder.
const CATEGORY_BLOCKS = {
  'cl-block-1': { feature_collection: 'hand-pipes', image: 'shopify://shop_images/HP-69-3.5-Display-300x300_6acdada1-2332-4a59-b1f3-a912919564fc.png' },
  'cl-block-2': { feature_collection: 'bongs', image: 'shopify://shop_images/IMG_9314.2.22-300x300_88304ee8-d100-4fb8-a439-2663aeaddaaa.png' },
  'cl-block-3': { feature_collection: 'dab-rigs', image: 'shopify://shop_images/20240124_093738.25-300x300_db289371-2edc-4f15-883d-2ec39e4ff894.png' },
  'cl-block-4': { feature_collection: 'bubblers', image: 'shopify://shop_images/OMG-FWDryHammer-7.5-300x300_18c1b288-f281-422c-91cb-b02ea0ac76bc.png' },
  'cl-block-5': { feature_collection: 'rolling-papers-cones', image: 'shopify://shop_images/VIBES-x-Cookies-Cones-53mm-9-30-Display-Box-Blue-Ultra-Thin-300x300_084de0e4-2cbf-4bc1-ad99-723db177acb1.png' },
  'cl-block-6': { feature_collection: 'made-in-usa-glass', image: 'shopify://shop_images/CHV-FWR-VEN-10-300x300_4a4982ec-5c8c-4c93-a29e-e3570bfb6305.png' },
  'cl-block-7': { feature_collection: 'nectar-collectors', image: 'shopify://shop_images/silicone-nectar-collector-kit-238311.jpg' },
  'cl-block-8': { feature_collection: 'accessories', image: 'shopify://shop_images/GHQ-30-45-14-Display-300x300_4bb48a4a-9697-4d19-af0f-d44d0ab65364.png' },
};

// Featured collection sections (section ID → collection handle + title)
const FEATURED_SECTIONS = {
  '1556571858712': { collection: 'value-dab-rigs', title: 'Affordable Quality Dab Rigs' },
  '1602299209890': { collection: 'hand-pipes', title: 'Premium Hand Pipes' },
  '1602299393597': { collection: 'made-in-usa-glass', title: 'Made in USA Glass' },
  '1602299824926': { collection: 'everyday-essentials', title: 'Everyday Essentials Under $50' },
  'extraction_essentials': { collection: 'extraction-packaging', title: 'Top Packaging & Extraction Supplies' },
  'glass_jars_featured': { collection: 'glass-jars', title: 'Glass Jars & Containers' },
};

// Promotion blocks
const PROMO_BLOCKS = {
  'promo-dab-rigs': { image: 'shopify://shop_images/IMG_5303.2.2-300x300_de7b49df-eee1-4aeb-a047-38e72d44f643.png', link: 'shopify://collections/dab-rigs', title: 'Dab Rigs', text: '<p>Premium glass dab rigs for the smoothest concentrate experience. From mini rigs to recyclers.</p>', button_label: 'Shop Dab Rigs' },
  'promo-bongs': { image: 'shopify://shop_images/IMG_9314.2.22-300x300_88304ee8-d100-4fb8-a439-2663aeaddaaa.png', link: 'shopify://collections/bongs', title: 'Bongs & Water Pipes', text: '<p>High-quality glass bongs for flower enthusiasts. Beakers, straight tubes, and more.</p>', button_label: 'Shop Bongs' },
  'promo-hand-pipes': { image: 'shopify://shop_images/HP-69-3.5-Display-300x300_6acdada1-2332-4a59-b1f3-a912919564fc.png', link: 'shopify://collections/hand-pipes', title: 'Hand Pipes', text: '<p>Portable glass spoon pipes, chillums, and one-hitters. Perfect for on-the-go.</p>', button_label: 'Shop Pipes' },
  'promo-made-usa': { image: 'shopify://shop_images/CHV-FWR-VEN-10-300x300_4a4982ec-5c8c-4c93-a29e-e3570bfb6305.png', link: 'shopify://collections/made-in-usa-glass', title: 'Made in USA', text: '<p>Support American glassblowers. Premium quality, handcrafted in the USA.</p>', button_label: 'Shop USA Glass' },
  'promo-quartz': { image: 'shopify://shop_images/GHQ-30-45-14-Display-300x300_4bb48a4a-9697-4d19-af0f-d44d0ab65364.png', link: 'shopify://collections/quartz-bangers', title: 'Quartz Bangers', text: '<p>Premium quartz bangers for perfect low-temp dabs. Multiple sizes and styles.</p>', button_label: 'Shop Quartz' },
  'promo-extraction': { image: 'shopify://shop_images/18oz-child-resistant-glass-jars-with-black-caps-28-grams-1-ounce-capacity-airtight-and-durable-24-pack-the-ultimate-storage-solution-for-cannabis-flower-food-an-557906_abc9f373-8f50-4919-b36d-a294a802f4c8.jpg', link: 'shopify://collections/extraction-packaging', title: 'Extraction & Packaging', text: '<p>Professional-grade silicone mats, glass jars, and packaging supplies.</p>', button_label: 'Shop Extraction' },
};

// Image-text blocks
const IMAGE_TEXT_BLOCKS = {
  'it-block-1': { image: 'shopify://shop_images/IMG_5303.2.2-300x300_de7b49df-eee1-4aeb-a047-38e72d44f643.png', image_crop: 'none', title: 'Premium Dab Rigs', text: '<p>Explore our collection of high-quality glass dab rigs. From mini rigs to recyclers, find the perfect piece for smooth, flavorful concentrates.</p>', button_label: 'Shop Dab Rigs', link: 'shopify://collections/dab-rigs', bg_color: '', text_color: '' },
  'it-block-2': { image: 'shopify://shop_images/GHQ-30-45-14-Display-300x300_4bb48a4a-9697-4d19-af0f-d44d0ab65364.png', image_crop: 'none', title: 'Quartz Bangers and Accessories', text: '<p>Upgrade your setup with premium quartz bangers, carb caps, and dab tools. Quality accessories for the perfect low-temp dab.</p>', button_label: 'Shop Accessories', link: 'shopify://collections/quartz-bangers', bg_color: '', text_color: '' },
  'it-block-3': { image: 'shopify://shop_images/CHV-FWR-VEN-10-300x300_4a4982ec-5c8c-4c93-a29e-e3570bfb6305.png', image_crop: 'none', title: 'Made in USA Glass', text: '<p>Support American craftsmanship with our selection of USA-made glass pieces. Handcrafted quality from domestic glassblowers.</p>', button_label: 'Shop USA Glass', link: 'shopify://collections/made-in-usa-glass', bg_color: '', text_color: '' },
};

// ─── API helpers ────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function shopifyRest(url, method = 'GET', bodyFile = null) {
  let cmd = `curl -s --max-time 60 -X ${method} "${url}" `;
  cmd += `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" `;
  cmd += `-H "Content-Type: application/json" `;
  if (bodyFile) cmd += `-d @${bodyFile}`;
  const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(result);
}

function fetchThemeAsset(key) {
  return shopifyRest(`${BASE_URL}/themes/${THEME_ID}/assets.json?asset%5Bkey%5D=${encodeURIComponent(key)}`);
}

function putThemeAsset(key, value) {
  const body = { asset: { key, value: typeof value === 'string' ? value : JSON.stringify(value) } };
  writeFileSync('/tmp/shopify_asset_put.json', JSON.stringify(body));
  return shopifyRest(`${BASE_URL}/themes/${THEME_ID}/assets.json`, 'PUT', '/tmp/shopify_asset_put.json');
}

async function fetchHomepageHtml() {
  for (const url of [STOREFRONT_URL, `https://${STORE_URL}`]) {
    try {
      const resp = await fetch(url, {
        signal: AbortSignal.timeout(30000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HomepageBot/2.0)' },
      });
      if (resp.ok) return await resp.text();
    } catch {}
  }
  return null;
}

function countPlaceholders(html) {
  if (!html) return { total: 0, patterns: {} };
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  const patterns = {
    'COLLECTION TITLE': (stripped.match(/COLLECTION TITLE/g) || []).length,
    'Collection title': (stripped.match(/Collection title/g) || []).length,
    'Subheading': (stripped.match(/\bSubheading\b/g) || []).length,
    'Your text': (stripped.match(/Your text/gi) || []).length,
    'Add description': (stripped.match(/Add description/gi) || []).length,
    'Lorem ipsum': (stripped.match(/Lorem ipsum/gi) || []).length,
  };

  const total = Object.values(patterns).reduce((a, b) => a + b, 0);
  return { total, patterns };
}

// ─── Investigation helpers ──────────────────────────────────────────────────

function deepDiff(live, desired, path = '') {
  const diffs = [];
  if (typeof desired !== 'object' || desired === null) {
    if (live !== desired) {
      diffs.push({ path, live, desired });
    }
    return diffs;
  }

  for (const key of Object.keys(desired)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (!(key in (live || {}))) {
      diffs.push({ path: fullPath, live: undefined, desired: desired[key] });
    } else {
      diffs.push(...deepDiff(live[key], desired[key], fullPath));
    }
  }
  return diffs;
}

// ─── Collection handle resolver ─────────────────────────────────────────────

/**
 * Fetch ALL collections from Shopify and build a handle → title map.
 * Then resolve any desired handles that don't exist by fuzzy-matching against
 * actual collection handles/titles.
 */
async function fetchAllCollections() {
  const all = [];
  // Fetch custom collections (paginated)
  let page_info = '';
  for (let i = 0; i < 10; i++) {
    const url = page_info
      ? `${BASE_URL}/custom_collections.json?limit=250&page_info=${page_info}`
      : `${BASE_URL}/custom_collections.json?limit=250`;
    try {
      const resp = shopifyRest(url);
      all.push(...(resp.custom_collections || []));
      if ((resp.custom_collections || []).length < 250) break;
    } catch { break; }
  }
  // Fetch smart collections
  for (let i = 0; i < 10; i++) {
    const url = page_info
      ? `${BASE_URL}/smart_collections.json?limit=250&page_info=${page_info}`
      : `${BASE_URL}/smart_collections.json?limit=250`;
    try {
      const resp = shopifyRest(url);
      all.push(...(resp.smart_collections || []));
      if ((resp.smart_collections || []).length < 250) break;
    } catch { break; }
  }
  return all;
}

/**
 * Given a desired handle that doesn't exist, find the best matching real collection.
 * Uses substring matching and Levenshtein-like scoring.
 */
function findBestMatch(desiredHandle, allCollections) {
  const desired = desiredHandle.toLowerCase().replace(/-/g, ' ');
  const desiredWords = desired.split(' ');

  let bestMatch = null;
  let bestScore = 0;

  for (const col of allCollections) {
    const handle = (col.handle || '').toLowerCase();
    const title = (col.title || '').toLowerCase();

    // Exact handle match
    if (handle === desiredHandle) return { collection: col, score: 100, reason: 'exact handle match' };

    // Score based on word overlap
    let score = 0;
    for (const word of desiredWords) {
      if (word.length < 3) continue; // skip tiny words
      if (handle.includes(word)) score += 30;
      if (title.includes(word)) score += 20;
    }

    // Bonus for handle similarity
    if (handle.includes(desiredHandle) || desiredHandle.includes(handle)) score += 25;

    // Bonus for containing key category words
    const handleWords = handle.split('-');
    for (const word of handleWords) {
      if (desiredWords.includes(word)) score += 15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = { collection: col, score, reason: `fuzzy match (score: ${score})` };
    }
  }

  return bestMatch;
}

// ─── Main agentic flow ─────────────────────────────────────────────────────

async function main() {
  console.log('=== AGENTIC HOMEPAGE FIXER ===');
  console.log(`Store: ${STORE_URL}`);
  console.log(`Theme: ${THEME_ID}`);
  console.log(`Mode: ${VISUAL_ONLY ? 'VISUAL ANALYSIS ONLY' : DRY_RUN ? 'DRY RUN (use --execute to apply)' : 'LIVE — will fix and verify'}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: INVESTIGATE — understand what's actually on the live site
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  PHASE 1: INVESTIGATE                           ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // 1a. Fetch live theme settings
  console.log('1a. Fetching live theme settings...');
  let liveSettings;
  try {
    const response = fetchThemeAsset('config/settings_data.json');
    liveSettings = JSON.parse(response.asset.value);
    console.log('    ✓ Got settings_data.json\n');
  } catch (err) {
    console.error('    ✗ Failed:', err.message);
    process.exit(1);
  }

  const sections = liveSettings.current?.sections || {};

  // 1b. Read the collection-list section template to understand what variables it uses
  console.log('1b. Reading theme section template (collection-list)...');
  let sectionTemplate = null;
  try {
    const resp = fetchThemeAsset('sections/collection-list.liquid');
    sectionTemplate = resp.asset?.value || null;
    if (sectionTemplate) {
      console.log('    ✓ Got collection-list.liquid');
      // Extract what Liquid variables control the title display
      const titleVars = sectionTemplate.match(/\{\{[^}]*title[^}]*\}\}/g) || [];
      const collectionVars = sectionTemplate.match(/\{\{[^}]*collection[^}]*\}\}/g) || [];
      console.log(`    Title variables in template: ${titleVars.length > 0 ? titleVars.join(', ') : '(none found)'}`);
      console.log(`    Collection variables: ${collectionVars.length > 0 ? collectionVars.slice(0, 5).join(', ') : '(none found)'}`);

      // Check if the template uses block.settings.title or falls back to collection.title
      const usesBlockTitle = sectionTemplate.includes('block.settings.title');
      const usesCollectionTitle = sectionTemplate.includes('collection.title');
      const usesFeatureCollection = sectionTemplate.includes('feature_collection');
      console.log(`    Uses block.settings.title: ${usesBlockTitle}`);
      console.log(`    Uses collection.title: ${usesCollectionTitle}`);
      console.log(`    Uses feature_collection: ${usesFeatureCollection}`);
    }
  } catch {
    console.log('    ⚠ Could not fetch section template (may need different path)');
    // Try alternate paths
    for (const altPath of ['sections/list-collections-template.liquid', 'sections/featured-collections.liquid']) {
      try {
        const resp = fetchThemeAsset(altPath);
        sectionTemplate = resp.asset?.value || null;
        if (sectionTemplate) {
          console.log(`    ✓ Found at ${altPath}`);
          break;
        }
      } catch {}
    }
  }

  // 1c. Fetch the live homepage HTML to see actual placeholder text
  console.log('\n1c. Fetching live homepage HTML...');
  const initialHtml = await fetchHomepageHtml();
  const initialPlaceholders = countPlaceholders(initialHtml);
  if (initialPlaceholders.total > 0) {
    console.log(`    ⚠ Found ${initialPlaceholders.total} placeholder(s) on live site:`);
    for (const [pat, count] of Object.entries(initialPlaceholders.patterns)) {
      if (count > 0) console.log(`      - "${pat}" × ${count}`);
    }
  } else {
    console.log('    ✓ No placeholder text found on live site!');
    if (!VISUAL_ONLY) {
      console.log('\n    Homepage looks clean. Nothing to fix.');
      return;
    }
  }

  // 1d. Deep-diff the Shop By Category section against desired state
  console.log('\n1d. Comparing live "Shop By Category" section to desired state...');
  const collListSection = sections['1489285116594'];
  if (!collListSection) {
    console.log('    ✗ Section 1489285116594 is MISSING from live settings!');
  } else {
    const liveBlocks = collListSection.blocks || {};
    const liveOrder = collListSection.block_order || [];
    console.log(`    Live blocks: ${liveOrder.length} (IDs: ${liveOrder.join(', ')})`);
    console.log(`    Desired blocks: ${Object.keys(CATEGORY_BLOCKS).length}`);

    // Check each live block
    let blockDiffCount = 0;
    for (const blockId of liveOrder) {
      const liveBlock = liveBlocks[blockId];
      const desiredSettings = CATEGORY_BLOCKS[blockId];
      if (!liveBlock) {
        console.log(`    ✗ Block "${blockId}" is in order but missing from blocks`);
        blockDiffCount++;
        continue;
      }
      if (!desiredSettings) {
        console.log(`    ? Block "${blockId}" exists on live but not in our desired config`);
        // Print what it has
        const s = liveBlock.settings || {};
        console.log(`      collection: "${s.feature_collection || '(empty)'}", title: "${s.title || '(not set)'}", image: ${s.image ? 'yes' : 'NO'}`);
        blockDiffCount++;
        continue;
      }
      const diffs = deepDiff(liveBlock.settings || {}, desiredSettings);
      if (diffs.length > 0) {
        console.log(`    ≠ Block "${blockId}" has ${diffs.length} difference(s):`);
        for (const d of diffs) {
          const liveVal = d.live === undefined ? '(missing)' : `"${d.live}"`;
          const desiredVal = `"${d.desired}"`;
          console.log(`      ${d.path}: ${liveVal} → ${desiredVal}`);
        }
        blockDiffCount++;
      }
    }
    if (blockDiffCount === 0) {
      console.log('    ✓ All blocks match desired state — settings are correct');
      console.log('    → Placeholder text is NOT caused by wrong settings_data.json');
    }
  }

  // 1e. Fetch ALL collections and validate/resolve handles
  console.log('\n1e. Fetching all Shopify collections to validate handles...');
  const allCollections = await fetchAllCollections();
  console.log(`    ✓ Found ${allCollections.length} collections total`);

  // Build handle → collection map
  const handleMap = new Map();
  for (const col of allCollections) {
    handleMap.set(col.handle, col);
  }
  console.log(`    Collection handles: ${[...handleMap.keys()].sort().join(', ')}`);

  // Check each desired handle — resolve missing ones
  const collectionHandles = [...new Set([
    ...Object.values(CATEGORY_BLOCKS).map(b => b.feature_collection),
    ...Object.values(FEATURED_SECTIONS).map(s => s.collection),
  ])];
  const handleFixes = new Map(); // desiredHandle → resolvedHandle
  const collectionTitleIssues = [];

  for (const handle of collectionHandles) {
    const col = handleMap.get(handle);
    if (col) {
      const isDefault = /^collection title$/i.test(col.title) || /^collection$/i.test(col.title);
      if (isDefault) {
        collectionTitleIssues.push({ handle, id: col.id, currentTitle: col.title, type: col.rules ? 'smart' : 'custom' });
        console.log(`    ✗ "${handle}" → "${col.title}" (placeholder title!)`);
      } else {
        console.log(`    ✓ "${handle}" → "${col.title}"`);
      }
    } else {
      console.log(`    ✗ "${handle}" → NOT FOUND — searching for best match...`);
      const match = findBestMatch(handle, allCollections);
      if (match && match.score >= 30) {
        console.log(`      → Best match: "${match.collection.handle}" ("${match.collection.title}") [${match.reason}]`);
        handleFixes.set(handle, match.collection.handle);
      } else {
        console.log(`      → No good match found (best score: ${match?.score || 0})`);
        collectionTitleIssues.push({ handle, id: null, currentTitle: null, type: 'missing' });
      }
    }
  }

  // 1f. Run visual analysis if Gemini is available
  let visualReport = null;
  if (!SKIP_VISUAL) {
    console.log('\n1f. Running Gemini Flash visual analysis...\n');
    try {
      visualReport = await analyzeHomepageVisually(liveSettings, STORE_URL, {
        verbose: true,
        skipHtmlAnalysis: false,
      });
      printReport(visualReport);
    } catch (err) {
      console.log(`    ⚠ Visual analysis failed: ${err.message}`);
    }
  }

  if (VISUAL_ONLY) {
    console.log('\nVisual analysis complete.');
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 2: DIAGNOSE — determine what needs to change
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  PHASE 2: DIAGNOSE                              ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  const fixes = [];

  // Diagnosis 2a: Check if section blocks need updating
  if (collListSection) {
    const liveBlocks = collListSection.blocks || {};
    const liveOrder = collListSection.block_order || [];
    const desiredOrder = Object.keys(CATEGORY_BLOCKS);

    // Check if block IDs match
    const liveBlockSet = new Set(liveOrder);
    const desiredBlockSet = new Set(desiredOrder);
    const missingBlocks = desiredOrder.filter(id => !liveBlockSet.has(id));
    const extraBlocks = liveOrder.filter(id => !desiredBlockSet.has(id));

    if (missingBlocks.length > 0 || extraBlocks.length > 0) {
      console.log('2a. Block IDs mismatch — need to replace entire section');
      console.log(`    Missing: ${missingBlocks.join(', ') || 'none'}`);
      console.log(`    Extra: ${extraBlocks.join(', ') || 'none'}`);
      fixes.push({ type: 'replace_collection_list_section', reason: 'Block IDs do not match' });
    } else {
      // Block IDs match — check if settings need updating
      let needsSettingsUpdate = false;
      for (const blockId of desiredOrder) {
        const diffs = deepDiff(liveBlocks[blockId]?.settings || {}, CATEGORY_BLOCKS[blockId]);
        if (diffs.length > 0) {
          needsSettingsUpdate = true;
          break;
        }
      }
      if (needsSettingsUpdate) {
        fixes.push({ type: 'update_collection_list_blocks', reason: 'Block settings differ from desired state' });
      } else {
        console.log('2a. ✓ Collection list section settings already correct');
      }
    }
  } else {
    fixes.push({ type: 'replace_collection_list_section', reason: 'Section is completely missing' });
  }

  // Diagnosis 2b: Check featured collection sections
  for (const [sectionId, desired] of Object.entries(FEATURED_SECTIONS)) {
    const live = sections[sectionId];
    if (!live) {
      fixes.push({ type: 'add_featured_section', sectionId, reason: `Section ${sectionId} missing` });
    } else if (!live.settings?.collection) {
      fixes.push({ type: 'fix_featured_section', sectionId, reason: 'Empty collection handle' });
    }
  }

  // Diagnosis 2c: Check promotion blocks
  const promoSection = sections['1489283737905'];
  if (promoSection) {
    const promoBlocks = promoSection.blocks || {};
    for (const [blockId, desired] of Object.entries(PROMO_BLOCKS)) {
      if (!promoBlocks[blockId]) {
        fixes.push({ type: 'fix_promo_section', reason: `Missing promo block ${blockId}` });
        break;
      }
      if (!promoBlocks[blockId]?.settings?.image) {
        fixes.push({ type: 'fix_promo_section', reason: `Missing image in promo block ${blockId}` });
        break;
      }
    }
  }

  // Diagnosis 2d: Check image-text blocks
  const imageTextSection = sections['1489284503681'];
  if (imageTextSection) {
    const itBlocks = imageTextSection.blocks || {};
    for (const [blockId, desired] of Object.entries(IMAGE_TEXT_BLOCKS)) {
      if (!itBlocks[blockId] || !itBlocks[blockId]?.settings?.image) {
        fixes.push({ type: 'fix_image_text_section', reason: `Missing/empty block ${blockId}` });
        break;
      }
    }
  }

  // Diagnosis 2e: Missing/wrong collection handles
  if (handleFixes.size > 0) {
    console.log(`2e. ${handleFixes.size} collection handle(s) need remapping:`);
    for (const [from, to] of handleFixes) {
      console.log(`    "${from}" → "${to}"`);
    }
    fixes.push({ type: 'remap_collection_handles', handleFixes, reason: `${handleFixes.size} handle(s) don't resolve to real collections` });
    // Handle remapping requires section rebuild
    if (!fixes.find(f => f.type === 'replace_collection_list_section')) {
      fixes.push({ type: 'replace_collection_list_section', reason: 'Handles remapped, need to rebuild section' });
    }
  }

  // Diagnosis 2f: Collection object titles
  if (collectionTitleIssues.filter(c => c.type !== 'missing').length > 0) {
    fixes.push({ type: 'rename_collections', collections: collectionTitleIssues.filter(c => c.type !== 'missing'), reason: 'Collections have default/placeholder titles' });
  }

  // Diagnosis 2g: If placeholders exist but all settings look correct,
  // force a full section replacement to ensure block structure matches what the theme expects.
  if (initialPlaceholders.total > 0 && fixes.length === 0) {
    console.log('2g. Settings look correct but placeholders exist on live site.');
    console.log('    → Will force full section replacement to ensure theme compatibility.');
    fixes.push({ type: 'replace_collection_list_section', reason: 'Settings correct but placeholders visible — forcing full replacement' });
  }

  console.log(`\n    Diagnosis: ${fixes.length} fix(es) needed`);
  for (const f of fixes) {
    console.log(`    • ${f.type}: ${f.reason}`);
  }

  if (fixes.length === 0) {
    console.log('\n    ✓ Nothing to fix!');
    return;
  }

  if (DRY_RUN) {
    console.log('\n    DRY RUN — no changes applied. Use --execute to fix and verify.');
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 3: FIX — apply changes at the correct level
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  PHASE 3: FIX                                   ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  let settingsChanged = false;

  // Apply handle remapping first so rebuilt sections use correct handles
  const remapFix = fixes.find(f => f.type === 'remap_collection_handles');
  if (remapFix) {
    console.log('3-pre. Applying collection handle remapping...');
    for (const [oldHandle, newHandle] of remapFix.handleFixes) {
      // Update CATEGORY_BLOCKS
      for (const blockId of Object.keys(CATEGORY_BLOCKS)) {
        if (CATEGORY_BLOCKS[blockId].feature_collection === oldHandle) {
          CATEGORY_BLOCKS[blockId].feature_collection = newHandle;
          console.log(`    ✓ Block ${blockId}: "${oldHandle}" → "${newHandle}"`);
        }
      }
      // Update FEATURED_SECTIONS
      for (const sectionId of Object.keys(FEATURED_SECTIONS)) {
        if (FEATURED_SECTIONS[sectionId].collection === oldHandle) {
          FEATURED_SECTIONS[sectionId].collection = newHandle;
          console.log(`    ✓ Featured section ${sectionId}: "${oldHandle}" → "${newHandle}"`);
        }
      }
      // Update PROMO_BLOCKS
      for (const blockId of Object.keys(PROMO_BLOCKS)) {
        if (PROMO_BLOCKS[blockId].link === `shopify://collections/${oldHandle}`) {
          PROMO_BLOCKS[blockId].link = `shopify://collections/${newHandle}`;
          console.log(`    ✓ Promo ${blockId} link: "${oldHandle}" → "${newHandle}"`);
        }
      }
    }
  }

  for (const fix of fixes) {
    switch (fix.type) {
      case 'remap_collection_handles':
        // Already applied above
        break;

      case 'replace_collection_list_section':
      case 'update_collection_list_blocks': {
        console.log('3a. Rebuilding Shop By Category section...');
        const newBlocks = {};
        for (const [blockId, settings] of Object.entries(CATEGORY_BLOCKS)) {
          newBlocks[blockId] = { type: 'collection', settings };
        }
        liveSettings.current.sections['1489285116594'] = {
          type: 'collection-list',
          blocks: newBlocks,
          block_order: Object.keys(CATEGORY_BLOCKS),
          settings: {
            title: 'Shop By Category',
            align_height: true,
            collection_height: 200,
            frontpage_collections_per_row: 4,
          },
        };
        console.log('    ✓ Section rebuilt with 8 blocks');
        settingsChanged = true;
        break;
      }

      case 'fix_promo_section': {
        console.log('3b. Rebuilding Featured Promotions section...');
        const newBlocks = {};
        for (const [blockId, settings] of Object.entries(PROMO_BLOCKS)) {
          newBlocks[blockId] = { type: 'image', settings };
        }
        liveSettings.current.sections['1489283737905'] = {
          type: 'featured-promotions',
          blocks: newBlocks,
          block_order: Object.keys(PROMO_BLOCKS),
          settings: { featured_promos_per_row: 3, featured_promos_grid: true, featured_links_animation: 'fadeInUp', feature_style: 'rounded', promo_text_on_image_enabled: true },
        };
        console.log('    ✓ Promotions rebuilt');
        settingsChanged = true;
        break;
      }

      case 'fix_image_text_section': {
        console.log('3c. Rebuilding Image-Text section...');
        const newBlocks = {};
        for (const [blockId, settings] of Object.entries(IMAGE_TEXT_BLOCKS)) {
          newBlocks[blockId] = { type: 'image', settings };
        }
        liveSettings.current.sections['1489284503681'] = {
          type: 'image-text',
          blocks: newBlocks,
          block_order: Object.keys(IMAGE_TEXT_BLOCKS),
          settings: { frontpage_grid_style: false, featured_links_per_row: '1', frontpage_text_align: 'left', frontpage_image_position: 'left' },
        };
        console.log('    ✓ Image-text rebuilt');
        settingsChanged = true;
        break;
      }

      case 'fix_featured_section':
      case 'add_featured_section': {
        const { sectionId } = fix;
        const desired = FEATURED_SECTIONS[sectionId];
        if (desired) {
          console.log(`3d. Fixing featured section "${desired.title}" (${sectionId})...`);
          liveSettings.current.sections[sectionId] = {
            type: 'featured-collection',
            settings: {
              title: desired.title,
              collection_description: false,
              collection: desired.collection,
              collection_style: 'grid',
              products_per: 3,
              products_limit: sectionId === 'glass_jars_featured' ? 6 : 9,
            },
          };
          console.log(`    ✓ Set collection="${desired.collection}"`);
          settingsChanged = true;
        }
        break;
      }

      case 'rename_collections': {
        console.log('3e. Renaming collections with default titles...');
        const desiredTitles = {};
        for (const b of Object.values(CATEGORY_BLOCKS)) {
          desiredTitles[b.feature_collection] = b.title;
        }
        for (const { collection } of Object.values(FEATURED_SECTIONS)) {
          if (!desiredTitles[collection]) {
            const entry = Object.values(FEATURED_SECTIONS).find(f => f.collection === collection);
            if (entry) desiredTitles[collection] = entry.title;
          }
        }

        for (const issue of fix.collections) {
          if (!issue.id || issue.type === 'missing') continue;
          const newTitle = desiredTitles[issue.handle] || issue.handle.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          const endpoint = issue.type === 'smart' ? 'smart_collections' : 'custom_collections';
          try {
            const body = {};
            body[issue.type === 'smart' ? 'smart_collection' : 'custom_collection'] = {
              id: issue.id,
              title: newTitle,
            };
            writeFileSync('/tmp/collection_rename.json', JSON.stringify(body));
            shopifyRest(`${BASE_URL}/${endpoint}/${issue.id}.json`, 'PUT', '/tmp/collection_rename.json');
            console.log(`    ✓ Renamed "${issue.handle}": "${issue.currentTitle}" → "${newTitle}"`);
          } catch (err) {
            console.log(`    ✗ Failed to rename "${issue.handle}": ${err.message}`);
          }
        }
        break;
      }
    }
  }

  // Update preset copies to prevent reversion
  if (settingsChanged && liveSettings.presets) {
    console.log('\n    Updating preset copies...');
    let presetCount = 0;
    for (const [presetName, presetData] of Object.entries(liveSettings.presets)) {
      if (typeof presetData !== 'object' || !presetData.sections) continue;
      for (const sectionId of ['1489285116594', '1489283737905', '1489284503681', ...Object.keys(FEATURED_SECTIONS)]) {
        if (presetData.sections[sectionId] && liveSettings.current.sections[sectionId]) {
          presetData.sections[sectionId] = liveSettings.current.sections[sectionId];
        }
      }
      presetCount++;
    }
    if (presetCount > 0) console.log(`    ✓ Updated ${presetCount} presets`);
  }

  // Deploy settings
  if (settingsChanged) {
    console.log('\n    Deploying settings_data.json to Shopify...');
    try {
      const resp = putThemeAsset('config/settings_data.json', JSON.stringify(liveSettings));
      if (resp.asset) {
        console.log('    ✓ Settings deployed successfully');
      } else {
        console.error('    ✗ Deploy error:', JSON.stringify(resp.errors || resp));
        process.exit(1);
      }
    } catch (err) {
      console.error('    ✗ Deploy failed:', err.message);
      process.exit(1);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 4: VERIFY — re-check the live site
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  PHASE 4: VERIFY                                ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Wait for Shopify CDN to propagate
  console.log('    Waiting 10s for CDN propagation...');
  await sleep(10000);

  console.log('    Re-fetching live homepage...');
  const verifyHtml = await fetchHomepageHtml();
  const afterPlaceholders = countPlaceholders(verifyHtml);

  console.log(`\n    ┌─────────────────────────────────────┐`);
  console.log(`    │  VERIFICATION RESULTS                │`);
  console.log(`    ├─────────────────────────────────────┤`);
  console.log(`    │  Before: ${String(initialPlaceholders.total).padStart(2)} placeholder(s)           │`);
  console.log(`    │  After:  ${String(afterPlaceholders.total).padStart(2)} placeholder(s)           │`);
  console.log(`    └─────────────────────────────────────┘`);

  if (afterPlaceholders.total === 0) {
    console.log('\n    ✅ SUCCESS! All placeholder text removed from live site.');
    console.log(`    Verify at: ${STOREFRONT_URL}`);
    return;
  }

  if (afterPlaceholders.total < initialPlaceholders.total) {
    console.log(`\n    ⚠ PARTIAL FIX — reduced from ${initialPlaceholders.total} to ${afterPlaceholders.total} placeholders.`);
  } else {
    console.log('\n    ⚠ Placeholders still present after fix.');
  }

  // Show remaining issues
  console.log('    Remaining:');
  for (const [pat, count] of Object.entries(afterPlaceholders.patterns)) {
    if (count > 0) console.log(`      - "${pat}" × ${count}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 5: RETRY — try deeper fixes if verification failed
  // ═══════════════════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  PHASE 5: RETRY — investigating deeper          ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Try to locate exactly where placeholder text appears in the HTML
  if (verifyHtml) {
    console.log('    Locating placeholder text in HTML...');
    const patterns = [/COLLECTION TITLE/gi, /Collection title/g];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(verifyHtml)) !== null) {
        const start = Math.max(0, match.index - 200);
        const end = Math.min(verifyHtml.length, match.index + match[0].length + 200);
        const context = verifyHtml.substring(start, end)
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        console.log(`\n    Found "${match[0]}" in context:`);
        console.log(`    "...${context.substring(0, 150)}..."`);
      }
    }
  }

  // Re-fetch settings after deploy to check if our changes took effect
  console.log('\n    Re-fetching settings from Shopify to verify deploy...');
  try {
    const response = fetchThemeAsset('config/settings_data.json');
    const recheck = JSON.parse(response.asset.value);
    const recheckSection = recheck.current?.sections?.['1489285116594'];
    if (recheckSection) {
      const blocks = recheckSection.blocks || {};
      const order = recheckSection.block_order || [];
      console.log(`    Section 1489285116594 on live store:`);
      console.log(`    block_order: ${order.join(', ')}`);
      for (const id of order) {
        const b = blocks[id];
        if (b) {
          const s = b.settings || {};
          console.log(`    Block ${id}: collection="${s.feature_collection || '(empty)'}", title="${s.title || '(not set)'}", image=${s.image ? 'yes' : 'no'}`);
        }
      }
    } else {
      console.log('    ✗ Section 1489285116594 missing from re-fetched settings!');
    }
  } catch (err) {
    console.log(`    ✗ Re-fetch failed: ${err.message}`);
  }

  // Check if the issue is in a theme Liquid file (not just settings)
  console.log('\n    Checking for hardcoded placeholder text in theme templates...');
  const liquidPaths = [
    'sections/collection-list.liquid',
    'snippets/collection-grid-item.liquid',
    'snippets/collection-card.liquid',
    'templates/index.liquid',
    'layout/theme.liquid',
  ];
  for (const path of liquidPaths) {
    try {
      const resp = fetchThemeAsset(path);
      const content = resp.asset?.value || '';
      if (/COLLECTION TITLE|Collection title/i.test(content)) {
        console.log(`    ⚠ Found placeholder in theme file: ${path}`);
        // Extract the relevant line
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (/COLLECTION TITLE|Collection title/i.test(lines[i])) {
            console.log(`      Line ${i + 1}: ${lines[i].trim().substring(0, 120)}`);
          }
        }
      }
    } catch {}
  }

  console.log('\n    ─────────────────────────────────────');
  console.log('    Verification not fully passing yet.');
  console.log('    The remaining issues may require:');
  console.log('    1. Theme template edits (Liquid files)');
  console.log('    2. Collection object renames via Shopify Admin');
  console.log('    3. Waiting longer for CDN propagation (try again in 5min)');
  console.log(`    Check: ${STOREFRONT_URL}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
