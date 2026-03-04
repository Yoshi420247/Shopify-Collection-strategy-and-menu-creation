#!/usr/bin/env node
/**
 * Reprice Active "What You Need" Products
 *
 * Runs AI competitor research on ONE variant per product, then applies
 * the recommended price to all variants — unless a variant is a quantity
 * variant (e.g. "3-pack", "5-pack"), in which case it keeps its relative
 * pricing intact via a proportional adjustment.
 *
 * Usage:
 *   node src/reprice-products.js                  # Dry run — show proposed changes
 *   node src/reprice-products.js --execute         # Apply price changes
 *   node src/reprice-products.js --execute --limit 10  # Only first 10 products
 */
import 'dotenv/config';
import {
  getAllProductsByVendor,
  getProduct,
  updateProductVariant,
  getInventoryItem,
} from './shopify-api.js';
import { determinePrice, calculateCost } from './pricing-engine.js';
import { determineProductType } from './pdp-generator.js';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'reprice-log.json');
const VENDOR = 'What You Need';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Quantity variant detection ────────────────────────────────────────
// Matches patterns like "3-pack", "5 pack", "10pc", "x3", "qty 5", "box of 12"
const QTY_PATTERNS = [
  /(\d+)\s*[-]?\s*pack/i,
  /(\d+)\s*pc/i,
  /(\d+)\s*piece/i,
  /(\d+)\s*ct/i,
  /(\d+)\s*count/i,
  /x\s*(\d+)/i,
  /qty\s*(\d+)/i,
  /box\s*of\s*(\d+)/i,
  /set\s*of\s*(\d+)/i,
  /(\d+)\s*pk/i,
];

