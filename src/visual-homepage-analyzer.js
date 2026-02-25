/**
 * Visual Homepage Analyzer — Uses Gemini Flash to visually inspect the live homepage
 *
 * Instead of only checking JSON settings for empty values, this module:
 * 1. Fetches all image URLs referenced in homepage sections
 * 2. Downloads each image from the Shopify CDN
 * 3. Sends them to Gemini Flash with section context for visual analysis
 * 4. Also fetches the rendered homepage HTML for structural analysis
 * 5. Returns a comprehensive list of issues with severity and fix suggestions
 *
 * Works with ANY Shopify theme — not hardcoded to specific section IDs.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_MODEL = 'gemini-2.0-flash';

const PRICING = {
  'gemini-flash': { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
};

// ─── Image helpers ──────────────────────────────────────────────────────────

async function downloadImageAsBase64(url, timeoutMs = 15000) {
  try {
    // Shopify CDN images: try resized version first for bandwidth
    let fetchUrl = url;
    if (url.includes('shopify') || url.includes('cdn.shopify')) {
      fetchUrl = url.replace(/\.([a-z]+)(\?.*)?$/i, '_800x800.$1$2');
    }

    const response = await fetch(fetchUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      // Fallback to original URL
      const fallback = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!fallback.ok) return null;
      const buffer = await fallback.arrayBuffer();
      return {
        base64: Buffer.from(buffer).toString('base64'),
        mediaType: (fallback.headers.get('content-type') || 'image/jpeg').split(';')[0],
        url,
        byteSize: buffer.byteLength,
      };
    }

    const buffer = await response.arrayBuffer();
    return {
      base64: Buffer.from(buffer).toString('base64'),
      mediaType: (response.headers.get('content-type') || 'image/jpeg').split(';')[0],
      url,
      byteSize: buffer.byteLength,
    };
  } catch (err) {
    return null;
  }
}

/**
 * Resolve a Shopify image reference to a CDN URL.
 * Handles both "shopify://shop_images/foo.png" and full CDN URLs.
 */
function resolveImageUrl(imageRef, storeDomain) {
  if (!imageRef || imageRef === '') return null;
  if (imageRef.startsWith('http')) return imageRef;
  if (imageRef.startsWith('shopify://shop_images/')) {
    const filename = imageRef.replace('shopify://shop_images/', '');
    return `https://cdn.shopify.com/s/files/1/0593/5765/7400/files/${filename}`;
  }
  return null;
}

// ─── Section extraction (universal) ─────────────────────────────────────────

/**
 * Extract all images and metadata from any homepage section.
 * This is theme-agnostic — it walks the JSON structure looking for
 * image references, collection handles, titles, links, etc.
 */
function extractSectionAssets(sectionId, section) {
  const assets = {
    sectionId,
    type: section.type || 'unknown',
    title: section.settings?.title || section.settings?.pretext || '',
    images: [],
    collections: [],
    links: [],
    issues: [],
  };

  // Check section-level settings
  const sectionSettings = section.settings || {};
  for (const [key, value] of Object.entries(sectionSettings)) {
    if (typeof value === 'string') {
      if (key.includes('image') || key === 'image') {
        assets.images.push({ key: `settings.${key}`, value, context: 'section' });
      }
      if (key.includes('collection') || key === 'collection' || key === 'feature_collection') {
        assets.collections.push({ key: `settings.${key}`, value, context: 'section' });
      }
      if (key.includes('link') || key.includes('url')) {
        assets.links.push({ key: `settings.${key}`, value, context: 'section' });
      }
    }
  }

  // Check block-level settings
  const blocks = section.blocks || {};
  const blockOrder = section.block_order || Object.keys(blocks);

  for (const blockId of blockOrder) {
    const block = blocks[blockId];
    if (!block) {
      assets.issues.push({
        severity: 'error',
        message: `Block "${blockId}" is in block_order but not defined`,
        context: 'structure',
      });
      continue;
    }

    const blockSettings = block.settings || {};
    for (const [key, value] of Object.entries(blockSettings)) {
      if (typeof value === 'string') {
        if (key.includes('image') || key === 'image') {
          assets.images.push({
            key: `blocks.${blockId}.${key}`,
            value,
            context: block.type || 'block',
            blockTitle: blockSettings.title || blockId,
          });
        }
        if (key.includes('collection') || key === 'collection' || key === 'feature_collection') {
          assets.collections.push({
            key: `blocks.${blockId}.${key}`,
            value,
            context: block.type || 'block',
            blockTitle: blockSettings.title || blockId,
          });
        }
        if (key.includes('link') || key.includes('url')) {
          assets.links.push({
            key: `blocks.${blockId}.${key}`,
            value,
            context: block.type || 'block',
            blockTitle: blockSettings.title || blockId,
          });
        }
      }
    }

    // Check for completely empty block settings (common source of placeholder text)
    const hasContent = Object.values(blockSettings).some(v => v !== '' && v !== false && v != null);
    if (!hasContent) {
      assets.issues.push({
        severity: 'error',
        message: `Block "${blockId}" has completely empty settings — will show placeholder text`,
        context: block.type || 'block',
      });
    }
  }

  // Detect empty images / collections (structural issues)
  for (const img of assets.images) {
    if (!img.value || img.value === '') {
      assets.issues.push({
        severity: 'error',
        message: `Empty image at ${img.key} in "${img.blockTitle || 'section'}" — will show placeholder`,
        context: img.context,
      });
    }
  }

  for (const col of assets.collections) {
    if (!col.value || col.value === '') {
      assets.issues.push({
        severity: 'error',
        message: `Empty collection at ${col.key} in "${col.blockTitle || 'section'}" — will show "COLLECTION TITLE"`,
        context: col.context,
      });
    }
  }

  return assets;
}

