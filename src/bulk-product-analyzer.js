// Gemini Flash-powered bulk/wholesale product detector
// Analyzes product images and text to identify bulk/wholesale items
// that should be removed from retail collections and kept only in wholesale.
//
// Uses a two-pass approach:
//   1. Text heuristics (free) - catches obvious bulk keywords in title/description
//   2. Gemini Flash vision (cheap) - analyzes product images for bulk packaging cues
//
// Cost optimization: ~$0.0001-0.0003 per product with Gemini 2.0 Flash

import { GoogleGenerativeAI } from '@google/generative-ai';
import { PRICING } from './variant-analyzer.js';

const GEMINI_MODEL = 'gemini-2.0-flash';
const MAX_IMAGES = 3; // Only need a few images to detect bulk packaging

// ── Text-based bulk detection (free, fast) ──────────────────────────────────

const BULK_KEYWORDS = [
  // Quantity indicators
  /\b(\d+)\s*(pack|pk|pcs?|pieces?|count|ct|units?|set of|box of|case of)\b/i,
  /\b(case|carton|box|pallet|master\s*case)\b/i,
  /\b(bulk|wholesale|resale|reseller|retail\s*pack)\b/i,
  /\b(gross|dozen|doz)\b/i,
  /\b(display|counter\s*display|floor\s*display|pdq|shipper)\b/i,
  // Large quantity numbers in title (e.g., "100 Rolling Papers" but not "14mm")
  /\b([5-9]\d|[1-9]\d{2,})\s*(rolling|papers?|cones?|tips?|filters?|tubes?|bags?|jars?|containers?|wraps?|blunts?)\b/i,
  // Multi-unit packaging
  /\b(multi[\s-]?pack|variety[\s-]?pack|assorted[\s-]?pack|combo[\s-]?pack)\b/i,
  // "per case" / "per box" pricing language
  /\bper\s*(case|box|carton|unit)\b/i,
  // Inner pack / master pack
  /\b(inner[\s-]?pack|master[\s-]?pack|shelf[\s-]?ready)\b/i,
];

// Keywords that strongly suggest NOT bulk (override)
const NOT_BULK_KEYWORDS = [
  /\b(single|individual|one|1)\s*(piece|unit|item)\b/i,
  /\bsample\b/i,
];

/**
 * Score a product based on text analysis alone.
 * Returns { score: 0-1, signals: string[], isBulk: boolean }
 */
export function analyzeTextForBulk(product) {
  const title = (product.title || '').toLowerCase();
  const description = stripHtml(product.body_html || '').toLowerCase();
  const tags = (product.tags || '').toLowerCase();
  const combined = `${title} ${description} ${tags}`;

  const signals = [];
  let score = 0;

  // Check for bulk keywords
  for (const pattern of BULK_KEYWORDS) {
    const titleMatch = title.match(pattern);
    const descMatch = description.match(pattern);

    if (titleMatch) {
      signals.push(`Title match: "${titleMatch[0]}"`);
      score += 0.35; // Title matches are strong signals
    }
    if (descMatch && !titleMatch) {
      signals.push(`Description match: "${descMatch[0]}"`);
      score += 0.15; // Description matches are weaker
    }
  }

  // Check tags for wholesale indicators
  if (tags.includes('wholesale') || tags.includes('bulk')) {
    signals.push(`Tag: already tagged wholesale/bulk`);
    score += 0.4;
  }

  // Check for anti-bulk signals
  for (const pattern of NOT_BULK_KEYWORDS) {
    if (combined.match(pattern)) {
      signals.push(`Anti-bulk signal: "${combined.match(pattern)[0]}"`);
      score -= 0.3;
    }
  }

  // High price with high quantity in variants = bulk packaging
  const variants = product.variants || [];
  if (variants.length > 0) {
    const maxPrice = Math.max(...variants.map(v => parseFloat(v.price) || 0));
    if (maxPrice > 50 && signals.length > 0) {
      signals.push(`High price point ($${maxPrice}) with bulk signals`);
      score += 0.1;
    }
  }

  score = Math.min(1, Math.max(0, score));

  return {
    score,
    signals,
    isBulk: score >= 0.5,
  };
}

// ── Gemini Flash vision analysis ────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, ' ').replace(/&[^;]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

