// AI-powered product matcher: maps WooCommerce products to Shopify products
// Uses Gemini Flash for fast, low-cost fuzzy title matching
import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getAllWcProducts, extractStockInfo } from './woocommerce-client.js';
import { paginateAll } from './shopify-api.js';
import fs from 'fs';
import path from 'path';

const MAPPING_FILE = path.join(process.cwd(), 'product-mapping.json');
const REVIEW_FILE = path.join(process.cwd(), 'product-mapping-review.json');

// ── Gemini Flash setup ─────────────────────────────────────────────────
function getGeminiModel() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set in .env');
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
}

// ── Load / save mappings ───────────────────────────────────────────────
export function loadMapping() {
  if (fs.existsSync(MAPPING_FILE)) {
    return JSON.parse(fs.readFileSync(MAPPING_FILE, 'utf8'));
  }
  return { mappings: [], unmatchedWc: [], unmatchedShopify: [], lastUpdated: null };
}

export function saveMapping(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(MAPPING_FILE, JSON.stringify(data, null, 2));
  console.log(`Mapping saved to ${MAPPING_FILE} (${data.mappings.length} pairs)`);
}

function saveReview(data) {
  fs.writeFileSync(REVIEW_FILE, JSON.stringify(data, null, 2));
  console.log(`\nReview file saved to ${REVIEW_FILE}`);
  console.log('Edit this file to approve/reject matches, then run with --approve-review');
}

// ── Fetch products from both platforms ─────────────────────────────────
async function fetchShopifyProducts() {
  console.log('Fetching all products from Shopify...');
  const products = await paginateAll('products.json', 'products', {
    limit: 250,
    fields: 'id,title,status,variants,vendor,product_type,tags',
  });
  console.log(`Fetched ${products.length} Shopify products.`);
  return products;
}

async function fetchWcProducts() {
  const wcRaw = await getAllWcProducts();
  return wcRaw.map(extractStockInfo);
}

