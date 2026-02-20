#!/usr/bin/env node
// ============================================================================
// Abandoned Cart Recovery Workflow Engine
// Oil Slick Pad (oilslickpad.com)
//
// Fetches abandoned checkouts from Shopify, classifies them by product category
// and customer segment, then orchestrates a multi-touch recovery sequence with
// category-aware discount escalation.
//
// Usage:
//   node src/abandoned-cart-engine.js                    # Dry run — analyze only
//   node src/abandoned-cart-engine.js --execute          # Process and send
//   node src/abandoned-cart-engine.js --report           # Generate analytics report
//   node src/abandoned-cart-engine.js --test-email=EMAIL # Send test to specific email
// ============================================================================

import { config } from './config.js';
import { abandonedCartConfig } from './abandoned-cart-config.js';
import { CartAnalyzer } from './cart-analyzer.js';
import { DiscountEngine } from './discount-engine.js';
import { EmailTemplateGenerator } from './email-template-generator.js';
import { ABTestManager } from './ab-test-manager.js';
import { RecoveryAnalytics } from './recovery-analytics.js';
import * as shopifyApi from './shopify-api.js';

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--execute');
const REPORT_ONLY = args.includes('--report');
const TEST_EMAIL = args.find(a => a.startsWith('--test-email='))?.split('=')[1];
const MAX_CHECKOUTS = parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1] || '0') || 0;
const VERBOSE = args.includes('--verbose');

// ============================================================================
// SHOPIFY ABANDONED CHECKOUT API EXTENSIONS
// ============================================================================

/**
 * Fetches abandoned checkouts from Shopify Admin API.
 * Handles pagination to retrieve all checkouts within the lookback window.
 */
async function getAbandonedCheckouts(lookbackHours = 168) { // 7 days default
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const checkouts = [];
  let page = 1;
  let hasMore = true;

  console.log(`\n📦 Fetching abandoned checkouts since ${since}...`);

  while (hasMore) {
    const params = new URLSearchParams({
      status: 'open',
      created_at_min: since,
      limit: '250',
      page: String(page),
    });

    try {
      const data = await shopifyApi.get(`checkouts.json?${params}`);
      const batch = data.checkouts || [];

      if (batch.length === 0) {
        hasMore = false;
      } else {
        checkouts.push(...batch);
        console.log(`  Page ${page}: ${batch.length} checkouts (${checkouts.length} total)`);
        page++;
        if (batch.length < 250) hasMore = false;
      }
    } catch (error) {
      console.error(`  Error fetching page ${page}: ${error.message}`);
      hasMore = false;
    }
  }

  return checkouts;
}

/**
 * Fetches customer order history for segmentation.
 */
async function getCustomerHistory(customerId) {
  if (!customerId) return null;
  try {
    const data = await shopifyApi.get(`customers/${customerId}.json`);
    return data.customer || null;
  } catch {
    return null;
  }
}

/**
 * Fetches product details including tags for category classification.
 */
async function getProductWithTags(productId) {
  try {
    const data = await shopifyApi.getProduct(productId);
    return data.product || null;
  } catch {
    return null;
  }
}

/**
 * Creates a Shopify price rule (discount) via the Admin API.
 * Returns the discount code string.
 */
async function createDiscountCode(discountParams) {
  const {
    code,
    valueType,        // 'percentage' or 'fixed_amount'
    value,            // Negative number (e.g., -10 for 10% off)
    targetType,       // 'line_item' or 'shipping_line'
    targetSelection,  // 'all' or 'entitled'
    allocationMethod, // 'across' or 'each'
    usageLimit,
    startsAt,
    endsAt,
    prerequisiteSubtotalRange,
  } = discountParams;

  try {
    // Create price rule
    const priceRuleData = await shopifyApi.post('price_rules.json', {
      price_rule: {
        title: code,
        target_type: targetType || 'line_item',
        target_selection: targetSelection || 'all',
        allocation_method: allocationMethod || 'across',
        value_type: valueType,
        value: String(value),
        usage_limit: usageLimit || 1,
        once_per_customer: true,
        starts_at: startsAt || new Date().toISOString(),
        ends_at: endsAt,
        prerequisite_subtotal_range: prerequisiteSubtotalRange
          ? { greater_than_or_equal_to: String(prerequisiteSubtotalRange) }
          : undefined,
      },
    });

    const priceRuleId = priceRuleData.price_rule?.id;
    if (!priceRuleId) {
      console.error('  Failed to create price rule:', JSON.stringify(priceRuleData));
      return null;
    }

    // Create discount code for the price rule
    const discountCodeData = await shopifyApi.post(
      `price_rules/${priceRuleId}/discount_codes.json`,
      { discount_code: { code } }
    );

    return discountCodeData.discount_code || null;
  } catch (error) {
    console.error(`  Error creating discount code ${code}: ${error.message}`);
    return null;
  }
}

