// AI-powered product image mismatch detector
// Compares images within a product listing to flag cases where
// images don't match the actual product (wrong product photos mixed in).
//
// Uses Gemini Flash (cheap) or Claude Sonnet (accurate) for vision analysis.
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { PRICING } from './variant-analyzer.js';

const SONNET_MODEL = 'claude-sonnet-4-5-20250929';
const GEMINI_MODEL = 'gemini-2.0-flash';
const MAX_IMAGES_PER_PRODUCT = 10; // Check more images than variant analysis

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
    if (imgData) {
      downloaded.push({ ...imgData, position: img.position, id: img.id, src: img.src });
    }
  }
  return downloaded;
}

function buildMismatchPrompt(product) {
  const description = stripHtml(product.body_html);

  return `You are a product image quality control system for a smoke shop / head shop (bongs, pipes, rigs, bangers, grinders, carb caps, etc).

PRODUCT INFORMATION:
Title: ${product.title}
Description: ${description.substring(0, 500)}
Tags: ${product.tags || ''}
Number of images provided: ${(product.images || []).length}

YOUR TASK:
Compare ALL the images provided for this single product listing. The FIRST image (Image 1) is considered the "primary" image and is almost always correct. Your job is to determine if any of the OTHER images show a DIFFERENT product than Image 1.

WHAT COUNTS AS A MISMATCH:
- Image 1 shows a carb cap but Image 3 shows a banger/nail - MISMATCH
- Image 1 shows a blue bong but Image 4 shows a completely different style pipe - MISMATCH
- Image 1 shows glass product X but Image 5 shows an unrelated glass product Y - MISMATCH
- Images showing the product from different angles or in different lighting - NOT a mismatch
- Images showing the same product type in different colors (color variants) - NOT a mismatch
- A lifestyle/action shot of the same product - NOT a mismatch
- A close-up detail of the same product - NOT a mismatch
- A size chart or dimensions graphic - NOT a mismatch

ANALYSIS STEPS:
1. Identify what product Image 1 shows (shape, type, category)
2. For each subsequent image, determine if it shows the same product type/category
3. Flag any images that appear to be a completely different product

Respond with ONLY valid JSON (no markdown fences, no explanation outside JSON):
{
  "all_match": true or false,
  "confidence": 0.0 to 1.0,
  "primary_product": "Brief description of what Image 1 shows",
  "total_images_checked": number,
  "mismatched_images": [
    {
      "image_number": number (1-indexed position),
      "description": "What this image actually shows",
      "reason": "Why it doesn't match the primary product"
    }
  ],
  "reasoning": "Brief overall assessment"
}

If all images match, return an empty array for mismatched_images.`;
}

function parseJsonResponse(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in response');
  return JSON.parse(match[0]);
}

function makeSkipResult(product, reasoning, extra = {}) {
  return {
    productId: product.id,
    productTitle: product.title,
    imageCount: (product.images || []).length,
    all_match: true,
    confidence: 0,
    primary_product: null,
    mismatched_images: [],
    reasoning,
    skipped: true,
    usage: null,
    ...extra,
  };
}

function normalizeResult(product, raw, usage, imageData) {
  return {
    productId: product.id,
    productTitle: product.title,
    imageCount: (product.images || []).length,
    all_match: !!raw.all_match,
    confidence: Math.min(1, Math.max(0, Number(raw.confidence) || 0)),
    primary_product: String(raw.primary_product || ''),
    total_images_checked: Number(raw.total_images_checked) || imageData.length,
    mismatched_images: Array.isArray(raw.mismatched_images)
      ? raw.mismatched_images.map(m => ({
          image_number: Number(m.image_number) || 0,
          image_src: imageData[m.image_number - 1]?.src || null,
          description: String(m.description || ''),
          reason: String(m.reason || ''),
        }))
      : [],
    reasoning: String(raw.reasoning || ''),
    usage,
  };
}

// ── Gemini Flash analysis ─────────────────────────────────────────────────────

async function analyzeWithGemini(product, imageData, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const parts = [
    ...imageData.map((img, i) => ([
      { text: `Image ${i + 1}:` },
      { inlineData: { mimeType: img.mediaType, data: img.base64 } },
    ])).flat(),
    { text: buildMismatchPrompt(product) },
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
  return normalizeResult(product, raw, usage, imageData);
}

// ── Sonnet analysis ───────────────────────────────────────────────────────────

async function analyzeWithSonnet(product, imageData, apiKey) {
  const anthropic = new Anthropic({ apiKey });

  const messageContent = [];
  for (let i = 0; i < imageData.length; i++) {
    messageContent.push({ type: 'text', text: `Image ${i + 1}:` });
    messageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: imageData[i].mediaType, data: imageData[i].base64 },
    });
  }
  messageContent.push({ type: 'text', text: buildMismatchPrompt(product) });

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
  return normalizeResult(product, raw, usage, imageData);
}

// ── Main analysis entry point ─────────────────────────────────────────────────

/**
 * Analyze a product's images to detect mismatches.
 *
 * analysisModel option controls which model runs:
 *   'gemini'  (default) - Gemini Flash, cheapest
 *   'sonnet'            - Claude Sonnet, highest accuracy
 */
export async function detectImageMismatches(product, options = {}) {
  const {
    analysisModel = process.env.ANALYSIS_MODEL || 'gemini',
    apiKey = process.env.ANTHROPIC_API_KEY,
    geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  } = options;

  const images = (product.images || []);

  // Need at least 2 images to compare
  if (images.length < 2) {
    return makeSkipResult(product, `Only ${images.length} image(s) - nothing to compare`);
  }

  const imageData = await downloadProductImages(product);
  if (imageData.length < 2) {
    return makeSkipResult(product, `Only ${imageData.length} image(s) downloaded successfully - nothing to compare`);
  }

  // Route to the right model
  if (analysisModel === 'sonnet') {
    return await runSonnetAnalysis(product, imageData, apiKey);
  }

  // Default: Gemini with Sonnet fallback
  return await runGeminiAnalysis(product, imageData, geminiApiKey, apiKey);
}

async function runGeminiAnalysis(product, imageData, geminiKey, anthropicFallbackKey) {
  if (geminiKey) {
    try {
      return await analyzeWithGemini(product, imageData, geminiKey);
    } catch (err) {
      if (anthropicFallbackKey) {
        return await analyzeWithSonnet(product, imageData, anthropicFallbackKey);
      }
      return makeSkipResult(product, `Gemini analysis error: ${err.message}`, { error: true });
    }
  }

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

export default { detectImageMismatches, PRICING };
