#!/usr/bin/env node
// ============================================================================
// Abandoned Cart Recovery Workflow Engine
// Oil Slick Pad (oilslickpad.com)
//
// Fetches abandoned checkouts from Shopify, classifies them by product category
// and customer segment, then orchestrates a multi-touch recovery sequence with
// category-aware discount escalation.
//
// Email delivery: Tags customers + sets metafields via Shopify Admin API.
// Shopify Flow automations trigger on these tags and send Shopify Emails.
// Persistence: Supabase stores recovery history, discount tracking, A/B results.
//
// Usage:
//   node src/abandoned-cart-engine.js                    # Dry run - analyze only
//   node src/abandoned-cart-engine.js --execute          # Process and send
//   node src/abandoned-cart-engine.js --report           # Generate analytics report
// ============================================================================

import { config } from './config.js';
import { abandonedCartConfig } from './abandoned-cart-config.js';
import { CartAnalyzer } from './cart-analyzer.js';
import { DiscountEngine } from './discount-engine.js';
import { EmailTemplateGenerator } from './email-template-generator.js';
import { ABTestManager } from './ab-test-manager.js';
import { RecoveryAnalytics } from './recovery-analytics.js';
import { ShopifyEmailSender } from './shopify-email-sender.js';
import { supabase } from './supabase-client.js';
import * as shopifyApi from './shopify-api.js';

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================
const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--execute');
const REPORT_ONLY = args.includes('--report');
const MAX_CHECKOUTS = parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1] || '0') || 0;
const VERBOSE = args.includes('--verbose');

// ============================================================================
// SHOPIFY ABANDONED CHECKOUT API
// ============================================================================