async function downloadImageAsBase64(url) {
  try {
    // Use Shopify's CDN resizing to reduce bandwidth cost
    const resizedUrl = url.replace(/\.([a-z]+)(\?.*)?$/i, '_600x600.$1$2');
    const response = await fetch(resizedUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      const fallback = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!fallback.ok) return null;
      const buffer = await fallback.arrayBuffer();
      return {
        base64: Buffer.from(buffer).toString('base64'),
        mediaType: (fallback.headers.get('content-type') || 'image/jpeg').split(';')[0],
      };
    }
    const buffer = await response.arrayBuffer();
    return {
      base64: Buffer.from(buffer).toString('base64'),
      mediaType: (response.headers.get('content-type') || 'image/jpeg').split(';')[0],
    };
  } catch {
    return null;
  }
}

function buildBulkDetectionPrompt(product, textAnalysis) {
  const description = stripHtml(product.body_html).substring(0, 400);

  return `You are a product packaging analyst for a smoke shop/head shop e-commerce store.

PRODUCT INFO:
Title: ${product.title}
Description: ${description}
Price: $${product.variants?.[0]?.price || 'unknown'}
Tags: ${product.tags || 'none'}

TEXT ANALYSIS SIGNALS: ${textAnalysis.signals.length > 0 ? textAnalysis.signals.join('; ') : 'none detected'}

YOUR TASK:
Examine the product image(s) and determine if this is a BULK/WHOLESALE product - meaning it's packaged for resale or contains multiple units intended for retailers, NOT individual consumers.

BULK INDICATORS (look for these in images):
- Multiple identical items packaged together (cases, boxes, display units)
- Counter display boxes / point-of-purchase displays (PDQ)
- Shrink-wrapped multi-packs
- Master case packaging (cardboard shipping boxes with quantity labels)
- Inner pack quantities visible on packaging
- UPC/barcode sheets or wholesale pricing stickers
- Large quantity of identical small items (e.g., 50 lighters in a tray, 24-pack of papers)
- Products clearly photographed in a warehouse/wholesale setting

NOT BULK (do NOT flag these):
- Single retail products even if expensive
- Products that come as a "set" (e.g., dab tool set) - these are retail sets
- Products with multiple color variants shown
- A single product photographed from multiple angles
- Products that include accessories (bong + bowl + downstem)
- Multi-packs clearly for consumer end use (e.g., 3-pack of screens for $5)

Respond with ONLY valid JSON (no markdown fences):
{
  "is_bulk": true or false,
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief 1-2 sentence explanation",
  "bulk_signals": ["signal1", "signal2"],
  "estimated_unit_count": number or null,
  "packaging_type": "display_box" | "case" | "multi_pack" | "master_case" | "inner_pack" | "single_retail" | "unknown"
}`;
}

function parseJsonResponse(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in response');
  return JSON.parse(match[0]);
}

/**
 * Analyze a product with Gemini Flash vision to detect bulk packaging.
 */
export async function analyzeWithVision(product, options = {}) {
  const {
    geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    textAnalysis = analyzeTextForBulk(product),
  } = options;

  if (!geminiApiKey) {
    return {
      productId: product.id,
      productTitle: product.title,
      visionAnalyzed: false,
      error: 'No GOOGLE_API_KEY available',
      textAnalysis,
    };
  }

  const images = (product.images || []).slice(0, MAX_IMAGES);
  if (images.length === 0) {
    return {
      productId: product.id,
      productTitle: product.title,
      visionAnalyzed: false,
      error: 'No images available',
      textAnalysis,
    };
  }

  // Download images
  const imageData = [];
  for (const img of images) {
    const data = await downloadImageAsBase64(img.src);
    if (data) imageData.push(data);
  }

  if (imageData.length === 0) {
    return {
      productId: product.id,
      productTitle: product.title,
      visionAnalyzed: false,
      error: 'Failed to download images',
      textAnalysis,
    };
  }

  // Call Gemini Flash
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const parts = [
    ...imageData.map((img, i) => ([
      { text: `Image ${i + 1}:` },
      { inlineData: { mimeType: img.mediaType, data: img.base64 } },
    ])).flat(),
    { text: buildBulkDetectionPrompt(product, textAnalysis) },
  ];

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

  const raw = parseJsonResponse(text);

  return {
    productId: product.id,
    productTitle: product.title,
    visionAnalyzed: true,
    is_bulk: !!raw.is_bulk,
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0)),
    reasoning: String(raw.reasoning || ''),
    bulk_signals: Array.isArray(raw.bulk_signals) ? raw.bulk_signals : [],
    estimated_unit_count: raw.estimated_unit_count || null,
    packaging_type: String(raw.packaging_type || 'unknown'),
    textAnalysis,
    usage,
  };
}