function extractQuantity(variantTitle) {
  if (!variantTitle) return null;
  for (const pattern of QTY_PATTERNS) {
    const match = variantTitle.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function isQuantityVariant(variant) {
  // Check option values and title for quantity patterns
  const fields = [
    variant.title,
    variant.option1,
    variant.option2,
    variant.option3,
  ].filter(Boolean);

  for (const field of fields) {
    if (extractQuantity(field) !== null) return true;
  }
  return false;
}

// ── Pick the best variant to research ─────────────────────────────────
// Prefers the "Default Title" / base variant. Avoids quantity variants.
function pickResearchVariant(variants) {
  // First choice: default variant
  const defaultVar = variants.find(v =>
    v.title === 'Default Title' || variants.length === 1
  );
  if (defaultVar) return defaultVar;

  // Second choice: first non-quantity variant
  const nonQty = variants.find(v => !isQuantityVariant(v));
  if (nonQty) return nonQty;

  // Fallback: first variant
  return variants[0];
}

// ── Compute new prices for all variants ───────────────────────────────
function computeVariantPrices(variants, researchVariant, newPrice) {
  const oldBasePrice = parseFloat(researchVariant.price);
  if (!oldBasePrice || oldBasePrice <= 0) {
    // No valid base price — set all to the new price
    return variants.map(v => ({
      variantId: v.id,
      title: v.title,
      oldPrice: parseFloat(v.price),
      newPrice: newPrice,
      reason: 'no_base_price',
    }));
  }

  return variants.map(v => {
    const oldPrice = parseFloat(v.price);
    const qty = extractQuantity(v.title) || extractQuantity(v.option1)
      || extractQuantity(v.option2) || extractQuantity(v.option3);

    if (v.id === researchVariant.id) {
      // This is the researched variant — use AI price directly
      return {
        variantId: v.id,
        title: v.title,
        oldPrice,
        newPrice,
        reason: 'ai_research',
      };
    }

    if (qty) {
      // Quantity variant: scale proportionally from the base
      // If old base was $20 for 1-pack and old 3-pack was $50,
      // and new base is $15, then new 3-pack = $50 * (15/20) = $37.50
      const ratio = newPrice / oldBasePrice;
      const scaled = Math.round(oldPrice * ratio * 100) / 100;
      return {
        variantId: v.id,
        title: v.title,
        oldPrice,
        newPrice: scaled,
        reason: `qty_variant (${qty}x, ratio ${ratio.toFixed(2)})`,
      };
    }

    // Non-quantity variant (color, style, etc.) — same price as base
    return {
      variantId: v.id,
      title: v.title,
      oldPrice,
      newPrice,
      reason: 'same_as_base',
    };
  });
}

// ── Process a single product ──────────────────────────────────────────
async function repriceProduct(product, options = {}) {
  const { dryRun = true } = options;
  const variants = product.variants || [];

  if (variants.length === 0) {
    return { productId: product.id, title: product.title, skipped: true, reason: 'no_variants' };
  }

  // Pick one variant to research
  const researchVariant = pickResearchVariant(variants);
  const currentPrice = parseFloat(researchVariant.price);

  // Get the cost from the inventory item (if set)
  let cost = 0;
  try {
    if (researchVariant.inventory_item_id) {
      const invItem = await getInventoryItem(researchVariant.inventory_item_id);
      cost = parseFloat(invItem?.inventory_item?.cost) || 0;
    }
  } catch {
    // Cost not available — will use current price as fallback reference
  }

  // If no cost is set, we can't determine margin — skip
  if (cost <= 0) {
    return {
      productId: product.id,
      title: product.title,
      skipped: true,
      reason: 'no_cost_set',
      currentPrice,
    };
  }

  // Run AI pricing research on the product name (once for the whole product)
  // skipCostMultiplier: cost is already the Shopify cost — don't re-inflate it
  const productType = determineProductType(product.title);

  console.log(`    Researching: "${product.title}" (cost: $${cost.toFixed(2)}, current: $${currentPrice})`);
  const pricing = await determinePrice(product.title, cost, productType, { skipCostMultiplier: true });

  if (!pricing.retailPrice || pricing.retailPrice <= 0) {
    return {
      productId: product.id,
      title: product.title,
      skipped: true,
      reason: 'pricing_failed',
      currentPrice,
      cost,
    };
  }

  // Compute new prices for all variants
  const variantChanges = computeVariantPrices(variants, researchVariant, pricing.retailPrice);
  const hasChanges = variantChanges.some(v => Math.abs(v.oldPrice - v.newPrice) >= 0.01);

  if (!hasChanges) {
    console.log(`    No price change needed`);
    return {
      productId: product.id,
      title: product.title,
      skipped: true,
      reason: 'no_change',
      currentPrice,
      newPrice: pricing.retailPrice,
      cost,
      source: pricing.source,
    };
  }

  // Log the proposed changes
  for (const vc of variantChanges) {
    const dir = vc.newPrice > vc.oldPrice ? '↑' : vc.newPrice < vc.oldPrice ? '↓' : '=';
    const pct = vc.oldPrice > 0
      ? ` (${((vc.newPrice - vc.oldPrice) / vc.oldPrice * 100).toFixed(0)}%)`
      : '';
    console.log(`    ${dir} "${vc.title}": $${vc.oldPrice.toFixed(2)} → $${vc.newPrice.toFixed(2)}${pct} [${vc.reason}]`);
  }

  // Apply changes
  if (!dryRun) {
    for (const vc of variantChanges) {
      if (Math.abs(vc.oldPrice - vc.newPrice) >= 0.01) {
        await updateProductVariant(vc.variantId, { price: vc.newPrice.toFixed(2) });
        await sleep(300);
      }
    }
    console.log(`    Applied ${variantChanges.filter(v => Math.abs(v.oldPrice - v.newPrice) >= 0.01).length} variant price updates`);
  }

  return {
    productId: product.id,
    title: product.title,
    cost,
    oldPrice: currentPrice,
    newPrice: pricing.retailPrice,
    source: pricing.source,
    confidence: pricing.aiAnalysis?.confidence,
    reasoning: pricing.aiAnalysis?.reasoning,
    competitorData: pricing.competitorData,
    variantChanges,
  };
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] || '0', 10) : 0;

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║          Reprice Active "What You Need" Products            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update prices)'}`);
  if (limit > 0) console.log(`Limit: ${limit} products`);

  // Fetch all active "What You Need" products
  console.log(`\nFetching active "${VENDOR}" products from Shopify...`);
  const allProducts = await getAllProductsByVendor(VENDOR);
  const activeProducts = allProducts.filter(p => p.status === 'active');
  console.log(`Found ${allProducts.length} total, ${activeProducts.length} active\n`);

  let toProcess = activeProducts;
  if (limit > 0) toProcess = toProcess.slice(0, limit);

  const results = [];
  let repriced = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const product = toProcess[i];
    console.log(`\n[${i + 1}/${toProcess.length}] "${product.title}" (${product.variants?.length || 0} variants)`);

    try {
      const result = await repriceProduct(product, { dryRun });
      results.push(result);

      if (result.skipped) {
        skipped++;
        console.log(`    Skipped: ${result.reason}`);
      } else {
        repriced++;
      }
    } catch (err) {
      errors++;
      results.push({ productId: product.id, title: product.title, error: err.message });
      console.log(`    ERROR: ${err.message}`);
    }

    // Brief pause between products to avoid rate limits on AI API
    await sleep(1000);
  }

  // Save log
  const logEntry = {
    timestamp: new Date().toISOString(),
    dryRun,
    total: toProcess.length,
    repriced,
    skipped,
    errors,
    results: results.map(r => ({
      productId: r.productId,
      title: r.title,
      cost: r.cost,
      oldPrice: r.oldPrice,
      newPrice: r.newPrice,
      source: r.source,
      confidence: r.confidence,
      reasoning: r.reasoning,
      skipped: r.skipped,
      reason: r.reason,
      error: r.error,
      variantChanges: r.variantChanges?.map(vc => ({
        title: vc.title,
        oldPrice: vc.oldPrice,
        newPrice: vc.newPrice,
        reason: vc.reason,
      })),
    })),
  };

  const log = fs.existsSync(LOG_FILE)
    ? JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'))
    : { runs: [] };
  log.runs.push(logEntry);
  if (log.runs.length > 30) log.runs = log.runs.slice(-30);
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));

  // Summary
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`  Products repriced:  ${repriced}`);
  console.log(`  Products skipped:   ${skipped}`);
  console.log(`  Errors:             ${errors}`);
  console.log('══════════════════════════════════════════════════════════════');

  // Show price changes summary
  const changed = results.filter(r => !r.skipped && !r.error);
  if (changed.length > 0) {
    console.log('\n── Price Changes ──');
    for (const r of changed) {
      const dir = r.newPrice > r.oldPrice ? '↑' : '↓';
      const pct = ((r.newPrice - r.oldPrice) / r.oldPrice * 100).toFixed(0);
      console.log(`  ${dir} "${r.title}": $${r.oldPrice?.toFixed(2)} → $${r.newPrice?.toFixed(2)} (${pct}%) [${r.source}, ${r.confidence || 'n/a'}]`);
    }
  }

  if (dryRun) {
    console.log('\nThis was a DRY RUN. To apply changes:');
    console.log('  node src/reprice-products.js --execute');
  }
}

main().catch(err => {
  console.error('Reprice failed:', err.message);
  process.exit(1);
});
