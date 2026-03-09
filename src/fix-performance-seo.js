#!/usr/bin/env node
/**
 * Fix Performance & SEO Issues
 *
 * Addresses the following problems via Shopify Theme Asset API:
 *
 * 1. Hero image has loading="lazy" — should be loading="eager" + fetchpriority="high"
 * 2. Render-blocking scripts — add defer/async where safe
 * 3. Liquid complexity (8,280) — reduce homepage product grid limits
 * 4. Missing og:image meta tag — add fallback og:image in theme.liquid
 * 5. Two H1 tags on homepage — demote second banner title to H2
 *
 * Usage:
 *   node src/fix-performance-seo.js                # Diagnose only (dry run)
 *   node src/fix-performance-seo.js --execute      # Apply all fixes
 */

import 'dotenv/config';
import { config } from './config.js';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';

const STORE_URL = config.shopify.storeUrl;
const ACCESS_TOKEN = config.shopify.accessToken;
const API_VERSION = config.shopify.apiVersion;
const THEME_ID = process.env.SHOPIFY_THEME_ID || '140853018904';

const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;
const DRY_RUN = !process.argv.includes('--execute');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── API helpers (same pattern as fix-homepage.js) ──────────────────────────

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
  writeFileSync('/tmp/shopify_perf_asset.json', JSON.stringify(body));
  return shopifyRest(`${BASE_URL}/themes/${THEME_ID}/assets.json`, 'PUT', '/tmp/shopify_perf_asset.json');
}

// ─── Fix 1: Hero image — loading="eager" + fetchpriority="high" ─────────────

async function fixHeroImageLoading() {
  console.log('\n── FIX 1: Hero Image LCP ──────────────────────────');
  console.log('Problem: Hero image has loading="lazy", delaying LCP by 1-2s');

  // The hero uses section type "image-with-text-overlay"
  // Need to find and patch the section template that renders it
  const sectionPaths = [
    'sections/image-with-text-overlay.liquid',
    'sections/slideshow-with-text.liquid',
    'sections/hero.liquid',
  ];

  let sectionContent = null;
  let sectionPath = null;

  for (const path of sectionPaths) {
    try {
      const resp = fetchThemeAsset(path);
      if (resp.asset?.value) {
        sectionContent = resp.asset.value;
        sectionPath = path;
        console.log(`  Found section template: ${path}`);
        break;
      }
    } catch {}
  }

  if (!sectionContent) {
    console.log('  Could not find hero section template. Checking snippets...');
    // Try the image-element snippet that renders images
    const snippetPaths = [
      'snippets/image-element.liquid',
      'snippets/responsive-image.liquid',
      'snippets/image.liquid',
    ];
    for (const path of snippetPaths) {
      try {
        const resp = fetchThemeAsset(path);
        if (resp.asset?.value) {
          sectionContent = resp.asset.value;
          sectionPath = path;
          console.log(`  Found image snippet: ${path}`);
          break;
        }
      } catch {}
    }
  }

  if (!sectionContent) {
    console.log('  WARNING: Could not locate hero section or image snippet.');
    console.log('  Manual fix: In theme editor, find the image-with-text-overlay section');
    console.log('  and change the hero <img> tag to include loading="eager" fetchpriority="high"');
    return false;
  }

  // Strategy: We need to make the FIRST image in image-with-text-overlay sections
  // load eagerly. The best approach depends on the template structure.

  let modified = sectionContent;
  let changesMade = false;

  // Pattern 1: Direct img tag with loading="lazy" in the section
  if (modified.includes('loading="lazy"')) {
    // For the image-with-text-overlay section, we want the main image to be eager.
    // Replace the first occurrence of loading="lazy" with a conditional:
    // If it's the first section on the page (hero), use eager; otherwise lazy.
    console.log('  Found loading="lazy" in template');

    // If this is the image-element snippet (shared by all images), we need a
    // conditional approach — only the hero should be eager
    if (sectionPath.includes('image-element') || sectionPath.includes('responsive-image')) {
      // Add a parameter check: if 'eager' is passed, use eager loading
      if (!modified.includes('loading="eager"')) {
        modified = modified.replace(
          /loading="lazy"/,
          '{% if eager %}loading="eager" fetchpriority="high"{% else %}loading="lazy"{% endif %}'
        );
        changesMade = true;
        console.log('  Added conditional eager/lazy loading to image snippet');
      }
    } else {
      // This is the section template itself — make its image eager
      modified = modified.replace(
        /loading="lazy"/,
        'loading="eager" fetchpriority="high"'
      );
      changesMade = true;
      console.log('  Changed loading="lazy" to loading="eager" fetchpriority="high"');
    }
  }

  // Pattern 2: Uses include/render 'image-element' — add eager: true param
  if (modified.includes("include 'image-element'") || modified.includes("render 'image-element'")) {
    const includePattern = /({%[-\s]*(?:include|render)\s+'image-element'[^%]*)(-%}|%})/;
    const match = modified.match(includePattern);
    if (match && !match[1].includes('eager')) {
      modified = modified.replace(
        includePattern,
        `$1, eager: true $2`
      );
      changesMade = true;
      console.log('  Added eager: true to image-element include');
    }
  }

  // Pattern 3: The image tag is built with Liquid img_url filter
  // Look for img_tag or img_url patterns without loading attributes
  if (!changesMade && (modified.includes('img_url') || modified.includes('img_tag'))) {
    // Add fetchpriority to the img tag
    const imgTagPattern = /(<img[^>]*)(>)/;
    if (modified.match(imgTagPattern) && !modified.includes('fetchpriority')) {
      modified = modified.replace(
        imgTagPattern,
        '$1 loading="eager" fetchpriority="high"$2'
      );
      changesMade = true;
      console.log('  Added loading="eager" fetchpriority="high" to img tag');
    }
  }

  if (!changesMade) {
    console.log('  No lazy loading pattern found to fix (may already be correct)');
    return false;
  }

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would update: ' + sectionPath);
    return true;
  }

  try {
    putThemeAsset(sectionPath, modified);
    console.log('  DEPLOYED: ' + sectionPath);

    // If we modified the image snippet, also update the hero section to pass eager: true
    if (sectionPath.includes('image-element') || sectionPath.includes('responsive-image')) {
      await patchHeroSectionForEager();
    }
    return true;
  } catch (err) {
    console.error('  Deploy failed:', err.message);
    return false;
  }
}