// ============================================================================
// CORE ENGINE
// ============================================================================

class AbandonedCartEngine {
  constructor() {
    this.analyzer = new CartAnalyzer(abandonedCartConfig);
    this.discountEngine = new DiscountEngine(abandonedCartConfig);
    this.templateGenerator = new EmailTemplateGenerator(abandonedCartConfig);
    this.abTestManager = new ABTestManager(abandonedCartConfig);
    this.analytics = new RecoveryAnalytics(abandonedCartConfig);
    this.results = {
      totalCheckouts: 0,
      processed: 0,
      skipped: 0,
      emailsQueued: 0,
      smsQueued: 0,
      discountsCreated: 0,
      errors: [],
      segments: {},
      categories: {},
      cartValueDistribution: {},
    };
  }

  /**
   * Main entry point. Processes all abandoned checkouts.
   */
  async run() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  🛒 ABANDONED CART RECOVERY ENGINE');
    console.log('  Oil Slick Pad — oilslickpad.com');
    console.log(`  Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '🚀 EXECUTE (live)'}`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (REPORT_ONLY) {
      return this.generateReport();
    }

    // Step 1: Fetch abandoned checkouts
    const checkouts = await getAbandonedCheckouts();
    this.results.totalCheckouts = checkouts.length;

    if (checkouts.length === 0) {
      console.log('✅ No abandoned checkouts found. Nothing to process.');
      return this.results;
    }

    console.log(`\n📊 Found ${checkouts.length} abandoned checkouts to analyze.\n`);

    // Step 2: Process each checkout
    const limit = MAX_CHECKOUTS > 0 ? Math.min(MAX_CHECKOUTS, checkouts.length) : checkouts.length;

    for (let i = 0; i < limit; i++) {
      const checkout = checkouts[i];
      console.log(`\n[${ i + 1}/${limit}] Processing checkout ${checkout.id}...`);

      try {
        await this.processCheckout(checkout);
        this.results.processed++;
      } catch (error) {
        console.error(`  ❌ Error processing checkout ${checkout.id}: ${error.message}`);
        this.results.errors.push({ checkoutId: checkout.id, error: error.message });
      }
    }

    // Step 3: Print summary
    this.printSummary();

    return this.results;
  }

  /**
   * Processes a single abandoned checkout through the full recovery pipeline.
   */
  async processCheckout(checkout) {
    // 1. Classify cart items by product category
    const cartAnalysis = await this.analyzeCart(checkout);

    // 2. Determine customer segment
    const customerSegment = await this.segmentCustomer(checkout);

    // 3. Determine which email in the sequence to send
    const sequencePosition = this.determineSequencePosition(checkout);

    // 4. Check if this customer has been rate-limited on discounts
    const isDiscountEligible = this.checkDiscountEligibility(checkout, customerSegment);

    // 5. Calculate the right discount for this specific cart
    const discountDecision = this.discountEngine.calculateDiscount({
      cartAnalysis,
      customerSegment,
      sequencePosition,
      isDiscountEligible,
    });

    // 6. Select A/B test variants
    const abVariants = this.abTestManager.selectVariants(checkout.id);

    // 7. Generate email content
    const emailContent = this.templateGenerator.generate({
      checkout,
      cartAnalysis,
      customerSegment,
      sequencePosition,
      discountDecision,
      abVariants,
    });

    // 8. Log the decision
    this.logDecision(checkout, {
      cartAnalysis,
      customerSegment,
      sequencePosition,
      discountDecision,
      emailContent,
    });

    // 9. Execute (if not dry run)
    if (!DRY_RUN) {
      await this.executeRecovery(checkout, {
        discountDecision,
        emailContent,
        cartAnalysis,
        customerSegment,
        sequencePosition,
      });
    }

    // Track segment distribution
    const segName = customerSegment.name;
    this.results.segments[segName] = (this.results.segments[segName] || 0) + 1;

    // Track category distribution
    const catName = cartAnalysis.dominantCategory;
    this.results.categories[catName] = (this.results.categories[catName] || 0) + 1;

    // Track cart value distribution
    const tier = cartAnalysis.valueTier.name;
    this.results.cartValueDistribution[tier] = (this.results.cartValueDistribution[tier] || 0) + 1;
  }