// ─── Gemini visual analysis ─────────────────────────────────────────────────

function parseJsonResponse(text) {
  // Try to find JSON in the response
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[1].trim());
  }
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    return JSON.parse(objectMatch[0]);
  }
  throw new Error('No JSON found in Gemini response');
}

/**
 * Analyze a batch of section images with Gemini Flash.
 * Sends images + context and asks for visual quality assessment.
 */
async function analyzeImagesWithGemini(sectionAssets, imageDataMap, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const parts = [];
  const imageContext = [];

  // Add each downloaded image with context
  for (const img of sectionAssets.images) {
    const data = imageDataMap.get(img.value);
    if (!data) continue;

    parts.push(
      { text: `Image for "${img.blockTitle || sectionAssets.title || sectionAssets.type}" section (${img.key}):` },
      { inlineData: { mimeType: data.mediaType, data: data.base64 } },
    );
    imageContext.push({
      key: img.key,
      blockTitle: img.blockTitle || sectionAssets.title,
      sectionType: sectionAssets.type,
    });
  }

  if (parts.length === 0) return [];

  // Add analysis prompt
  parts.push({
    text: `You are analyzing images from a Shopify homepage section (type: "${sectionAssets.type}", title: "${sectionAssets.title || 'untitled'}").

This is a smokeshop/glass pipe e-commerce store (oilslickpad.com). The homepage should show professional product photos of items like glass pipes, bongs, dab rigs, quartz bangers, rolling papers, and accessories.

For each image above, analyze:
1. Is this a real product photo or a stock/placeholder image?
2. Does the image quality match e-commerce standards (good lighting, clear product, white/clean background)?
3. Is the image relevant to a smokeshop store?
4. Are there any issues (too small, blurry, watermarked, wrong product, generic stock photo)?

Respond with JSON:
{
  "images": [
    {
      "key": "${imageContext[0]?.key || 'example'}",
      "is_placeholder": false,
      "is_stock_photo": false,
      "quality_score": 8,
      "relevant_to_store": true,
      "issues": [],
      "description": "Clear product photo of a glass hand pipe"
    }
  ],
  "overall_section_assessment": "Brief assessment of the section's visual quality",
  "suggestions": ["Any improvement suggestions"]
}

Return one entry per image in the "images" array, using the key values: ${imageContext.map(c => c.key).join(', ')}`
  });

  try {
    const result = await model.generateContent(parts);
    const text = result.response.text();
    const meta = result.response.usageMetadata;
    const usage = {
      model: 'gemini-flash',
      inputTokens: meta?.promptTokenCount || 0,
      outputTokens: meta?.candidatesTokenCount || 0,
    };
    usage.cost = usage.inputTokens * PRICING['gemini-flash'].input
      + usage.outputTokens * PRICING['gemini-flash'].output;

    const parsed = parseJsonResponse(text);
    return { ...parsed, usage };
  } catch (err) {
    return { error: err.message, images: [], usage: null };
  }
}

/**
 * Analyze the rendered homepage HTML for structural issues.
 * Fetches the storefront and looks for common problems.
 */