async function patchHeroSectionForEager() {
  // Patch the image-with-text-overlay section to pass eager: true to image-element
  try {
    const resp = fetchThemeAsset('sections/image-with-text-overlay.liquid');
    let content = resp.asset?.value;
    if (!content) return;

    if (content.includes("include 'image-element'") && !content.includes('eager: true')) {
      content = content.replace(
        /({%[-\s]*include\s+'image-element'[^%]*)(-%}|%})/,
        `$1, eager: true $2`
      );
      putThemeAsset('sections/image-with-text-overlay.liquid', content);
      console.log('  DEPLOYED: sections/image-with-text-overlay.liquid (eager: true)');
    }
  } catch {}
}

// ─── Fix 2: Render-blocking scripts ─────────────────────────────────────────

async function fixRenderBlockingScripts() {
  console.log('\n── FIX 2: Render-Blocking Scripts ─────────────────');
  console.log('Problem: 10 scripts block HTML parsing (jQuery, vendors, Sezzle, etc.)');

  let themeContent = null;
  try {
    const resp = fetchThemeAsset('layout/theme.liquid');
    themeContent = resp.asset?.value;
    console.log('  Found layout/theme.liquid');
  } catch (err) {
    console.log('  Could not fetch theme.liquid:', err.message);
    return false;
  }

  if (!themeContent) return false;

  let modified = themeContent;
  let changeCount = 0;

  // Scripts that are safe to defer (non-critical, don't need immediate execution)
  const safeToDefer = [
    'sezzle',             // BNPL — not needed on homepage at all
    'instantclick',       // Prefetching library — safe to defer
    'filter-enhancements', // Collection filters — not needed on first paint
    'currencies',         // Currency switching — can load after paint
  ];

  // Scripts that should be deferred but with care (after jQuery loads)
  const deferAfterJquery = [
    'utilities.js',
    'sections.js',
  ];

  // Find all script tags and categorize them
  const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match;
  const scripts = [];

  while ((match = scriptRegex.exec(modified)) !== null) {
    scripts.push({
      full: match[0],
      src: match[1],
      index: match.index,
      hasDefer: /\bdefer\b/.test(match[0]),
      hasAsync: /\basync\b/.test(match[0]),
    });
  }

  console.log(`  Found ${scripts.length} script tags in theme.liquid`);

  for (const script of scripts) {
    if (script.hasDefer || script.hasAsync) continue;

    const srcLower = script.src.toLowerCase();

    // Check if this is a script safe to defer
    const isSafeToDefer = safeToDefer.some(name => srcLower.includes(name));
    const isDeferAfterJquery = deferAfterJquery.some(name => srcLower.includes(name));

    if (isSafeToDefer) {
      // Add defer attribute
      const newTag = script.full.replace('<script', '<script defer');
      modified = modified.replace(script.full, newTag);
      changeCount++;
      console.log(`  + defer: ${script.src.split('/').pop()}`);
    } else if (isDeferAfterJquery) {
      // These depend on jQuery — add defer (jQuery will still load first as it's above them)
      const newTag = script.full.replace('<script', '<script defer');
      modified = modified.replace(script.full, newTag);
      changeCount++;
      console.log(`  + defer: ${script.src.split('/').pop()}`);
    }
  }

  // Remove Sezzle from homepage entirely if it's included unconditionally
  // Sezzle checkout button has zero relevance on the homepage
  if (modified.includes('sezzle') && !modified.includes('template == "product"')) {
    // Wrap Sezzle in a product-page conditional
    const sezzlePattern = /(<script[^>]*sezzle[^>]*>[\s\S]*?<\/script>)/i;
    const sezzleMatch = modified.match(sezzlePattern);
    if (sezzleMatch) {
      const wrapped = `{% if template == 'product' or template contains 'cart' %}\n${sezzleMatch[1]}\n{% endif %}`;
      modified = modified.replace(sezzleMatch[1], wrapped);
      changeCount++;
      console.log('  + Wrapped Sezzle in product/cart template conditional');
    }
  }

  // Also check for inline Sezzle widget script tags
  const sezzleWidgetPattern = /(<script[^>]*>[^<]*sezzle[^<]*<\/script>)/gi;
  let sezzleInline;
  while ((sezzleInline = sezzleWidgetPattern.exec(themeContent)) !== null) {
    if (!sezzleInline[1].includes('template')) {
      // Already in original, wrap it
      const idx = modified.indexOf(sezzleInline[1]);
      if (idx !== -1 && !modified.substring(Math.max(0, idx - 100), idx).includes('template')) {
        modified = modified.replace(
          sezzleInline[1],
          `{% if template == 'product' or template contains 'cart' %}\n${sezzleInline[1]}\n{% endif %}`
        );
        changeCount++;
        console.log('  + Wrapped inline Sezzle script in template conditional');
      }
    }
  }

  if (changeCount === 0) {
    console.log('  No render-blocking scripts found to fix');
    return false;
  }

  console.log(`  Total changes: ${changeCount} scripts updated`);

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would update layout/theme.liquid');
    return true;
  }

  try {
    putThemeAsset('layout/theme.liquid', modified);
    console.log('  DEPLOYED: layout/theme.liquid');
    return true;
  } catch (err) {
    console.error('  Deploy failed:', err.message);
    return false;
  }
}