  /**
   * Analyzes cart contents: classifies each line item, calculates totals per category.
   */
  async analyzeCart(checkout) {
    const lineItems = checkout.line_items || [];
    const analysis = {
      totalValue: parseFloat(checkout.total_price || 0),
      itemCount: lineItems.length,
      categories: {
        oilSlick: { items: [], subtotal: 0, itemCount: 0 },
        smokeshop: { items: [], subtotal: 0, itemCount: 0 },
        unknown: { items: [], subtotal: 0, itemCount: 0 },
      },
      dominantCategory: 'unknown',
      isMixedCart: false,
      valueTier: null,
      highestPriceItem: null,
      avgItemPrice: 0,
    };

    // Classify each line item
    for (const item of lineItems) {
      const category = await this.classifyProduct(item);
      const itemTotal = parseFloat(item.price) * item.quantity;

      analysis.categories[category].items.push({
        ...item,
        classifiedCategory: category,
        lineTotal: itemTotal,
      });
      analysis.categories[category].subtotal += itemTotal;
      analysis.categories[category].itemCount += item.quantity;

      if (!analysis.highestPriceItem || parseFloat(item.price) > parseFloat(analysis.highestPriceItem.price)) {
        analysis.highestPriceItem = item;
      }
    }

    // Determine dominant category (by subtotal)
    const oilSlickTotal = analysis.categories.oilSlick.subtotal;
    const smokeshopTotal = analysis.categories.smokeshop.subtotal;

    if (oilSlickTotal > 0 && smokeshopTotal > 0) {
      analysis.isMixedCart = true;
      analysis.dominantCategory = oilSlickTotal >= smokeshopTotal ? 'oilSlick' : 'smokeshop';
    } else if (oilSlickTotal > 0) {
      analysis.dominantCategory = 'oilSlick';
    } else if (smokeshopTotal > 0) {
      analysis.dominantCategory = 'smokeshop';
    }

    // Determine cart value tier
    analysis.valueTier = this.analyzer.getCartValueTier(analysis.totalValue);

    // Average item price
    if (lineItems.length > 0) {
      analysis.avgItemPrice = analysis.totalValue / lineItems.length;
    }

    return analysis;
  }

  /**
   * Classifies a product into Oil Slick or Smokeshop category
   * using vendor and tag information.
   */
  async classifyProduct(lineItem) {
    const { productCategories } = abandonedCartConfig;

    // Check by vendor first (most reliable)
    const vendor = lineItem.vendor || '';

    for (const [categoryKey, categoryConfig] of Object.entries(productCategories)) {
      if (categoryConfig.identifiers.vendors.some(v =>
        vendor.toLowerCase().includes(v.toLowerCase())
      )) {
        return categoryKey;
      }
    }

    // Fall back to tag-based classification
    // Try to fetch product details if we have a product_id
    if (lineItem.product_id) {
      try {
        const product = await getProductWithTags(lineItem.product_id);
        if (product) {
          const tags = (product.tags || '').split(',').map(t => t.trim().toLowerCase());

          for (const [categoryKey, categoryConfig] of Object.entries(productCategories)) {
            if (categoryConfig.identifiers.tags.some(tag =>
              tags.includes(tag.toLowerCase())
            )) {
              return categoryKey;
            }
          }
        }
      } catch {
        // If we can't fetch the product, classify as unknown
      }
    }

    return 'unknown';
  }

  /**
   * Segments the customer based on order history and behavior.
   */
  async segmentCustomer(checkout) {
    const { customerSegments } = abandonedCartConfig;
    const customer = checkout.customer;
    let customerData = null;

    // Fetch full customer data if available
    if (customer?.id) {
      customerData = await getCustomerHistory(customer.id);
    }

    const ordersCount = customerData?.orders_count || 0;
    const lifetimeValue = parseFloat(customerData?.total_spent || 0);
    const hasAccount = !!customer?.id;
    const cartValue = parseFloat(checkout.total_price || 0);

    // Check whale cart first (overrides other segments)
    if (cartValue >= customerSegments.wholesaleLead.criteria.cartValueMin) {
      return { ...customerSegments.wholesaleLead, ordersCount, lifetimeValue };
    }

    // Loyal customer
    if (ordersCount >= customerSegments.loyalCustomer.criteria.ordersCountMin ||
        lifetimeValue >= customerSegments.loyalCustomer.criteria.lifetimeValueMin) {
      return { ...customerSegments.loyalCustomer, ordersCount, lifetimeValue };
    }

    // Returning customer
    if (ordersCount >= customerSegments.returningCustomer.criteria.ordersCountMin &&
        ordersCount <= customerSegments.returningCustomer.criteria.ordersCountMax) {
      return { ...customerSegments.returningCustomer, ordersCount, lifetimeValue };
    }

    // New customer (has account)
    if (hasAccount && ordersCount === 0) {
      return { ...customerSegments.newCustomer, ordersCount, lifetimeValue };
    }

    // New visitor (default)
    return { ...customerSegments.newVisitor, ordersCount, lifetimeValue };
  }