async function analyzeHomepageHtml(storeDomain, apiKey) {
  const url = `https://${storeDomain.replace('.myshopify.com', '.com')}`;
  let html;

  try {
    // Try the public storefront URL first
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HomepageAnalyzer/1.0)' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    html = await response.text();
  } catch {
    try {
      // Fallback to myshopify domain
      const response = await fetch(`https://${storeDomain}`, {
        signal: AbortSignal.timeout(30000),
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HomepageAnalyzer/1.0)' },
      });
      if (!response.ok) return { error: 'Could not fetch homepage HTML' };
      html = await response.text();
    } catch (err) {
      return { error: `Failed to fetch homepage: ${err.message}` };
    }
  }

  // Extract meaningful text content from HTML for analysis
  // (strip scripts, styles, and excessive whitespace)
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Look for obvious placeholder patterns in the HTML
  const placeholderPatterns = [
    { pattern: /COLLECTION TITLE/gi, label: '"COLLECTION TITLE" placeholder text' },
    { pattern: /Collection title/g, label: '"Collection title" placeholder text' },
    { pattern: /Collection list/g, label: '"Collection list" placeholder text' },
    { pattern: /Add description.*mega menu/gi, label: 'Mega menu placeholder text' },
    { pattern: /Subheading/g, label: '"Subheading" placeholder text' },
    { pattern: /Your text/gi, label: '"Your text" placeholder' },
    { pattern: /placeholder\.com/gi, label: 'Placeholder URLs' },
    { pattern: /Lorem ipsum/gi, label: 'Lorem ipsum placeholder text' },
    { pattern: /example\.com/gi, label: 'Example.com placeholder links' },
  ];

  const htmlIssues = [];
  for (const { pattern, label } of placeholderPatterns) {
    const matches = stripped.match(pattern);
    if (matches) {
      htmlIssues.push({
        severity: 'error',
        type: 'placeholder_text',
        message: `Found ${matches.length}x ${label} on live homepage`,
        count: matches.length,
      });
    }
  }

  // Check for broken image references
  const imgSrcMatches = html.match(/src="[^"]*"/g) || [];
  const emptyImages = imgSrcMatches.filter(m => m === 'src=""' || m === 'src="about:blank"');
  if (emptyImages.length > 0) {
    htmlIssues.push({
      severity: 'warning',
      type: 'empty_image_src',
      message: `Found ${emptyImages.length} image elements with empty src`,
      count: emptyImages.length,
    });
  }

  // If we have Gemini access, do a deeper analysis of the HTML content
  if (apiKey && stripped.length > 100) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    // Send a truncated version of the page text for analysis
    const pageText = stripped.substring(0, 8000);

    try {
      const result = await model.generateContent([{
        text: `You are auditing a Shopify e-commerce homepage (oilslickpad.com — a smokeshop selling glass pipes, bongs, dab rigs, and accessories).

Here is the visible text content from the live homepage:

---
${pageText}
---

Analyze this for issues. Look for:
1. Placeholder text that was never customized (e.g., "Collection title", "Your text", "Subheading", template instructions)
2. Broken or inconsistent navigation/links
3. Any text that looks like it belongs to a different business or product category
4. Duplicate or repeated content
5. Missing important sections (no product categories? no collections? no CTA?)
6. Text that references old/outdated business focus (like "extraction" or "packaging" if the store is now smokeshop-focused)
7. SEO issues (missing descriptions, generic titles)

Respond with JSON:
{
  "issues": [
    {
      "severity": "error|warning|info",
      "type": "placeholder|broken_link|wrong_content|duplicate|missing|seo",
      "message": "Description of the issue",
      "location": "Where on the page (e.g., 'hero section', 'navigation', 'footer')",
      "suggestion": "How to fix it"
    }
  ],
  "overall_score": 7,
  "summary": "Brief summary of homepage quality"
}`
      }]);

      const text = result.response.text();
      const meta = result.response.usageMetadata;
      const parsed = parseJsonResponse(text);

      return {
        htmlIssues,
        aiAnalysis: parsed,
        usage: {
          model: 'gemini-flash',
          inputTokens: meta?.promptTokenCount || 0,
          outputTokens: meta?.candidatesTokenCount || 0,
          cost: (meta?.promptTokenCount || 0) * PRICING['gemini-flash'].input
            + (meta?.candidatesTokenCount || 0) * PRICING['gemini-flash'].output,
        },
      };
    } catch (err) {
      return { htmlIssues, aiAnalysis: null, error: `Gemini HTML analysis failed: ${err.message}` };
    }
  }

  return { htmlIssues, aiAnalysis: null };
}

// ─── Main export ────────────────────────────────────────────────────────────

/**
 * Run a full visual analysis of the homepage.
 *
 * @param {object} liveSettings - The parsed settings_data.json from the live theme
 * @param {string} storeDomain - e.g. "oil-slick-pad.myshopify.com"
 * @param {object} options
 * @param {string} options.geminiApiKey - Google API key for Gemini Flash
 * @param {boolean} options.skipHtmlAnalysis - Skip fetching/analyzing the live HTML
 * @param {boolean} options.verbose - Print progress
 * @returns {object} Full analysis report
 */
