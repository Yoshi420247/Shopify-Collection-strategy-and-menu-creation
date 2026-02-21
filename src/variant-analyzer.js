// AI-powered product variant analyzer
// Default: Gemini Flash for both screening and analysis (~$0.50/1000 products)
// Escalates to Sonnet only for low-confidence results
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

const SONNET_MODEL = 'claude-sonnet-4-5-20250929';
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const GEMINI_MODEL = 'gemini-2.0-flash';
const MAX_IMAGES_PER_PRODUCT = 5;

// Per-token pricing (USD) - used for cost tracking in reports
export const PRICING = {
  'gemini-flash': { input: 0.10 / 1_000_000, output: 0.40 / 1_000_000 },
  'haiku':        { input: 1.00 / 1_000_000, output: 5.00 / 1_000_000 },
  'sonnet':       { input: 3.00 / 1_000_000, output: 15.00 / 1_000_000 },
};

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

async function downloadImageAsBase64(url) {
  try {
    const resizedUrl = url.replace(/\.([a-z]+)(\?.*)?$/i, '_800x800.$1$2');
    const response = await fetch(resizedUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
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
    return null;
  }
}

async function downloadProductImages(product) {
  const images = (product.images || []).slice(0, MAX_IMAGES_PER_PRODUCT);
  const downloaded = [];
  for (const img of images) {
    const imgData = await downloadImageAsBase64(img.src);
    if (imgData) downloaded.push(imgData);
  }
  return downloaded;
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

function makeSkipResult(product, reasoning, extra = {}) {
  return {
    productId: product.id,
    productTitle: product.title,
    has_variants: false,
    confidence: 0,
    reasoning,
    detected_variants: { color: null, size: null, style: null },
    item_count: 0,
    variant_source: null,
    skipped: true,
    usage: null,
    ...extra,
  };
}

function normalizeAnalysis(product, raw, usage) {
  return {
    productId: product.id,
    productTitle: product.title,
    has_variants: !!raw.has_variants,
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0)),
    reasoning: String(raw.reasoning || ''),
    detected_variants: {
      color: Array.isArray(raw.detected_variants?.color) ? raw.detected_variants.color : null,
      size: Array.isArray(raw.detected_variants?.size) ? raw.detected_variants.size : null,
      style: Array.isArray(raw.detected_variants?.style) ? raw.detected_variants.style : null,
    },
    item_count: Number(raw.item_count) || 0,
    variant_source: raw.variant_source || null,
    usage,
  };
}

function parseJsonResponse(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in response');
  return JSON.parse(match[0]);
}

// ── Gemini Flash analysis ─────────────────────────────────────────────────────

async function analyzeWithGemini(product, imageData, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const parts = [
    ...imageData.map(img => ({
      inlineData: { mimeType: img.mediaType, data: img.base64 },
    })),
    { text: buildAnalysisPrompt(product) },
  ];

  const result = await model.generateContent(parts);
  const text = result.response.text();
  const meta = result.response.usageMetadata;
  const usage = {
    model: 'gemini-flash',
    inputTokens: meta?.promptTokenCount || 0,
    outputTokens: meta?.candidatesTokenCount || 0,
  };
  usage.cost = usage.inputTokens * PRICING['gemini-flash'].input + usage.outputTokens * PRICING['gemini-flash'].output;

  const raw = parseJsonResponse(text);
  return normalizeAnalysis(product, raw, usage);
}

// ── Sonnet analysis ───────────────────────────────────────────────────────────

async function analyzeWithSonnet(product, imageData, apiKey) {
  const anthropic = new Anthropic({ apiKey });

  const messageContent = [
    ...imageData.map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.base64 },
    })),
    { type: 'text', text: buildAnalysisPrompt(product) },
  ];

  const response = await anthropic.messages.create({
    model: SONNET_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: messageContent }],
  });

  const usage = {
    model: 'sonnet',
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };
  usage.cost = usage.inputTokens * PRICING.sonnet.input + usage.outputTokens * PRICING.sonnet.output;

  const text = response.content[0]?.text || '';
  const raw = parseJsonResponse(text);
  return normalizeAnalysis(product, raw, usage);
}

// ── Main analysis entry point ─────────────────────────────────────────────────

/**
 * Analyze a product to detect variants.
 *
 * analysisModel option controls which model runs:
 *   'gemini'  (default) - Gemini Flash, ~30x cheaper than Sonnet
 *   'sonnet'            - Claude Sonnet, highest accuracy
 *   'auto'              - Gemini first, escalate to Sonnet if confidence < threshold
 */
export async function analyzeProduct(product, options = {}) {
  const {
    analysisModel = process.env.ANALYSIS_MODEL || 'gemini',
    apiKey = process.env.ANTHROPIC_API_KEY,
    geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    confidenceThreshold = 0.7,
    escalationThreshold = 0.6,
  } = options;

  // Download images once, reuse for any model
  const images = (product.images || []).slice(0, MAX_IMAGES_PER_PRODUCT);
  if (images.length === 0) return makeSkipResult(product, 'No images available for analysis');

  const imageData = await downloadProductImages(product);
  if (imageData.length === 0) return makeSkipResult(product, 'All image downloads failed');

  // Route to the right model
  if (analysisModel === 'sonnet') {
    return await runSonnetAnalysis(product, imageData, apiKey);
  }

  if (analysisModel === 'gemini') {
    return await runGeminiAnalysis(product, imageData, geminiApiKey, apiKey);
  }

  // 'auto' mode: Gemini first, escalate low-confidence to Sonnet
  if (analysisModel === 'auto') {
    const geminiResult = await runGeminiAnalysis(product, imageData, geminiApiKey, apiKey);
    if (geminiResult.error || geminiResult.skipped) return geminiResult;

    if (geminiResult.confidence >= escalationThreshold) {
      return geminiResult;
    }

    // Low confidence - escalate to Sonnet for a second opinion
    const sonnetResult = await runSonnetAnalysis(product, imageData, apiKey);
    if (sonnetResult.error) return geminiResult; // Stick with Gemini if Sonnet fails

    // Merge usage: both calls count
    sonnetResult.usage = {
      ...sonnetResult.usage,
      escalatedFrom: geminiResult.usage,
    };
    sonnetResult.reasoning = `[escalated from Gemini] ${sonnetResult.reasoning}`;
    return sonnetResult;
  }

  return makeSkipResult(product, `Unknown analysis model: ${analysisModel}`, { error: true });
}