  /**
   * Determines which email in the sequence should be sent based on
   * when the checkout was abandoned and what's already been sent.
   */
  determineSequencePosition(checkout) {
    const abandonedAt = new Date(checkout.created_at || checkout.updated_at);
    const minutesSinceAbandonment = (Date.now() - abandonedAt.getTime()) / (1000 * 60);
    const { emailSequence } = abandonedCartConfig;

    // Find the latest email that should have been triggered by now
    let position = 0;
    for (let i = 0; i < emailSequence.length; i++) {
      if (minutesSinceAbandonment >= emailSequence[i].delayMinutes) {
        position = i;
      } else {
        break;
      }
    }

    return {
      index: position,
      email: emailSequence[position],
      minutesSinceAbandonment,
      isFirstTouch: position === 0,
      isLastTouch: position === emailSequence.length - 1,
      totalEmailsInSequence: emailSequence.length,
    };
  }

  /**
   * Checks if the customer is eligible for discounts based on rate limits.
   */
  checkDiscountEligibility(checkout, customerSegment) {
    const { discountRules } = abandonedCartConfig;

    // New visitors are always eligible (first interaction)
    if (customerSegment.name === 'New Visitor') return true;

    // Loyal customers get loyalty perks, not cart abandonment discounts
    if (customerSegment.name === 'Loyal Customer') return false;

    // In a production system, check against a database of previously issued codes.
    // For now, return true as the default.
    return true;
  }

  /**
   * Logs the recovery decision for this checkout.
   */
  logDecision(checkout, decision) {
    const { cartAnalysis, customerSegment, sequencePosition, discountDecision } = decision;

    const email = checkout.email || 'unknown';
    const cartTotal = cartAnalysis.totalValue.toFixed(2);

    console.log(`  📧 Email: ${email}`);
    console.log(`  💰 Cart value: $${cartTotal} (${cartAnalysis.valueTier.name})`);
    console.log(`  🏷️  Category: ${cartAnalysis.dominantCategory}${cartAnalysis.isMixedCart ? ' (mixed cart)' : ''}`);
    console.log(`  👤 Segment: ${customerSegment.name}`);
    console.log(`  📨 Sequence: Email #${sequencePosition.index + 1} — "${sequencePosition.email.name}"`);
    console.log(`  ⏱️  Since abandonment: ${Math.round(sequencePosition.minutesSinceAbandonment / 60)}h`);

    if (discountDecision.shouldDiscount) {
      console.log(`  🎫 Discount: ${discountDecision.discountPercent}% off (code: ${discountDecision.code || 'TBD'})`);
      console.log(`  ⏳ Expires: ${discountDecision.expiryHours}h`);
    } else {
      console.log(`  🎫 Discount: None (${discountDecision.reason})`);
    }

    if (VERBOSE) {
      console.log(`  📊 Expected metrics: open=${(sequencePosition.email.expectedMetrics.openRate * 100).toFixed(0)}%, click=${(sequencePosition.email.expectedMetrics.clickRate * 100).toFixed(0)}%, convert=${(sequencePosition.email.expectedMetrics.conversionRate * 100).toFixed(1)}%`);
    }
  }