async function getAbandonedCheckouts(lookbackHours = 168) {
  const since = new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();
  const checkouts = [];
  let page = 1;
  let hasMore = true;

  console.log(`\n  Fetching abandoned checkouts since ${since}...`);

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

async function getCustomerHistory(customerId) {
  if (!customerId) return null;
  try {
    const data = await shopifyApi.get(`customers/${customerId}.json`);
    return data.customer || null;
  } catch {
    return null;
  }
}

async function getProductWithTags(productId) {
  try {
    const data = await shopifyApi.getProduct(productId);
    return data.product || null;
  } catch {
    return null;
  }
}

async function createDiscountCode(discountParams) {
  const { code, valueType, value, usageLimit, startsAt, endsAt, prerequisiteSubtotalRange } = discountParams;

  try {
    const priceRuleData = await shopifyApi.post('price_rules.json', {
      price_rule: {
        title: code,
        target_type: 'line_item',
        target_selection: 'all',
        allocation_method: 'across',
        customer_selection: 'all',
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
    this.emailSender = new ShopifyEmailSender();
    this.results = {
      totalCheckouts: 0,
      processed: 0,
      skipped: 0,
      emailsSent: 0,
      emailsFailed: 0,
      discountsCreated: 0,
      duplicatesSkipped: 0,
      rateLimited: 0,
      errors: [],
      segments: {},
      categories: {},
      cartValueDistribution: {},
    };
  }

  async run() {
    console.log('===============================================================');
    console.log('  ABANDONED CART RECOVERY ENGINE');
    console.log('  Oil Slick Pad');
    console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'EXECUTE (live)'}`);
    console.log('===============================================================\n');

    // Initialize Supabase persistence
    await supabase.init();

    // Load persisted A/B test results
    if (supabase.enabled) {
      const persistedResults = supabase.getABTestResults();
      this.abTestManager.loadResults(persistedResults);
      console.log('  A/B test results loaded from Supabase.\n');
    }

    if (REPORT_ONLY) {
      return this.generateReport();
    }

    // Step 1: Fetch abandoned checkouts
    const checkouts = await getAbandonedCheckouts();
    this.results.totalCheckouts = checkouts.length;

    if (checkouts.length === 0) {
      console.log('  No abandoned checkouts found. Nothing to process.');
      return this.results;
    }

    console.log(`\n  Found ${checkouts.length} abandoned checkouts to analyze.\n`);

    // Step 2: Process each checkout
    const limit = MAX_CHECKOUTS > 0 ? Math.min(MAX_CHECKOUTS, checkouts.length) : checkouts.length;

    for (let i = 0; i < limit; i++) {
      const checkout = checkouts[i];
      console.log(`\n[${i + 1}/${limit}] Checkout ${checkout.id}...`);

      try {
        await this.processCheckout(checkout);
        this.results.processed++;
      } catch (error) {
        console.error(`  Error: ${error.message}`);
        this.results.errors.push({ checkoutId: checkout.id, error: error.message });
      }
    }

    this.printSummary();
    return this.results;
  }

  async processCheckout(checkout) {
    // 1. Classify cart
    const cartAnalysis = await this.analyzeCart(checkout);

    // 2. Determine customer segment
    const customerSegment = await this.segmentCustomer(checkout);

    // 3. Determine sequence position
    const sequencePosition = this.determineSequencePosition(checkout);

    // 4. Check for duplicate sends (skip if already sent this email for this checkout)
    if (supabase.enabled && supabase.hasAlreadySent(checkout.id, sequencePosition.email.id)) {
      console.log(`  SKIP: Email "${sequencePosition.email.name}" already sent for this checkout.`);
      this.results.duplicatesSkipped++;
      this.results.skipped++;
      return;
    }

    // 5. Check discount eligibility (rate limiting via Supabase)
    let isDiscountEligible;
    if (supabase.enabled) {
      isDiscountEligible = supabase.checkDiscountEligibility(
        checkout.email,
        abandonedCartConfig.discountRules.customerRateLimits
      );
      if (!isDiscountEligible) {
        this.results.rateLimited++;
      }
    } else {
      isDiscountEligible = this.legacyDiscountEligibility(customerSegment);
    }

    // 6. Calculate discount
    const discountDecision = this.discountEngine.calculateDiscount({
      cartAnalysis,
      customerSegment,
      sequencePosition,
      isDiscountEligible,
    });

    // 7. A/B test variant selection
    const abVariants = this.abTestManager.selectVariants(checkout.id);

    // 8. Generate email content
    const emailContent = this.templateGenerator.generate({
      checkout,
      cartAnalysis,
      customerSegment,
      sequencePosition,
      discountDecision,
      abVariants,
    });

    // 9. Log decision
    this.logDecision(checkout, { cartAnalysis, customerSegment, sequencePosition, discountDecision });

    // 10. Execute if not dry run
    if (!DRY_RUN) {
      await this.executeRecovery(checkout, {
        discountDecision,
        emailContent,
        cartAnalysis,
        customerSegment,
        sequencePosition,
        abVariants,
      });
    }

    // Track distributions
    this.results.segments[customerSegment.name] = (this.results.segments[customerSegment.name] || 0) + 1;
    this.results.categories[cartAnalysis.dominantCategory] = (this.results.categories[cartAnalysis.dominantCategory] || 0) + 1;
    this.results.cartValueDistribution[cartAnalysis.valueTier.name] = (this.results.cartValueDistribution[cartAnalysis.valueTier.name] || 0) + 1;
  }

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

    for (const item of lineItems) {
      const category = await this.classifyProduct(item);
      const itemTotal = parseFloat(item.price) * item.quantity;

      analysis.categories[category].items.push({ ...item, classifiedCategory: category, lineTotal: itemTotal });
      analysis.categories[category].subtotal += itemTotal;
      analysis.categories[category].itemCount += item.quantity;

      if (!analysis.highestPriceItem || parseFloat(item.price) > parseFloat(analysis.highestPriceItem.price)) {
        analysis.highestPriceItem = item;
      }
    }

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

    analysis.valueTier = this.analyzer.getCartValueTier(analysis.totalValue);
    if (lineItems.length > 0) {
      analysis.avgItemPrice = analysis.totalValue / lineItems.length;
    }

    return analysis;
  }

  async classifyProduct(lineItem) {
    const { productCategories } = abandonedCartConfig;
    const vendor = lineItem.vendor || '';

    for (const [categoryKey, categoryConfig] of Object.entries(productCategories)) {
      if (categoryConfig.identifiers.vendors.some(v => vendor.toLowerCase().includes(v.toLowerCase()))) {
        return categoryKey;
      }
    }

    if (lineItem.product_id) {
      try {
        const product = await getProductWithTags(lineItem.product_id);
        if (product) {
          const tags = (product.tags || '').split(',').map(t => t.trim().toLowerCase());
          for (const [categoryKey, categoryConfig] of Object.entries(productCategories)) {
            if (categoryConfig.identifiers.tags.some(tag => tags.includes(tag.toLowerCase()))) {
              return categoryKey;
            }
          }
        }
      } catch { /* classify as unknown */ }
    }

    return 'unknown';
  }

  async segmentCustomer(checkout) {
    const { customerSegments } = abandonedCartConfig;
    const customer = checkout.customer;
    let customerData = null;

    if (customer?.id) {
      customerData = await getCustomerHistory(customer.id);
    }

    const ordersCount = customerData?.orders_count || 0;
    const lifetimeValue = parseFloat(customerData?.total_spent || 0);
    const hasAccount = !!customer?.id;
    const cartValue = parseFloat(checkout.total_price || 0);

    // Read existing customer tags for enhanced segmentation
    const existingTags = (customerData?.tags || '').split(',').map(t => t.trim().toLowerCase());
    const shopifySegmentTags = existingTags.filter(t => t.startsWith('segment:') || t.startsWith('rfm:'));

    // Check existing Shopify segment tags first (set by your tagging system)
    const hasVipTag = shopifySegmentTags.includes('segment:vip') || shopifySegmentTags.includes('rfm:high');
    const hasAtRiskTag = shopifySegmentTags.includes('segment:at-risk');
    const hasSmokeshopBuyerTag = shopifySegmentTags.includes('segment:smokeshop-buyer');
    const hasHighValueTag = shopifySegmentTags.includes('segment:smokeshop-high-value');

    // VIP / high-RFM customers → Loyal Customer (reduced discount multiplier)
    if (hasVipTag || hasHighValueTag) {
      return { ...customerSegments.loyalCustomer, ordersCount, lifetimeValue, shopifySegmentTags };
    }

    // Wholesale cart value check
    if (cartValue >= customerSegments.wholesaleLead.criteria.cartValueMin) {
      return { ...customerSegments.wholesaleLead, ordersCount, lifetimeValue, shopifySegmentTags };
    }

    // Standard order-history based segmentation
    if (ordersCount >= customerSegments.loyalCustomer.criteria.ordersCountMin ||
        lifetimeValue >= customerSegments.loyalCustomer.criteria.lifetimeValueMin) {
      return { ...customerSegments.loyalCustomer, ordersCount, lifetimeValue, shopifySegmentTags };
    }

    // At-risk customers get Returning treatment (eligible for bigger discounts to win back)
    if (hasAtRiskTag) {
      return { ...customerSegments.returningCustomer, ordersCount, lifetimeValue, shopifySegmentTags };
    }

    if (ordersCount >= customerSegments.returningCustomer.criteria.ordersCountMin &&
        ordersCount <= customerSegments.returningCustomer.criteria.ordersCountMax) {
      return { ...customerSegments.returningCustomer, ordersCount, lifetimeValue, shopifySegmentTags };
    }
    if (hasAccount && ordersCount === 0) {
      return { ...customerSegments.newCustomer, ordersCount, lifetimeValue, shopifySegmentTags };
    }
    return { ...customerSegments.newVisitor, ordersCount, lifetimeValue, shopifySegmentTags };
  }

  determineSequencePosition(checkout) {
    const abandonedAt = new Date(checkout.created_at || checkout.updated_at);
    const minutesSinceAbandonment = (Date.now() - abandonedAt.getTime()) / (1000 * 60);
    const { emailSequence } = abandonedCartConfig;

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

  legacyDiscountEligibility(customerSegment) {
    if (customerSegment.name === 'New Visitor') return true;
    if (customerSegment.name === 'Loyal Customer') return false;
    return true;
  }

  logDecision(checkout, decision) {
    const { cartAnalysis, customerSegment, sequencePosition, discountDecision } = decision;
    console.log(`  Email: ${checkout.email || 'unknown'}`);
    console.log(`  Cart: $${cartAnalysis.totalValue.toFixed(2)} (${cartAnalysis.valueTier.name}) | Category: ${cartAnalysis.dominantCategory}${cartAnalysis.isMixedCart ? ' (mixed)' : ''}`);
    console.log(`  Segment: ${customerSegment.name} | Sequence: #${sequencePosition.index + 1} "${sequencePosition.email.name}" | ${Math.round(sequencePosition.minutesSinceAbandonment / 60)}h ago`);
    if (discountDecision.shouldDiscount) {
      console.log(`  Discount: ${discountDecision.discountPercent}% off (${discountDecision.code}) expires ${discountDecision.expiryHours}h`);
    } else {
      console.log(`  Discount: None (${discountDecision.reason})`);
    }
  }

  async executeRecovery(checkout, recoveryPlan) {
    const { discountDecision, emailContent, cartAnalysis, customerSegment, sequencePosition, abVariants } = recoveryPlan;

    // 1. Create discount code in Shopify
    if (discountDecision.shouldDiscount) {
      const expiryDate = new Date(Date.now() + discountDecision.expiryHours * 60 * 60 * 1000);

      const discountCode = await createDiscountCode({
        code: discountDecision.code,
        valueType: discountDecision.freeShipping ? 'percentage' : 'percentage',
        value: discountDecision.freeShipping ? '-100' : String(-Math.abs(discountDecision.discountPercent)),
        usageLimit: 1,
        startsAt: new Date().toISOString(),
        endsAt: expiryDate.toISOString(),
        prerequisiteSubtotalRange: abandonedCartConfig.discountRules.minimumOrderValue,
      });

      if (discountCode) {
        console.log(`  Created discount: ${discountCode.code}`);
        this.results.discountsCreated++;

        // Log to Supabase for rate limiting
        if (supabase.enabled) {
          supabase.logDiscountCode({
            email: checkout.email,
            customerId: checkout.customer?.id,
            code: discountDecision.code,
            discountPercent: discountDecision.discountPercent,
            cartCategory: cartAnalysis.dominantCategory,
            expiresAt: expiryDate.toISOString(),
          });
        }
      } else {
        console.log(`  WARNING: Failed to create discount code`);
      }
    }

    // 2. Send email via Shopify (tag customer + set metafields)
    const sendResult = await this.emailSender.send(
      checkout,
      emailContent,
      discountDecision,
      cartAnalysis,
      sequencePosition
    );

    if (sendResult.success) {
      console.log(`  Email sent: ${sendResult.details}`);
      this.results.emailsSent++;
    } else {
      console.log(`  Email: ${sendResult.details}`);
      this.results.emailsFailed++;
    }

    // 3. Log to Supabase
    if (supabase.enabled) {
      supabase.logRecoverySession({
        checkoutId: checkout.id,
        email: checkout.email,
        customerId: checkout.customer?.id,
        cartValue: cartAnalysis.totalValue,
        cartCategory: cartAnalysis.dominantCategory,
        customerSegment: customerSegment.name,
        sequencePosition: sequencePosition.index + 1,
        emailId: sequencePosition.email.id,
        discountCode: discountDecision.code,
        discountPercent: discountDecision.discountPercent,
        status: sendResult.success ? 'sent' : 'failed',
      });

      // Log A/B test impressions
      for (const [element, variant] of Object.entries(abVariants)) {
        supabase.logABTestEvent(variant.testId, variant.variantId, 'send', checkout.id);
      }
    }
  }

  async generateReport() {
    console.log('\n  ABANDONED CART RECOVERY - ANALYTICS REPORT');
    console.log('  ===========================================\n');

    const checkouts = await getAbandonedCheckouts(168);

    if (checkouts.length === 0) {
      console.log('  No abandoned checkouts in the last 7 days.');
      return;
    }

    const report = await this.analytics.generateReport(checkouts, this);
    const revenueImpact = this.analytics.calculateRevenueImpact(report);
    this.analytics.printDashboard(report, revenueImpact);

    // Print Supabase stats if available
    if (supabase.enabled) {
      const sessions = supabase.getRecoveryStats(7);
      console.log(`  Recovery sessions logged (7d): ${sessions.length}`);
      const discounts = supabase.getDiscountStats(30);
      console.log(`  Discount codes issued (30d): ${discounts.length}`);

      // A/B test report
      this.abTestManager.generateReport();
    }

    return report;
  }

  printSummary() {
    const senderStats = this.emailSender.getSummary();

    console.log('\n===============================================================');
    console.log('  RUN SUMMARY');
    console.log('===============================================================');
    console.log(`  Total checkouts:       ${this.results.totalCheckouts}`);
    console.log(`  Processed:             ${this.results.processed}`);
    console.log(`  Skipped (duplicates):  ${this.results.duplicatesSkipped}`);
    console.log(`  Rate-limited:          ${this.results.rateLimited}`);
    console.log(`  Emails sent:           ${this.results.emailsSent}`);
    console.log(`  Email failures:        ${this.results.emailsFailed}`);
    console.log(`  Discounts created:     ${this.results.discountsCreated}`);
    console.log(`  Errors:                ${this.results.errors.length}`);
    console.log(`  Supabase:              ${supabase.enabled ? 'connected' : 'not configured'}`);

    if (Object.keys(this.results.segments).length > 0) {
      console.log('\n  Segments:');
      for (const [seg, count] of Object.entries(this.results.segments)) {
        console.log(`    ${seg}: ${count}`);
      }
    }

    if (Object.keys(this.results.categories).length > 0) {
      console.log('\n  Categories:');
      for (const [cat, count] of Object.entries(this.results.categories)) {
        console.log(`    ${cat}: ${count}`);
      }
    }

    if (DRY_RUN) {
      console.log('\n  DRY RUN - no changes made. Run with --execute to go live.\n');
    }

    if (this.results.errors.length > 0) {
      console.log('\n  Errors:');
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
    console.error('\nFatal error:', error.message);
    if (VERBOSE) console.error(error.stack);
    process.exit(1);
  }
}

main();