// ── Combined analysis (text + vision) ───────────────────────────────────────

/**
 * Full bulk detection pipeline.
 *
 * Strategy for cost optimization:
 *  1. Run free text analysis first
 *  2. If text score >= 0.7 (very likely bulk) - skip vision, mark as bulk
 *  3. If text score <= 0.1 (very unlikely bulk) - skip vision, mark as not bulk
 *  4. Otherwise - use Gemini Flash vision for confirmation
 *
 * @param {object} product - Shopify product object
 * @param {object} options
 * @param {string} options.geminiApiKey
 * @param {boolean} options.forceVision - Always run vision analysis
 * @param {number} options.textOnlyThresholdHigh - Skip vision above this text score (default 0.7)
 * @param {number} options.textOnlyThresholdLow - Skip vision below this text score (default 0.1)
 * @returns {object} Analysis result with isBulk, combinedScore, etc.
 */
export async function detectBulkProduct(product, options = {}) {
  const {
    geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    forceVision = false,
    textOnlyThresholdHigh = 0.7,
    textOnlyThresholdLow = 0.1,
  } = options;

  // Step 1: Free text analysis
  const textResult = analyzeTextForBulk(product);

  // Step 2: Decide if we need vision
  if (!forceVision) {
    if (textResult.score >= textOnlyThresholdHigh) {
      return {
        productId: product.id,
        productTitle: product.title,
        isBulk: true,
        combinedScore: textResult.score,
        method: 'text-only-high-confidence',
        textAnalysis: textResult,
        visionAnalysis: null,
        usage: null,
      };
    }

    if (textResult.score <= textOnlyThresholdLow) {
      return {
        productId: product.id,
        productTitle: product.title,
        isBulk: false,
        combinedScore: textResult.score,
        method: 'text-only-low-confidence',
        textAnalysis: textResult,
        visionAnalysis: null,
        usage: null,
      };
    }
  }

  // Step 3: Vision analysis for ambiguous cases (or if forced)
  try {
    const visionResult = await analyzeWithVision(product, { geminiApiKey, textAnalysis: textResult });

    if (!visionResult.visionAnalyzed) {
      // Vision failed, fall back to text-only
      return {
        productId: product.id,
        productTitle: product.title,
        isBulk: textResult.isBulk,
        combinedScore: textResult.score,
        method: 'text-only-vision-unavailable',
        textAnalysis: textResult,
        visionAnalysis: visionResult,
        usage: null,
      };
    }

    // Combine text + vision scores
    const textWeight = 0.35;
    const visionWeight = 0.65;
    const combinedScore = (textResult.score * textWeight) + (visionResult.confidence * (visionResult.is_bulk ? 1 : 0) * visionWeight);

    return {
      productId: product.id,
      productTitle: product.title,
      isBulk: combinedScore >= 0.45 || (visionResult.is_bulk && visionResult.confidence >= 0.7),
      combinedScore,
      method: 'text+vision',
      textAnalysis: textResult,
      visionAnalysis: {
        is_bulk: visionResult.is_bulk,
        confidence: visionResult.confidence,
        reasoning: visionResult.reasoning,
        bulk_signals: visionResult.bulk_signals,
        estimated_unit_count: visionResult.estimated_unit_count,
        packaging_type: visionResult.packaging_type,
      },
      usage: visionResult.usage,
    };
  } catch (err) {
    return {
      productId: product.id,
      productTitle: product.title,
      isBulk: textResult.isBulk,
      combinedScore: textResult.score,
      method: 'text-only-vision-error',
      textAnalysis: textResult,
      visionAnalysis: null,
      error: err.message,
      usage: null,
    };
  }
}

export default { detectBulkProduct, analyzeTextForBulk, analyzeWithVision };