// ─── Fix 3: Reduce Liquid complexity ────────────────────────────────────────

async function reduceLiquidComplexity() {
  console.log('\n── FIX 3: Liquid Complexity (Score: 8,280) ────────');
  console.log('Problem: 6+ product grids on homepage, 831ms server processing');

  // Reduce products_limit on featured collection sections to lower Liquid complexity
  // Each product in a grid requires Liquid processing (price, variants, images, etc.)
  // Reducing from 9 to 4 products per section saves ~60% complexity per section

  const settingsPath = 'config/settings_data.json';
  let settingsData;
  try {
    const resp = fetchThemeAsset(settingsPath);
    settingsData = JSON.parse(resp.asset.value);
    console.log('  Fetched live settings_data.json');
  } catch (err) {
    console.log('  Could not fetch settings:', err.message);
    // Fall back to local file
    try {
      settingsData = JSON.parse(readFileSync('theme-files/config/settings_data.json', 'utf8'));
      console.log('  Using local settings_data.json');
    } catch {
      console.log('  No settings file available');
      return false;
    }
  }

  const sections = settingsData.current?.sections || {};
  let changeCount = 0;

  // Featured collection sections to optimize
  const gridSections = {
    '1556571858712': { name: 'Dab Rigs', newLimit: 4 },
    '1602299209890': { name: 'Hand Pipes', newLimit: 4 },
    '1602299393597': { name: 'Made in USA Glass', newLimit: 4 },
    '1602299824926': { name: 'Everyday Essentials', newLimit: 4 },
    'extraction_essentials': { name: 'Extraction & Packaging', newLimit: 4 },
    'glass_jars_featured': { name: 'Glass Jars', newLimit: 4 },
  };

  for (const [sectionId, config] of Object.entries(gridSections)) {
    const section = sections[sectionId];
    if (!section) continue;
    const currentLimit = section.settings?.products_limit;
    if (currentLimit && currentLimit > config.newLimit) {
      console.log(`  ${config.name}: products_limit ${currentLimit} → ${config.newLimit}`);
      section.settings.products_limit = config.newLimit;
      changeCount++;
    } else {
      console.log(`  ${config.name}: already at ${currentLimit || 'default'} (ok)`);
    }
  }

  // Estimated complexity reduction:
  // 6 sections × (9-4) products × ~100 Liquid ops per product = ~3,000 ops saved
  if (changeCount > 0) {
    console.log(`  Estimated complexity reduction: ~${changeCount * 5 * 100} Liquid operations`);
    console.log(`  This should reduce server processing time by ~200-400ms`);
  }

  if (changeCount === 0) {
    console.log('  No changes needed');
    return false;
  }

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would update settings_data.json');
    return true;
  }

  try {
    putThemeAsset(settingsPath, JSON.stringify(settingsData));
    console.log('  DEPLOYED: config/settings_data.json');

    // Also update local copy
    writeFileSync('theme-files/config/settings_data.json', JSON.stringify(settingsData, null, 2));
    console.log('  Updated local copy');
    return true;
  } catch (err) {
    console.error('  Deploy failed:', err.message);
    return false;
  }
}