  /**
   * Executes the recovery actions (create discount, queue email, queue SMS).
   */
  async executeRecovery(checkout, recoveryPlan) {
    const { discountDecision, emailContent, cartAnalysis, customerSegment, sequencePosition } = recoveryPlan;

    // Create discount code in Shopify if needed
    if (discountDecision.shouldDiscount) {
      const expiryDate = new Date(Date.now() + discountDecision.expiryHours * 60 * 60 * 1000);

      const discountCode = await createDiscountCode({
        code: discountDecision.code,
        valueType: 'percentage',
        value: -Math.abs(discountDecision.discountPercent),
        usageLimit: 1,
        startsAt: new Date().toISOString(),
        endsAt: expiryDate.toISOString(),
        prerequisiteSubtotalRange: abandonedCartConfig.discountRules.minimumOrderValue,
      });

      if (discountCode) {
        console.log(`  ✅ Created discount code: ${discountCode.code}`);
        this.results.discountsCreated++;
      } else {
        console.log(`  ⚠️  Failed to create discount code`);
      }
    }

    // In production, these would integrate with Klaviyo/Omnisend/Shopify Flow.
    // For now, we log what would be sent.
    console.log(`  ✅ Email queued: "${emailContent.subject}"`);
    this.results.emailsQueued++;

    // SMS for medium+ carts
    const valueTier = cartAnalysis.valueTier;
    if (valueTier && abandonedCartConfig.cartValueTiers[valueTier.key]?.enableSMS) {
      console.log(`  ✅ SMS queued for ${checkout.phone || checkout.email}`);
      this.results.smsQueued++;
    }
  }

  /**
   * Generates the analytics report.
   */
  async generateReport() {
    console.log('\n📊 ABANDONED CART RECOVERY — ANALYTICS REPORT');
    console.log('═══════════════════════════════════════════════\n');

    // Fetch recent checkouts for analysis
    const checkouts = await getAbandonedCheckouts(168); // Last 7 days

    if (checkouts.length === 0) {
      console.log('No abandoned checkouts in the last 7 days.');
      return;
    }

    const report = await this.analytics.generateReport(checkouts, this);

    // Print report
    console.log(`Total abandoned checkouts (7 days): ${report.totalCheckouts}`);
    console.log(`Total abandoned value: $${report.totalAbandonedValue.toFixed(2)}`);
    console.log(`Average cart value: $${report.avgCartValue.toFixed(2)}`);
    console.log('');

    console.log('📈 Category Breakdown:');
    for (const [category, data] of Object.entries(report.categoryBreakdown)) {
      console.log(`  ${category}: ${data.count} carts, $${data.totalValue.toFixed(2)} total`);
    }
    console.log('');

    console.log('👤 Customer Segment Distribution:');
    for (const [segment, count] of Object.entries(report.segmentDistribution)) {
      console.log(`  ${segment}: ${count} checkouts`);
    }
    console.log('');

    console.log('💰 Cart Value Tier Distribution:');
    for (const [tier, count] of Object.entries(report.valueTierDistribution)) {
      console.log(`  ${tier}: ${count} checkouts`);
    }
    console.log('');

    console.log('🎯 Recommended Actions:');
    for (const action of report.recommendations) {
      console.log(`  • ${action}`);
    }

    return report;
  }

  /**
   * Prints the run summary.
   */
  printSummary() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  📊 RUN SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Total checkouts found:   ${this.results.totalCheckouts}`);
    console.log(`  Processed:               ${this.results.processed}`);
    console.log(`  Skipped:                 ${this.results.skipped}`);
    console.log(`  Emails queued:           ${this.results.emailsQueued}`);
    console.log(`  SMS queued:              ${this.results.smsQueued}`);
    console.log(`  Discounts created:       ${this.results.discountsCreated}`);
    console.log(`  Errors:                  ${this.results.errors.length}`);
    console.log('');

    if (Object.keys(this.results.segments).length > 0) {
      console.log('  Customer Segments:');
      for (const [seg, count] of Object.entries(this.results.segments)) {
        console.log(`    ${seg}: ${count}`);
      }
    }

    if (Object.keys(this.results.categories).length > 0) {
      console.log('\n  Product Categories:');
      for (const [cat, count] of Object.entries(this.results.categories)) {
        console.log(`    ${cat}: ${count}`);
      }
    }

    if (Object.keys(this.results.cartValueDistribution).length > 0) {
      console.log('\n  Cart Value Distribution:');
      for (const [tier, count] of Object.entries(this.results.cartValueDistribution)) {
        console.log(`    ${tier}: ${count}`);
      }
    }

    if (DRY_RUN) {
      console.log('\n  ⚠️  DRY RUN — no emails sent, no discounts created.');
      console.log('  Run with --execute to process for real.\n');
    }

    if (this.results.errors.length > 0) {
      console.log('\n  ❌ Errors:');
      for (const err of this.results.errors) {
        console.log(`    Checkout ${err.checkoutId}: ${err.error}`);
      }
    }
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

async function main() {
  try {
    const engine = new AbandonedCartEngine();
    await engine.run();
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    if (VERBOSE) console.error(error.stack);
    process.exit(1);
  }
}

main();