async function runGeminiAnalysis(product, imageData, geminiKey, anthropicFallbackKey) {
  if (geminiKey) {
    try {
      return await analyzeWithGemini(product, imageData, geminiKey);
    } catch (err) {
      // Fall back to Sonnet if Gemini fails
      if (anthropicFallbackKey) {
        return await analyzeWithSonnet(product, imageData, anthropicFallbackKey);
      }
      return makeSkipResult(product, `Gemini analysis error: ${err.message}`, { error: true });
    }
  }

  // No Gemini key - fall back to Sonnet
  if (anthropicFallbackKey) {
    return await analyzeWithSonnet(product, imageData, anthropicFallbackKey);
  }

  return makeSkipResult(product, 'No API keys available for analysis', { error: true });
}

async function runSonnetAnalysis(product, imageData, apiKey) {
  if (!apiKey) return makeSkipResult(product, 'ANTHROPIC_API_KEY required for Sonnet', { error: true });

  try {
    return await analyzeWithSonnet(product, imageData, apiKey);
  } catch (err) {
    return makeSkipResult(product, `Sonnet analysis error: ${err.message}`, { error: true });
  }
}

// ── Screening ─────────────────────────────────────────────────────────────────

const SCREEN_PROMPT = `How many distinct individual product items are visible in this image? Count only separate physical items of the same type shown in different colors or styles. Do NOT count accessories, backgrounds, or the same item from different angles. Respond with ONLY a JSON object: {"count": <number>, "multiple_colors": true/false}`;

/**
 * Quick screening pass - checks if the main product image shows multiple
 * distinct items. Uses Gemini Flash by default with Haiku fallback.
 */
export async function screenProduct(product, options = {}) {
  const geminiKey = options.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const anthropicKey = options.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!geminiKey && !anthropicKey) {
    throw new Error('Either GEMINI_API_KEY or ANTHROPIC_API_KEY is required for screening');
  }

  const images = (product.images || []);
  if (images.length === 0) {
    return { needsAnalysis: false, reason: 'no images', itemCount: 0, model: 'none', usage: null };
  }

  const imgData = await downloadImageAsBase64(images[0].src);
  if (!imgData) {
    return { needsAnalysis: false, reason: 'image download failed', itemCount: 0, model: 'none', usage: null };
  }

  if (geminiKey) {
    try {
      return await screenWithGemini(imgData, geminiKey);
    } catch (err) {
      if (anthropicKey) return await screenWithHaiku(imgData, anthropicKey);
      return { needsAnalysis: true, reason: `screen error: ${err.message}`, itemCount: 0, model: 'gemini-error', usage: null };
    }
  }

  return await screenWithHaiku(imgData, anthropicKey);
}

async function screenWithGemini(imgData, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const result = await model.generateContent([
    SCREEN_PROMPT,
    { inlineData: { mimeType: imgData.mediaType, data: imgData.base64 } },
  ]);

  const text = result.response.text();
  const meta = result.response.usageMetadata;
  const usage = {
    model: 'gemini-flash',
    inputTokens: meta?.promptTokenCount || 0,
    outputTokens: meta?.candidatesTokenCount || 0,
  };
  usage.cost = usage.inputTokens * PRICING['gemini-flash'].input + usage.outputTokens * PRICING['gemini-flash'].output;

  return parseScreenResponse(text, 'gemini-flash', usage);
}

async function screenWithHaiku(imgData, apiKey) {
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: imgData.mediaType, data: imgData.base64 } },
        { type: 'text', text: SCREEN_PROMPT },
      ],
    }],
  });

  const text = response.content[0]?.text || '';
  const usage = {
    model: 'haiku',
    inputTokens: response.usage?.input_tokens || 0,
    outputTokens: response.usage?.output_tokens || 0,
  };
  usage.cost = usage.inputTokens * PRICING.haiku.input + usage.outputTokens * PRICING.haiku.output;

  return parseScreenResponse(text, 'haiku', usage);
}

function parseScreenResponse(text, modelUsed, usage) {
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    const parsed = JSON.parse(match[0]);
    const count = Number(parsed.count) || 1;
    const multiColor = !!parsed.multiple_colors;
    return {
      needsAnalysis: count > 1 || multiColor,
      reason: count > 1 ? `${count} items detected` : 'single item',
      itemCount: count,
      model: modelUsed,
      usage,
    };
  }
  return { needsAnalysis: true, reason: 'screen parse failed', itemCount: 0, model: modelUsed, usage };
}

// ── Pre-filter ────────────────────────────────────────────────────────────────

export function productAlreadyHasColorVariants(product) {
  const variants = product.variants || [];
  if (variants.length <= 1) return false;

  const options = product.options || [];
  const colorOption = options.find(o => /^colou?r$/i.test(o.name));
  if (!colorOption) return false;

  return colorOption.values.length >= 2;
}

export default { analyzeProduct, screenProduct, productAlreadyHasColorVariants, PRICING };