// ─── Fix 4: Add og:image meta tag ──────────────────────────────────────────

async function addOgImage() {
  console.log('\n── FIX 4: Missing og:image ────────────────────────');
  console.log('Problem: No og:image fallback — Reddit/social shares show blank previews');

  let themeContent = null;
  try {
    const resp = fetchThemeAsset('layout/theme.liquid');
    themeContent = resp.asset?.value;
    console.log('  Found layout/theme.liquid');
  } catch (err) {
    console.log('  Could not fetch theme.liquid:', err.message);
    return false;
  }

  if (!themeContent) return false;

  // Check if og:image already exists
  if (themeContent.includes('og:image') && !themeContent.includes('og_image_fallback')) {
    console.log('  og:image tag already exists in theme.liquid');
    return false;
  }

  let modified = themeContent;

  // The og:image snippet to inject — uses the hero image as fallback,
  // but prefers product/collection images when available
  const ogImageSnippet = `
  {%- comment -%} og:image fallback for social sharing (Reddit, Facebook, Twitter) {%- endcomment -%}
  {%- if template contains 'product' and product.featured_image -%}
    <meta property="og:image" content="{{ product.featured_image | image_url: width: 1200 }}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
  {%- elsif template contains 'collection' and collection.image -%}
    <meta property="og:image" content="{{ collection.image | image_url: width: 1200 }}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
  {%- elsif template contains 'article' and article.image -%}
    <meta property="og:image" content="{{ article.image | image_url: width: 1200 }}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
  {%- else -%}
    <meta property="og:image" content="{{ 'ChatGPT_Image_Jan_24_2026_05_54_54_PM.png' | file_img_url: '1200x630' }}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
  {%- endif -%}
  <meta property="og:image:alt" content="{{ page_title | escape }}" />`;

  // Insert after existing og: tags or after <head> section meta tags
  // Look for the best insertion point
  if (modified.includes('og:title')) {
    // Insert after the og:title line
    const ogTitlePattern = /<meta[^>]*og:title[^>]*>/;
    const ogTitleMatch = modified.match(ogTitlePattern);
    if (ogTitleMatch) {
      const insertAfter = ogTitleMatch[0];
      modified = modified.replace(insertAfter, insertAfter + '\n' + ogImageSnippet);
      console.log('  Inserted og:image after og:title tag');
    }
  } else if (modified.includes('og:description')) {
    const ogDescPattern = /<meta[^>]*og:description[^>]*>/;
    const ogDescMatch = modified.match(ogDescPattern);
    if (ogDescMatch) {
      modified = modified.replace(ogDescMatch[0], ogDescMatch[0] + '\n' + ogImageSnippet);
      console.log('  Inserted og:image after og:description tag');
    }
  } else if (modified.includes('</head>')) {
    // Last resort — insert before </head>
    modified = modified.replace('</head>', ogImageSnippet + '\n</head>');
    console.log('  Inserted og:image before </head>');
  } else {
    console.log('  Could not find insertion point for og:image');
    return false;
  }

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would update layout/theme.liquid');
    return true;
  }

  try {
    putThemeAsset('layout/theme.liquid', modified);
    console.log('  DEPLOYED: layout/theme.liquid');
    return true;
  } catch (err) {
    console.error('  Deploy failed:', err.message);
    return false;
  }
}

