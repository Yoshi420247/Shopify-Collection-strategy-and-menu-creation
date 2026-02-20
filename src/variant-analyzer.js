// AI-powered product variant analyzer using Claude Vision
// Analyzes product images and text to detect color, size, and style variants
import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';
const SCREENING_MODEL = 'claude-haiku-4-5-20251001';
const MAX_IMAGES_PER_PRODUCT = 5;
const AI_RATE_LIMIT_MS = 1200; // ~50 requests/minute

let lastAiRequestTime = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function aiRateLimit() {
  const now = Date.now();
  const elapsed = now - lastAiRequestTime;
  if (elapsed < AI_RATE_LIMIT_MS) {
    await sleep(AI_RATE_LIMIT_MS - elapsed);
  }
  lastAiRequestTime = Date.now();
}

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

async function downloadImageAsBase64(url) {
  try {
    // Use Shopify's image resize to keep tokens reasonable (~800px)
    const resizedUrl = url.replace(/\.([a-z]+)(\?.*)?$/i, '_800x800.$1$2');
    const response = await fetch(resizedUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      // Fallback to original URL
      const fallback = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!fallback.ok) return null;
      const buffer = await fallback.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      const contentType = fallback.headers.get('content-type') || 'image/jpeg';
      return { base64, mediaType: contentType.split(';')[0] };
    }
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    return { base64, mediaType: contentType.split(';')[0] };
  } catch (err) {
    console.log(`    Warning: Failed to download image: ${err.message}`);
    return null;
  }
}

function buildAnalysisPrompt(product) {
  const description = stripHtml(product.body_html);
  const tags = product.tags || '';
  const currentVariants = (product.variants || []).map(v => ({
    title: v.title,
    option1: v.option1,
    option2: v.option2,
    option3: v.option3,
    price: v.price,
    sku: v.sku,
  }));

  return `You are a product variant detection system for a smoke shop / head shop (bongs, pipes, rigs, bangers, grinders, etc). Analyze the product images and metadata to determine if this product should have multiple variants.

PRODUCT INFORMATION:
Title: ${product.title}
Description: ${description.substring(0, 500)}
Tags: ${tags}
Price: $${product.variants?.[0]?.price || 'N/A'}
Current variants: ${JSON.stringify(currentVariants)}

ANALYSIS INSTRUCTIONS:

1. EXAMINE THE IMAGES CAREFULLY:
   - Count distinct individual items shown in the images
   - Are they the same product in different COLORS? (Most common for this shop)
   - Are there different SIZES shown or mentioned?
   - Are there different STYLES or designs?

2. COLOR DETECTION (primary focus):
   - Group photos showing 3+ colors of one pipe/rig/bong are VERY common in this shop
   - The same product shape/design shown in multiple colors = color variants
   - Name each color clearly: Red, Blue, Green, Clear, Black, White, Pink, Purple, Orange, Yellow, Amber, Teal, Gold, Silver, Rainbow, Smoke Gray, Light Blue, Dark Blue, Neon Green, etc.
   - A single item shown from multiple ANGLES is NOT multiple variants
   - Look at the background layout: items arranged in a row/grid = variants

3. SIZE DETECTION:
   - Only flag if clearly different sizes of the same product are shown or described
   - Look for size labels in images or text (e.g., "6 inch", "8 inch", "14mm", "Small/Large")

4. STYLE DETECTION:
   - Different design patterns on the same base product (e.g., straight vs bent neck)
   - Different configurations of the same base product

CRITICAL RULES:
- One product photographed from multiple angles is NOT multiple variants
- Only include variant types you are genuinely confident about
- If the title or description explicitly mentions colors/sizes, trust that information
- Accessories shown alongside the product (bowls, tools) are NOT variants
- If unsure, set confidence lower and explain your uncertainty
- Products already having the correct variants should still be reported

Respond with ONLY valid JSON (no markdown fences, no explanation outside JSON):
{
  "has_variants": true or false,
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of what you see",
  "detected_variants": {
    "color": ["Color1", "Color2"] or null,
    "size": ["Size1", "Size2"] or null,
    "style": ["Style1", "Style2"] or null
  },
  "item_count": number,
  "variant_source": "image" or "text" or "both"
}`;
}

/**
 * Analyze a product's images and text to detect variants using Claude Vision.
 * @param {Object} product - Shopify product object (must include images array)
 * @param {Object} options - { model, apiKey, confidenceThreshold }
 * @returns {Object} Analysis result with detected variants
 */