export async function analyzeHomepageVisually(liveSettings, storeDomain, options = {}) {
  const {
    geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    skipHtmlAnalysis = false,
    verbose = true,
  } = options;

  const report = {
    timestamp: new Date().toISOString(),
    store: storeDomain,
    sections: [],
    htmlAnalysis: null,
    totalIssues: 0,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    totalCost: 0,
    geminiAvailable: !!geminiApiKey,
  };

  const sections = liveSettings.current?.sections || {};
  const contentForIndex = liveSettings.current?.content_for_index || [];

  if (verbose) {
    console.log(`   Scanning ${contentForIndex.length} homepage sections...`);
    if (!geminiApiKey) {
      console.log('   ⚠ No GOOGLE_API_KEY set — visual analysis disabled, structural checks only');
    }
  }

  // Step 1: Extract assets from all homepage sections
  const allAssets = [];
  for (const sectionId of contentForIndex) {
    const section = sections[sectionId];
    if (!section) {
      report.sections.push({
        sectionId,
        type: 'missing',
        issues: [{
          severity: 'error',
          message: `Section "${sectionId}" is in content_for_index but missing from sections`,
          context: 'structure',
        }],
      });
      report.errorCount++;
      continue;
    }
    allAssets.push(extractSectionAssets(sectionId, section));
  }

  // Also check header and footer
  for (const key of ['header', 'footer']) {
    if (sections[key]) {
      allAssets.push(extractSectionAssets(key, sections[key]));
    }
  }

  // Step 2: Collect all unique image URLs and download them
  const imageUrlSet = new Set();
  for (const assets of allAssets) {
    for (const img of assets.images) {
      if (img.value && img.value !== '') {
        imageUrlSet.add(img.value);
      }
    }
  }

  const imageDataMap = new Map();
  if (imageUrlSet.size > 0 && geminiApiKey) {
    if (verbose) console.log(`   Downloading ${imageUrlSet.size} images for visual analysis...`);

    const downloadPromises = [...imageUrlSet].map(async (ref) => {
      const url = resolveImageUrl(ref, storeDomain);
      if (!url) return;
      const data = await downloadImageAsBase64(url);
      if (data) {
        imageDataMap.set(ref, data);
      }
    });

    await Promise.all(downloadPromises);
    if (verbose) console.log(`   ✓ Downloaded ${imageDataMap.size}/${imageUrlSet.size} images`);
  }

  // Step 3: Run Gemini visual analysis on each section's images
  for (const assets of allAssets) {
    const sectionReport = {
      sectionId: assets.sectionId,
      type: assets.type,
      title: assets.title,
      imageCount: assets.images.length,
      collectionCount: assets.collections.length,
      issues: [...assets.issues], // Start with structural issues
      geminiAnalysis: null,
    };

    // Visual analysis with Gemini (if available and section has images)
    if (geminiApiKey && assets.images.filter(i => i.value && imageDataMap.has(i.value)).length > 0) {
      if (verbose) console.log(`   🔍 Analyzing "${assets.title || assets.type}" (${assets.sectionId})...`);

      const geminiResult = await analyzeImagesWithGemini(assets, imageDataMap, geminiApiKey);

      if (geminiResult.error) {
        sectionReport.issues.push({
          severity: 'warning',
          message: `Gemini analysis failed: ${geminiResult.error}`,
          context: 'visual',
        });
      } else {
        sectionReport.geminiAnalysis = geminiResult;

        // Convert Gemini findings to issues
        for (const img of geminiResult.images || []) {
          if (img.is_placeholder) {
            sectionReport.issues.push({
              severity: 'error',
              type: 'placeholder_image',
              message: `Placeholder image at ${img.key}: ${img.description}`,
              context: 'visual',
            });
          }
          if (img.is_stock_photo) {
            sectionReport.issues.push({
              severity: 'warning',
              type: 'stock_photo',
              message: `Stock photo at ${img.key}: ${img.description}`,
              context: 'visual',
            });
          }
          if (img.quality_score != null && img.quality_score < 5) {
            sectionReport.issues.push({
              severity: 'warning',
              type: 'low_quality',
              message: `Low quality image (${img.quality_score}/10) at ${img.key}: ${(img.issues || []).join(', ')}`,
              context: 'visual',
            });
          }
          if (img.relevant_to_store === false) {
            sectionReport.issues.push({
              severity: 'warning',
              type: 'irrelevant_image',
              message: `Image at ${img.key} doesn't match store category: ${img.description}`,
              context: 'visual',
            });
          }
        }

        if (geminiResult.usage) {
          report.totalCost += geminiResult.usage.cost || 0;
        }
      }
    }

    // Tally issues
    for (const issue of sectionReport.issues) {
      if (issue.severity === 'error') report.errorCount++;
      else if (issue.severity === 'warning') report.warningCount++;
      else report.infoCount++;
    }

    report.sections.push(sectionReport);
  }

  // Step 4: Analyze live homepage HTML
  if (!skipHtmlAnalysis) {
    if (verbose) console.log('   🌐 Analyzing live homepage HTML...');
    const htmlResult = await analyzeHomepageHtml(storeDomain, geminiApiKey);
    report.htmlAnalysis = htmlResult;

    // Count HTML issues
    for (const issue of htmlResult.htmlIssues || []) {
      if (issue.severity === 'error') report.errorCount++;
      else if (issue.severity === 'warning') report.warningCount++;
    }

    // Count AI-detected issues
    for (const issue of htmlResult.aiAnalysis?.issues || []) {
      if (issue.severity === 'error') report.errorCount++;
      else if (issue.severity === 'warning') report.warningCount++;
      else report.infoCount++;
    }

    if (htmlResult.usage) {
      report.totalCost += htmlResult.usage.cost || 0;
    }
  }

  report.totalIssues = report.errorCount + report.warningCount + report.infoCount;
  return report;
}