// ── AI matching via Gemini Flash ───────────────────────────────────────
// We send batches of WC product names + Shopify product names to Gemini
// and ask it to return the best matches as JSON.
async function matchProductsBatch(wcProducts, shopifyProducts, model) {
  // Build compact lists for the prompt
  const wcList = wcProducts.map((p, i) => `${i}: ${p.name}`).join('\n');
  const shopifyList = shopifyProducts.map((p, i) => `${i}: ${p.title}`).join('\n');

  const prompt = `You are a product matching assistant for a smokeshop/headshop.
Match products from a wholesaler's catalog (WC list) to a retailer's Shopify catalog (Shopify list).
Products may have slightly different names but refer to the same item.

Rules:
- Match by product name similarity. Titles may differ in casing, abbreviations, extra descriptors, or brand formatting.
- Only match products you are confident are the same item (>80% confidence).
- Each WC product should match at most ONE Shopify product, and vice versa.
- If no good match exists, leave the WC product unmatched.

WC PRODUCTS:
${wcList}

SHOPIFY PRODUCTS:
${shopifyList}

Return ONLY a JSON array of match objects. Each object must have:
- "wc_index": number (index from WC list)
- "shopify_index": number (index from Shopify list)
- "confidence": number 0-100 (how confident the match is)
- "reason": string (brief explanation)

If a WC product has no match, do NOT include it. Return valid JSON only, no markdown.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Parse JSON from response (handle possible markdown code fences)
  const jsonStr = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
  try {
    return JSON.parse(jsonStr);
  } catch {
    console.error('Failed to parse Gemini response as JSON:', text.substring(0, 500));
    return [];
  }
}

// Process in batches to stay within Gemini context limits
async function runAiMatching(wcProducts, shopifyProducts) {
  const model = getGeminiModel();
  const BATCH_SIZE = 50; // 50 WC products per batch, matched against all Shopify products
  const allMatches = [];

  // If Shopify catalog is very large, chunk it too
  const SHOPIFY_CHUNK_SIZE = 200;
  const shopifyChunks = [];
  for (let i = 0; i < shopifyProducts.length; i += SHOPIFY_CHUNK_SIZE) {
    shopifyChunks.push(shopifyProducts.slice(i, i + SHOPIFY_CHUNK_SIZE));
  }

  for (let wcStart = 0; wcStart < wcProducts.length; wcStart += BATCH_SIZE) {
    const wcBatch = wcProducts.slice(wcStart, wcStart + BATCH_SIZE);
    console.log(`\nMatching WC products ${wcStart + 1}-${wcStart + wcBatch.length} of ${wcProducts.length}...`);

    for (let chunkIdx = 0; chunkIdx < shopifyChunks.length; chunkIdx++) {
      const shopifyChunk = shopifyChunks[chunkIdx];
      const shopifyOffset = chunkIdx * SHOPIFY_CHUNK_SIZE;

      try {
        const matches = await matchProductsBatch(wcBatch, shopifyChunk, model);

        // Remap indices to global indices
        for (const match of matches) {
          allMatches.push({
            wc_index: wcStart + match.wc_index,
            shopify_index: shopifyOffset + match.shopify_index,
            confidence: match.confidence,
            reason: match.reason,
          });
        }

        console.log(`  Found ${matches.length} matches in Shopify chunk ${chunkIdx + 1}/${shopifyChunks.length}`);
      } catch (error) {
        console.error(`  Gemini batch error: ${error.message}`);
      }

      // Brief pause between API calls
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return allMatches;
}

// Deduplicate: if multiple WC products match the same Shopify product, keep highest confidence
function deduplicateMatches(matches) {
  // Group by shopify_index, keep highest confidence
  const byShopify = new Map();
  for (const m of matches) {
    const existing = byShopify.get(m.shopify_index);
    if (!existing || m.confidence > existing.confidence) {
      byShopify.set(m.shopify_index, m);
    }
  }

  // Group by wc_index, keep highest confidence
  const byWc = new Map();
  for (const m of byShopify.values()) {
    const existing = byWc.get(m.wc_index);
    if (!existing || m.confidence > existing.confidence) {
      byWc.set(m.wc_index, m);
    }
  }

  return Array.from(byWc.values());
}

// ── Main match command ─────────────────────────────────────────────────
export async function runProductMatching(options = {}) {
  const { reviewMode = false, forceRematch = false } = options;

  // Load existing mapping (to preserve approved matches)
  const existing = loadMapping();
  if (!forceRematch && existing.mappings.length > 0) {
    console.log(`Existing mapping has ${existing.mappings.length} product pairs.`);
    console.log('Use --force-rematch to re-run AI matching from scratch.');
    console.log('Use --sync to run the stock sync using the current mapping.');
    return existing;
  }

  // Fetch products from both platforms
  const [wcProducts, shopifyProducts] = await Promise.all([
    fetchWcProducts(),
    fetchShopifyProducts(),
  ]);

  console.log(`\nWooCommerce: ${wcProducts.length} products`);
  console.log(`Shopify: ${shopifyProducts.length} products`);

  // Run AI matching
  console.log('\nRunning AI product matching with Gemini Flash...');
  const rawMatches = await runAiMatching(wcProducts, shopifyProducts);
  const matches = deduplicateMatches(rawMatches);
  console.log(`\nTotal unique matches: ${matches.length}`);

  // Build the mapping data
  const mappings = matches.map(m => ({
    wc_id: wcProducts[m.wc_index].id,
    wc_name: wcProducts[m.wc_index].name,
    wc_sku: wcProducts[m.wc_index].sku,
    shopify_id: shopifyProducts[m.shopify_index].id,
    shopify_title: shopifyProducts[m.shopify_index].title,
    shopify_status: shopifyProducts[m.shopify_index].status,
    confidence: m.confidence,
    reason: m.reason,
    approved: reviewMode ? null : true, // null = pending review
  }));

  // Find unmatched products
  const matchedWcIds = new Set(mappings.map(m => m.wc_id));
  const matchedShopifyIds = new Set(mappings.map(m => m.shopify_id));
  const unmatchedWc = wcProducts.filter(p => !matchedWcIds.has(p.id)).map(p => ({
    id: p.id, name: p.name, sku: p.sku,
  }));
  const unmatchedShopify = shopifyProducts.filter(p => !matchedShopifyIds.has(p.id)).map(p => ({
    id: p.id, title: p.title, vendor: p.vendor,
  }));

  const mappingData = { mappings, unmatchedWc, unmatchedShopify, lastUpdated: null };

  if (reviewMode) {
    // Save as review file — user approves/rejects before activating
    saveReview(mappingData);
    console.log('\n=== REVIEW MODE ===');
    console.log(`${mappings.length} matches found. Review them in: ${REVIEW_FILE}`);
    console.log('Set "approved": true for matches you want to keep.');
    console.log('Set "approved": false for incorrect matches.');
    console.log('Then run: npm run wholesaler:approve-review');
  } else {
    // Auto-match mode — save directly
    saveMapping(mappingData);
    console.log(`\n${mappings.length} products matched and saved.`);
    console.log(`${unmatchedWc.length} WooCommerce products had no match.`);
    console.log(`${unmatchedShopify.length} Shopify products had no match.`);
  }

  // Print summary table
  console.log('\n── Match Summary ──────────────────────────────────────────');
  for (const m of mappings.slice(0, 20)) {
    const conf = `${m.confidence}%`.padStart(4);
    console.log(`  [${conf}] WC: "${m.wc_name}" → Shopify: "${m.shopify_title}"`);
  }
  if (mappings.length > 20) {
    console.log(`  ... and ${mappings.length - 20} more matches`);
  }

  return mappingData;
}

// ── Approve review file ────────────────────────────────────────────────
export function approveReview() {
  if (!fs.existsSync(REVIEW_FILE)) {
    console.error(`No review file found at ${REVIEW_FILE}`);
    console.error('Run matching in review mode first: npm run wholesaler:match-review');
    process.exit(1);
  }

  const review = JSON.parse(fs.readFileSync(REVIEW_FILE, 'utf8'));
  const approved = review.mappings.filter(m => m.approved === true);
  const rejected = review.mappings.filter(m => m.approved === false);
  const pending = review.mappings.filter(m => m.approved === null);

  console.log(`Review results:`);
  console.log(`  Approved: ${approved.length}`);
  console.log(`  Rejected: ${rejected.length}`);
  console.log(`  Still pending: ${pending.length}`);

  if (pending.length > 0) {
    console.log('\nWarning: Some matches are still pending review (approved: null).');
    console.log('These will be excluded from the active mapping.');
  }

  // Save only approved matches to the active mapping file
  const mappingData = {
    mappings: approved,
    unmatchedWc: review.unmatchedWc,
    unmatchedShopify: review.unmatchedShopify,
  };
  saveMapping(mappingData);
  console.log(`\nActive mapping updated with ${approved.length} approved matches.`);
}

// ── Add manual mapping ─────────────────────────────────────────────────
export function addManualMapping(wcId, wcName, shopifyId, shopifyTitle) {
  const data = loadMapping();
  // Check for duplicates
  const exists = data.mappings.find(m => m.wc_id === wcId || m.shopify_id === shopifyId);
  if (exists) {
    console.log('A mapping already exists for one of these products:');
    console.log(`  WC: ${exists.wc_name} → Shopify: ${exists.shopify_title}`);
    console.log('Remove it first if you want to remap.');
    return;
  }
  data.mappings.push({
    wc_id: wcId,
    wc_name: wcName,
    wc_sku: '',
    shopify_id: shopifyId,
    shopify_title: shopifyTitle,
    shopify_status: 'unknown',
    confidence: 100,
    reason: 'Manual mapping',
    approved: true,
  });
  saveMapping(data);
  console.log(`Added manual mapping: WC #${wcId} "${wcName}" → Shopify #${shopifyId} "${shopifyTitle}"`);
}