export async function analyzeProduct(product, options = {}) {
  const {
    model = process.env.CLAUDE_MODEL || DEFAULT_MODEL,
    apiKey = process.env.ANTHROPIC_API_KEY,
  } = options;

  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  const anthropic = new Anthropic({ apiKey });

  // Prepare images
  const images = (product.images || []).slice(0, MAX_IMAGES_PER_PRODUCT);
  if (images.length === 0) {
    return {
      productId: product.id,
      productTitle: product.title,
      has_variants: false,
      confidence: 0,
      reasoning: 'No images available for analysis',
      detected_variants: { color: null, size: null, style: null },
      item_count: 0,
      variant_source: null,
      skipped: true,
    };
  }

  // Download images as base64
  console.log(`    Downloading ${images.length} image(s)...`);
  const imageContents = [];
  for (const img of images) {
    const imgData = await downloadImageAsBase64(img.src);
    if (imgData) {
      imageContents.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: imgData.mediaType,
          data: imgData.base64,
        },
      });
    }
  }

  if (imageContents.length === 0) {
    return {
      productId: product.id,
      productTitle: product.title,
      has_variants: false,
      confidence: 0,
      reasoning: 'All image downloads failed',
      detected_variants: { color: null, size: null, style: null },
      item_count: 0,
      variant_source: null,
      skipped: true,
    };
  }

  // Build message content: images first, then analysis prompt
  const messageContent = [
    ...imageContents,
    { type: 'text', text: buildAnalysisPrompt(product) },
  ];

  // Rate limit Claude API calls
  await aiRateLimit();

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      messages: [{ role: 'user', content: messageContent }],
    });

    const responseText = response.content[0]?.text || '';

    // Parse JSON response (handle potential markdown code fences)
    let analysis;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found in response');
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.log(`    Warning: Failed to parse AI response: ${parseErr.message}`);
      console.log(`    Raw response: ${responseText.substring(0, 300)}`);
      return {
        productId: product.id,
        productTitle: product.title,
        has_variants: false,
        confidence: 0,
        reasoning: `AI response parse error: ${parseErr.message}`,
        detected_variants: { color: null, size: null, style: null },
        item_count: 0,
        variant_source: null,
        error: true,
      };
    }

    // Normalize and validate the response
    return {
      productId: product.id,
      productTitle: product.title,
      has_variants: !!analysis.has_variants,
      confidence: Math.min(1, Math.max(0, Number(analysis.confidence) || 0)),
      reasoning: String(analysis.reasoning || ''),
      detected_variants: {
        color: Array.isArray(analysis.detected_variants?.color) ? analysis.detected_variants.color : null,
        size: Array.isArray(analysis.detected_variants?.size) ? analysis.detected_variants.size : null,
        style: Array.isArray(analysis.detected_variants?.style) ? analysis.detected_variants.style : null,
      },
      item_count: Number(analysis.item_count) || 0,
      variant_source: analysis.variant_source || null,
    };
  } catch (err) {
    console.log(`    Error calling Claude API: ${err.message}`);
    return {
      productId: product.id,
      productTitle: product.title,
      has_variants: false,
      confidence: 0,
      reasoning: `API error: ${err.message}`,
      detected_variants: { color: null, size: null, style: null },
      item_count: 0,
      variant_source: null,
      error: true,
    };
  }
}

/**
 * Quick screening pass using Haiku — checks if the main product image shows
 * multiple distinct items (suggesting color/style variants). ~12x cheaper than
 * a full Sonnet analysis. Returns true if the product likely has variants.
 */
export async function screenProduct(product, options = {}) {
  const {
    apiKey = process.env.ANTHROPIC_API_KEY,
  } = options;

  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

  const images = (product.images || []);
  if (images.length === 0) {
    return { needsAnalysis: false, reason: 'no images', itemCount: 0 };
  }

  // Download only the FIRST image (main product photo)
  const imgData = await downloadImageAsBase64(images[0].src);
  if (!imgData) {
    return { needsAnalysis: false, reason: 'image download failed', itemCount: 0 };
  }

  const anthropic = new Anthropic({ apiKey });
  await aiRateLimit();

  try {
    const response = await anthropic.messages.create({
      model: SCREENING_MODEL,
      max_tokens: 150,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: imgData.mediaType, data: imgData.base64 },
          },
          {
            type: 'text',
            text: `How many distinct individual product items are visible in this image? Count only separate physical items of the same type shown in different colors or styles. Do NOT count accessories, backgrounds, or the same item from different angles. Respond with ONLY a JSON object: {"count": <number>, "multiple_colors": true/false}`,
          },
        ],
      }],
    });

    const text = response.content[0]?.text || '';
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const count = Number(parsed.count) || 1;
      const multiColor = !!parsed.multiple_colors;
      return {
        needsAnalysis: count > 1 || multiColor,
        reason: count > 1 ? `${count} items detected` : 'single item',
        itemCount: count,
      };
    }
    // Couldn't parse — be safe, send to full analysis
    return { needsAnalysis: true, reason: 'screen parse failed', itemCount: 0 };
  } catch (err) {
    // On error, be safe — send to full analysis
    return { needsAnalysis: true, reason: `screen error: ${err.message}`, itemCount: 0 };
  }
}

/**
 * Pre-filter check: does this product already have properly named color variants?
 * If so, it likely doesn't need AI analysis.
 */
export function productAlreadyHasColorVariants(product) {
  const variants = product.variants || [];
  if (variants.length <= 1) return false;

  const options = product.options || [];
  const colorOption = options.find(o => /^colou?r$/i.test(o.name));
  if (!colorOption) return false;

  // Has a "Color" option with 2+ values — probably already set up
  return colorOption.values.length >= 2;
}

export default { analyzeProduct, screenProduct, productAlreadyHasColorVariants };
