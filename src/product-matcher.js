// Strict text-based product matcher: maps WooCommerce products to Shopify products
// Uses deterministic title comparison — no AI guessing. Only matches products
// that a reasonable person would agree are clearly the same item.
import 'dotenv/config';
import { getAllWcProducts, extractStockInfo } from './woocommerce-client.js';
import { paginateAll } from './shopify-api.js';
import fs from 'fs';
import path from 'path';

const MAPPING_FILE = path.join(process.cwd(), 'product-mapping.json');
const REVIEW_FILE = path.join(process.cwd(), 'product-mapping-review.json');

// Minimum confidence to auto-accept a match
const AUTO_MATCH_THRESHOLD = 95;

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

// ── Text normalization ─────────────────────────────────────────────────
// Normalize a product title for comparison. This collapses formatting
// differences while preserving all meaningful content (sizes, colors, etc.)
function normalize(title) {
  let s = title.toLowerCase().trim();
  // Standardize common measurement patterns: 6" → 6 inch, 6in → 6 inch
  s = s.replace(/(\d+)\s*["″'']/g, '$1 inch');
  s = s.replace(/(\d+)\s*in\b\.?/g, '$1 inch');
  // Standardize mm/cm
  s = s.replace(/(\d+)\s*mm\b/g, '$1 mm');
  s = s.replace(/(\d+)\s*cm\b/g, '$1 cm');
  // Remove special characters but keep alphanumerics and spaces
  s = s.replace(/[^a-z0-9\s]/g, ' ');
  // Collapse multiple spaces
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// Extract tokens (words) from a normalized string
function tokenize(normalized) {
  return normalized.split(' ').filter(t => t.length > 0);
}

// Extract all numeric values from tokens (for size/quantity matching)
function extractNumbers(tokens) {
  const numbers = [];
  for (const t of tokens) {
    const match = t.match(/^\d+(\.\d+)?$/);
    if (match) numbers.push(t);
  }
  return numbers.sort();
}

// Extract measurement phrases (e.g., "6 inch", "14 mm") as combined tokens
function extractMeasurements(tokens) {
  const measurements = [];
  const units = new Set(['inch', 'mm', 'cm', 'ml', 'oz', 'ft', 'pc', 'pcs', 'pack', 'piece', 'pieces', 'set']);
  for (let i = 0; i < tokens.length - 1; i++) {
    if (/^\d+(\.\d+)?$/.test(tokens[i]) && units.has(tokens[i + 1])) {
      measurements.push(`${tokens[i]} ${tokens[i + 1]}`);
    }
  }
  return measurements.sort();
}

// ── Matching algorithm ─────────────────────────────────────────────────

// Compare two product titles and return a confidence score (0-100) and reason.
// Returns null if no reasonable match.
function compareProducts(wcName, shopifyTitle) {
  const normWc = normalize(wcName);
  const normShopify = normalize(shopifyTitle);

  // ── Level 1: Exact match after normalization → 100% ──
  if (normWc === normShopify) {
    return { confidence: 100, reason: 'Exact match (after normalization)' };
  }

  const tokensWc = tokenize(normWc);
  const tokensShopify = tokenize(normShopify);

  // ── Level 2: Same tokens, different order → 98% ──
  const sortedWc = [...tokensWc].sort().join(' ');
  const sortedShopify = [...tokensShopify].sort().join(' ');
  if (sortedWc === sortedShopify) {
    return { confidence: 98, reason: 'Same words, different order' };
  }

  // ── Level 3: High similarity with strict guards ──
  // ALL numbers and measurements must match exactly.
  // If they differ in any number (size, quantity), it's a different product.
  const numbersWc = extractNumbers(tokensWc);
  const numbersShopify = extractNumbers(tokensShopify);
  const measuresWc = extractMeasurements(tokensWc);
  const measuresShopify = extractMeasurements(tokensShopify);

  // Strict: all numbers must match
  if (numbersWc.join(',') !== numbersShopify.join(',')) {
    return null; // Different sizes/quantities → not the same product
  }

  // Strict: all measurements must match
  if (measuresWc.join(',') !== measuresShopify.join(',')) {
    return null;
  }

  // Compute token overlap (Jaccard-like but weighted)
  const setWc = new Set(tokensWc);
  const setShopify = new Set(tokensShopify);
  const intersection = new Set([...setWc].filter(t => setShopify.has(t)));
  const union = new Set([...setWc, ...setShopify]);

  const jaccardSimilarity = intersection.size / union.size;

  // We also check: how many tokens are NOT shared?
  const missingFromShopify = [...setWc].filter(t => !setShopify.has(t));
  const missingFromWc = [...setShopify].filter(t => !setWc.has(t));
  const totalMissing = missingFromShopify.length + missingFromWc.length;
  const totalUnique = union.size;

  // Require very high overlap: at most 1 token difference on each side
  // and at least 80% Jaccard similarity
  if (totalMissing > 2 || jaccardSimilarity < 0.80) {
    return null;
  }

  // If only 1 total token differs and it's a minor word (color variant, "style", etc.)
  // that's acceptable. But if a key product-type word differs, reject.
  const productTypeWords = new Set([
    'pipe', 'bong', 'bowl', 'grinder', 'rig', 'dab', 'nectar', 'collector',
    'bubbler', 'chillum', 'steamroller', 'sherlock', 'spoon', 'hammer',
    'recycler', 'beaker', 'straight', 'tube', 'percolator', 'perc',
    'downstem', 'slide', 'nail', 'banger', 'carb', 'cap', 'torch',
    'lighter', 'tray', 'rolling', 'paper', 'papers', 'cone', 'cones',
    'tip', 'tips', 'filter', 'wrap', 'wraps', 'blunt', 'cigar',
    'vape', 'vaporizer', 'cartridge', 'battery', 'pen', 'mod',
    'hookah', 'hose', 'charcoal', 'shisha', 'tobacco',
    'scale', 'jar', 'stash', 'container', 'bag', 'pouch',
    'ashtray', 'cleaner', 'brush', 'screen', 'screens',
    'silicone', 'glass', 'metal', 'ceramic', 'wood', 'wooden', 'acrylic',
    'donut', 'pokeball', 'grenade', 'skull', 'mushroom', 'pineapple',
    'kit', 'set', 'combo', 'bundle', 'adapter', 'clip', 'holder',
  ]);

  // Check if any missing token is a product-type keyword
  for (const missing of [...missingFromShopify, ...missingFromWc]) {
    if (productTypeWords.has(missing)) {
      return null; // A key product descriptor differs → not the same product
    }
  }

  // Calculate final confidence based on similarity
  // Jaccard 1.0 with some token missing impossible (would be exact), so:
  // Jaccard 0.80-0.85 → 95%, 0.85-0.90 → 96%, 0.90-0.95 → 97%, 0.95+ → 98%
  let confidence;
  if (jaccardSimilarity >= 0.95) confidence = 98;
  else if (jaccardSimilarity >= 0.90) confidence = 97;
  else if (jaccardSimilarity >= 0.85) confidence = 96;
  else confidence = 95;

  const diffDesc = [];
  if (missingFromShopify.length > 0) diffDesc.push(`WC has extra: "${missingFromShopify.join(', ')}"`);
  if (missingFromWc.length > 0) diffDesc.push(`Shopify has extra: "${missingFromWc.join(', ')}"`);
  const reason = `Close text match (${Math.round(jaccardSimilarity * 100)}% token overlap). ${diffDesc.join('. ')}`;

  return { confidence, reason };
}

// ── Run matching ───────────────────────────────────────────────────────
function runTextMatching(wcProducts, shopifyProducts) {
  console.log('\nRunning strict text-based product matching...');
  console.log(`Comparing ${wcProducts.length} WC products against ${shopifyProducts.length} Shopify products...\n`);

  // Build a lookup of normalized Shopify titles for fast exact matching
  const shopifyByNormalized = new Map();
  for (let i = 0; i < shopifyProducts.length; i++) {
    const norm = normalize(shopifyProducts[i].title);
    // If multiple Shopify products have the same normalized title, keep first
    if (!shopifyByNormalized.has(norm)) {
      shopifyByNormalized.set(norm, i);
    }
  }

  // Also build sorted-token lookup for Level 2 matching
  const shopifyBySortedTokens = new Map();
  for (let i = 0; i < shopifyProducts.length; i++) {
    const sorted = tokenize(normalize(shopifyProducts[i].title)).sort().join(' ');
    if (!shopifyBySortedTokens.has(sorted)) {
      shopifyBySortedTokens.set(sorted, i);
    }
  }

  const matches = [];
  const matchedShopifyIndices = new Set();
  let exactCount = 0;
  let reorderCount = 0;
  let closeCount = 0;

  for (let wcIdx = 0; wcIdx < wcProducts.length; wcIdx++) {
    const wcName = wcProducts[wcIdx].name;
    const normWc = normalize(wcName);

    // Level 1: Check exact normalized match (O(1) lookup)
    const exactIdx = shopifyByNormalized.get(normWc);
    if (exactIdx !== undefined && !matchedShopifyIndices.has(exactIdx)) {
      matches.push({
        wc_index: wcIdx,
        shopify_index: exactIdx,
        confidence: 100,
        reason: 'Exact match (after normalization)',
      });
      matchedShopifyIndices.add(exactIdx);
      exactCount++;
      continue;
    }

    // Level 2: Check sorted-token match (O(1) lookup)
    const sortedWc = tokenize(normWc).sort().join(' ');
    const reorderIdx = shopifyBySortedTokens.get(sortedWc);
    if (reorderIdx !== undefined && !matchedShopifyIndices.has(reorderIdx)) {
      matches.push({
        wc_index: wcIdx,
        shopify_index: reorderIdx,
        confidence: 98,
        reason: 'Same words, different order',
      });
      matchedShopifyIndices.add(reorderIdx);
      reorderCount++;
      continue;
    }

    // Level 3: Brute-force compare against all unmatched Shopify products
    let bestMatch = null;
    for (let sIdx = 0; sIdx < shopifyProducts.length; sIdx++) {
      if (matchedShopifyIndices.has(sIdx)) continue;

      const result = compareProducts(wcName, shopifyProducts[sIdx].title);
      if (result && result.confidence >= AUTO_MATCH_THRESHOLD) {
        if (!bestMatch || result.confidence > bestMatch.confidence) {
          bestMatch = { shopify_index: sIdx, ...result };
        }
      }
    }

    if (bestMatch) {
      matches.push({
        wc_index: wcIdx,
        shopify_index: bestMatch.shopify_index,
        confidence: bestMatch.confidence,
        reason: bestMatch.reason,
      });
      matchedShopifyIndices.add(bestMatch.shopify_index);
      closeCount++;
    }
  }

  console.log(`  Exact matches:          ${exactCount}`);
  console.log(`  Reordered-word matches: ${reorderCount}`);
  console.log(`  Close text matches:     ${closeCount}`);
  console.log(`  Total matched:          ${matches.length}`);
  console.log(`  Unmatched WC products:  ${wcProducts.length - matches.length}`);

  return matches;
}

// ── Main match command ─────────────────────────────────────────────────
export async function runProductMatching(options = {}) {
  const { reviewMode = false, forceRematch = false } = options;

  // Load existing mapping (to preserve approved matches)
  const existing = loadMapping();
  if (!forceRematch && existing.mappings.length > 0) {
    console.log(`Existing mapping has ${existing.mappings.length} product pairs.`);
    console.log('Use --force-rematch to re-run matching from scratch.');
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

  // Run strict text-based matching
  const matches = runTextMatching(wcProducts, shopifyProducts);
  console.log(`\nTotal matches: ${matches.length}`);

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
  for (const m of mappings.slice(0, 30)) {
    const conf = `${m.confidence}%`.padStart(4);
    console.log(`  [${conf}] WC: "${m.wc_name}" → Shopify: "${m.shopify_title}"`);
  }
  if (mappings.length > 30) {
    console.log(`  ... and ${mappings.length - 30} more matches`);
  }

  // Always show unmatched WC products so user knows what needs manual review
  if (unmatchedWc.length > 0) {
    console.log('\n── Unmatched WC Products (need manual review) ─────────────');
    for (const p of unmatchedWc.slice(0, 50)) {
      console.log(`  ? WC #${p.id} "${p.name}" — no close Shopify match found`);
    }
    if (unmatchedWc.length > 50) {
      console.log(`  ... and ${unmatchedWc.length - 50} more unmatched`);
    }
    console.log('\nTo manually map these, use:');
    console.log('  npm run wholesaler:match -- --add-manual=WC_ID:WC_NAME:SHOPIFY_ID:SHOPIFY_TITLE');
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