// ─── Fix 5: Duplicate H1 tags ──────────────────────────────────────────────

async function fixDuplicateH1() {
  console.log('\n── FIX 5: Duplicate H1 Tags ───────────────────────');
  console.log('Problem: "Oil Slick" (hero) and "Your One-Stop Smoke Shop" (banner) both render as H1');
  console.log('Solution: Demote the second banner\'s title to H2');

  // Both sections use type "image-with-text-overlay"
  // The section template renders the title — we need to make the second
  // instance render as H2 instead of H1

  // Approach: Modify the section template to accept a heading_level setting,
  // then update the banner section config to use H2

  let sectionContent = null;
  try {
    const resp = fetchThemeAsset('sections/image-with-text-overlay.liquid');
    sectionContent = resp.asset?.value;
    console.log('  Found sections/image-with-text-overlay.liquid');
  } catch {
    console.log('  Could not find image-with-text-overlay section');
    return false;
  }

  if (!sectionContent) return false;

  let modified = sectionContent;
  let changesMade = false;

  // Find the H1 tag pattern in the section and make it configurable
  // Common patterns: <h1>{{ section.settings.title }}</h1>
  //                   <h1 class="...">{{ section.settings.title }}</h1>
  const h1Patterns = [
    /(<h1[^>]*>)([\s\S]*?section\.settings\.title[\s\S]*?)(<\/h1>)/,
    /(<h1[^>]*>)([\s\S]*?\{\{[^}]*title[^}]*\}\}[\s\S]*?)(<\/h1>)/,
  ];

  for (const pattern of h1Patterns) {
    if (pattern.test(modified)) {
      // Replace with configurable heading level
      modified = modified.replace(pattern, (match, openTag, content, closeTag) => {
        // Extract attributes from the h1 tag
        const attrs = openTag.replace(/<h1/, '').replace(/>$/, '');
        return `{%- assign heading_tag = section.settings.heading_level | default: 'h1' -%}\n<{{ heading_tag }}${attrs}>${content}</{{ heading_tag }}>`;
      });
      changesMade = true;
      console.log('  Made heading tag configurable via heading_level setting');
      break;
    }
  }

  // Add heading_level to the schema if it has a schema block
  if (changesMade && modified.includes('{% schema %}')) {
    const schemaPattern = /"settings"\s*:\s*\[/;
    if (schemaPattern.test(modified)) {
      const headingSetting = `
      {
        "type": "select",
        "id": "heading_level",
        "label": "Heading level (SEO)",
        "default": "h1",
        "options": [
          { "value": "h1", "label": "H1 (primary)" },
          { "value": "h2", "label": "H2 (secondary)" }
        ],
        "info": "Use H1 for the main page heading only. Use H2 for secondary banners."
      },`;
      modified = modified.replace(schemaPattern, `"settings": [${headingSetting}`);
      console.log('  Added heading_level to section schema');
    }
  }

  if (!changesMade) {
    console.log('  Could not find H1 pattern to fix');
    console.log('  Manual fix: In theme editor, find the "Your One-Stop Smoke Shop"');
    console.log('  banner section and change its heading tag from H1 to H2');
    return false;
  }

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would update sections/image-with-text-overlay.liquid');
    console.log('  Then set heading_level: "h2" on section 1489284533457');
    return true;
  }

  // Deploy the modified section template
  try {
    putThemeAsset('sections/image-with-text-overlay.liquid', modified);
    console.log('  DEPLOYED: sections/image-with-text-overlay.liquid');
  } catch (err) {
    console.error('  Deploy failed:', err.message);
    return false;
  }

  // Now update settings_data.json to set heading_level: "h2" on the second banner
  try {
    const resp = fetchThemeAsset('config/settings_data.json');
    const settingsData = JSON.parse(resp.asset.value);
    const bannerSection = settingsData.current?.sections?.['1489284533457'];
    if (bannerSection) {
      bannerSection.settings.heading_level = 'h2';
      putThemeAsset('config/settings_data.json', JSON.stringify(settingsData));
      console.log('  DEPLOYED: config/settings_data.json (banner heading_level = h2)');

      // Update local copy
      writeFileSync('theme-files/config/settings_data.json', JSON.stringify(settingsData, null, 2));
    }
    return true;
  } catch (err) {
    console.error('  Settings update failed:', err.message);
    return false;
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════════════════════╗');
  console.log('║  PERFORMANCE & SEO FIX SCRIPT                        ║');
  console.log('╚═══════════════════════════════════════════════════════╝');
  console.log(`Store: ${STORE_URL}`);
  console.log(`Theme: ${THEME_ID}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (use --execute to apply)' : 'LIVE — applying fixes'}`);

  const results = {};

  // Run all fixes
  results.heroImage = await fixHeroImageLoading();
  results.renderBlocking = await fixRenderBlockingScripts();
  results.liquidComplexity = await reduceLiquidComplexity();
  results.ogImage = await addOgImage();
  results.duplicateH1 = await fixDuplicateH1();

  // Summary
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║  SUMMARY                                              ║');
  console.log('╚═══════════════════════════════════════════════════════╝');

  const fixes = [
    ['Hero image eager loading', results.heroImage],
    ['Render-blocking scripts', results.renderBlocking],
    ['Liquid complexity reduction', results.liquidComplexity],
    ['og:image meta tag', results.ogImage],
    ['Duplicate H1 fix', results.duplicateH1],
  ];

  for (const [name, applied] of fixes) {
    const status = applied ? (DRY_RUN ? 'WOULD FIX' : 'FIXED') : 'NO CHANGE';
    const icon = applied ? (DRY_RUN ? '~' : '+') : '-';
    console.log(`  [${icon}] ${name}: ${status}`);
  }

  const fixedCount = Object.values(results).filter(Boolean).length;
  if (DRY_RUN) {
    console.log(`\n  ${fixedCount} fix(es) identified. Run with --execute to apply.`);
  } else {
    console.log(`\n  ${fixedCount} fix(es) applied. Clear your Shopify cache and test.`);
  }

  console.log('\n  Expected impact:');
  console.log('  - LCP: -1 to 2 seconds (hero image eager loading)');
  console.log('  - FCP: -200 to 500ms (deferred scripts)');
  console.log('  - TTFB: -200 to 400ms (reduced Liquid complexity)');
  console.log('  - SEO: og:image for social shares, single H1 per page');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