// ── CLI entry point ────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes('--approve-review')) {
  approveReview();
} else if (args.includes('--show')) {
  const data = loadMapping();
  if (data.mappings.length === 0) {
    console.log('No product mappings found. Run matching first.');
  } else {
    console.log(`\n${data.mappings.length} product mappings (last updated: ${data.lastUpdated}):\n`);
    for (const m of data.mappings) {
      const conf = `${m.confidence}%`.padStart(4);
      console.log(`  [${conf}] WC #${m.wc_id} "${m.wc_name}" → Shopify #${m.shopify_id} "${m.shopify_title}"`);
    }
    console.log(`\nUnmatched WC: ${data.unmatchedWc.length} | Unmatched Shopify: ${data.unmatchedShopify.length}`);
  }
} else if (args.some(a => a.startsWith('--add-manual'))) {
  // --add-manual wc_id:wc_name:shopify_id:shopify_title
  const arg = args.find(a => a.startsWith('--add-manual='));
  if (!arg) {
    console.log('Usage: --add-manual=WC_ID:WC_NAME:SHOPIFY_ID:SHOPIFY_TITLE');
    process.exit(1);
  }
  const parts = arg.replace('--add-manual=', '').split(':');
  if (parts.length < 4) {
    console.log('Usage: --add-manual=WC_ID:WC_NAME:SHOPIFY_ID:SHOPIFY_TITLE');
    process.exit(1);
  }
  addManualMapping(parseInt(parts[0]), parts[1], parseInt(parts[2]), parts[3]);
} else {
  // Default: run matching
  const reviewMode = args.includes('--review');
  const forceRematch = args.includes('--force-rematch');
  runProductMatching({ reviewMode, forceRematch }).catch(err => {
    console.error('Product matching failed:', err.message);
    process.exit(1);
  });
}