/**
 * Print a human-readable report to the console.
 */
export function printReport(report) {
  console.log('\n' + '═'.repeat(60));
  console.log('  VISUAL HOMEPAGE ANALYSIS REPORT');
  console.log('═'.repeat(60));
  console.log(`  Store: ${report.store}`);
  console.log(`  Time:  ${report.timestamp}`);
  console.log(`  Gemini: ${report.geminiAvailable ? 'enabled' : 'disabled (structural checks only)'}`);
  console.log('─'.repeat(60));

  if (report.totalIssues === 0) {
    console.log('\n  ✓ No issues found! Homepage looks good.');
  } else {
    console.log(`\n  Found ${report.totalIssues} issue(s):`);
    console.log(`    ${report.errorCount} error(s)  |  ${report.warningCount} warning(s)  |  ${report.infoCount} info`);
  }

  // Section-by-section
  for (const section of report.sections) {
    if (section.issues.length === 0 && !section.geminiAnalysis) continue;

    console.log(`\n  ── ${section.type} "${section.title || section.sectionId}" ──`);

    for (const issue of section.issues) {
      const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ';
      console.log(`     ${icon} [${issue.severity.toUpperCase()}] ${issue.message}`);
    }

    if (section.geminiAnalysis?.overall_section_assessment) {
      console.log(`     📊 ${section.geminiAnalysis.overall_section_assessment}`);
    }
    if (section.geminiAnalysis?.suggestions?.length > 0) {
      for (const s of section.geminiAnalysis.suggestions) {
        console.log(`     💡 ${s}`);
      }
    }
  }

  // HTML analysis
  if (report.htmlAnalysis) {
    const ha = report.htmlAnalysis;

    if (ha.htmlIssues?.length > 0) {
      console.log('\n  ── Live HTML Checks ──');
      for (const issue of ha.htmlIssues) {
        const icon = issue.severity === 'error' ? '✗' : '⚠';
        console.log(`     ${icon} ${issue.message}`);
      }
    }

    if (ha.aiAnalysis?.issues?.length > 0) {
      console.log('\n  ── Gemini Content Analysis ──');
      for (const issue of ha.aiAnalysis.issues) {
        const icon = issue.severity === 'error' ? '✗' : issue.severity === 'warning' ? '⚠' : 'ℹ';
        console.log(`     ${icon} [${issue.severity.toUpperCase()}] ${issue.message}`);
        if (issue.location) console.log(`       Location: ${issue.location}`);
        if (issue.suggestion) console.log(`       Fix: ${issue.suggestion}`);
      }

      if (ha.aiAnalysis.overall_score != null) {
        console.log(`\n     Overall Score: ${ha.aiAnalysis.overall_score}/10`);
      }
      if (ha.aiAnalysis.summary) {
        console.log(`     Summary: ${ha.aiAnalysis.summary}`);
      }
    }
  }

  if (report.totalCost > 0) {
    console.log(`\n  ── Cost: $${report.totalCost.toFixed(4)} (Gemini Flash) ──`);
  }

  console.log('\n' + '═'.repeat(60));
}
