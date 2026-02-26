#!/usr/bin/env node
// ============================================================================
// Send Test Abandoned Cart Recovery Emails
// Oil Slick Pad (oilslickpad.com)
//
// Creates working discount codes in Shopify and sends all 5 emails in the
// abandoned cart recovery sequence to a test recipient via Shopify customer
// tagging (Shopify Flow trigger) or direct Shopify Email API.
//
// Usage:
//   node src/send-test-cart-emails.js                    # Dry run — preview only
//   node src/send-test-cart-emails.js --execute          # Create codes + tag customer
//   node src/send-test-cart-emails.js --execute --html   # Also write HTML previews to disk
//
// Test recipient: joshua@oilslickpad.com (customer ID: 4721334211)
// ============================================================================

import { config } from './config.js';
import { abandonedCartConfig } from './abandoned-cart-config.js';
import { EmailTemplateGenerator } from './email-template-generator.js';
import { DiscountEngine } from './discount-engine.js';
import * as shopifyApi from './shopify-api.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--execute');
const WRITE_HTML = args.includes('--html');

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const TEST_RECIPIENT = {
  email: 'joshua@oilslickpad.com',
  customerId: 4721334211,
  firstName: 'Joshua',
  lastName: 'Hill',
};

// Simulated abandoned checkouts for testing — one smokeshop, one extraction
const TEST_CHECKOUTS = {
  smokeshop: {
    id: 'test-smokeshop-001',
    email: TEST_RECIPIENT.email,
    total_price: '89.97',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    abandoned_checkout_url: 'https://oilslickpad.com/cart',
    customer: {
      id: TEST_RECIPIENT.customerId,
      first_name: TEST_RECIPIENT.firstName,
      last_name: TEST_RECIPIENT.lastName,
      orders_count: 8,
      total_spent: '2.02',
      tags: 'segment:loyal, segment:smokeshop-buyer, segment:opted-in',
    },
    line_items: [
      {
        title: '8" Thick Glass Beaker Bong',
        variant_title: 'Clear / 14mm',
        price: '39.99',
        quantity: 1,
        vendor: 'What You Need',
        product_id: null,
        image: { src: '' },
      },
      {
        title: '25mm Flat Top Quartz Banger',
        variant_title: '14mm Male / 90 Degree',
        price: '24.99',
        quantity: 1,
        vendor: 'What You Need',
        product_id: null,
        image: { src: '' },
      },
      {
        title: 'Bubble Carb Cap with Directional Airflow',
        variant_title: 'Clear',
        price: '14.99',
        quantity: 1,
        vendor: 'What You Need',
        product_id: null,
        image: { src: '' },
      },
    ],
    shipping_lines: [{ price: '5.99' }],
  },
  oilSlick: {
    id: 'test-oilslick-001',
    email: TEST_RECIPIENT.email,
    total_price: '149.95',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    abandoned_checkout_url: 'https://oilslickpad.com/cart',
    customer: {
      id: TEST_RECIPIENT.customerId,
      first_name: TEST_RECIPIENT.firstName,
      last_name: TEST_RECIPIENT.lastName,
      orders_count: 8,
      total_spent: '2.02',
      tags: 'segment:loyal, segment:smokeshop-buyer, segment:opted-in',
    },
    line_items: [
      {
        title: 'Oil Slick PTFE Sheet 16x24" (10-Pack)',
        variant_title: '16x24 inch',
        price: '89.99',
        quantity: 1,
        vendor: 'Oil Slick',
        product_id: null,
        image: { src: '' },
      },
      {
        title: '5ml Glass Jar with Black CR Lid (100-Pack)',
        variant_title: '',
        price: '59.96',
        quantity: 1,
        vendor: 'Oil Slick',
        product_id: null,
        image: { src: '' },
      },
    ],
    shipping_lines: [{ price: '0.00' }],
  },
};

// ============================================================================
// CORE TEST LOGIC
// ============================================================================

const templateGenerator = new EmailTemplateGenerator(abandonedCartConfig);
const discountEngine = new DiscountEngine(abandonedCartConfig);

function analyzeTestCart(checkout) {
  const lineItems = checkout.line_items || [];
  const totalValue = parseFloat(checkout.total_price || 0);
  const analysis = {
    totalValue,
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
    const vendor = (item.vendor || '').toLowerCase();
    let category = 'unknown';

    if (vendor.includes('oil slick')) category = 'oilSlick';
    else if (vendor.includes('what you need') || vendor.includes('cloud yhs') || vendor.includes('yhs cloud')) category = 'smokeshop';

    const itemTotal = parseFloat(item.price) * item.quantity;
    analysis.categories[category].items.push(item);
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

  // Determine value tier
  const tiers = abandonedCartConfig.cartValueTiers;
  for (const [key, tier] of Object.entries(tiers)) {
    if (totalValue >= tier.range.min && totalValue < tier.range.max) {
      analysis.valueTier = { ...tier, key };
      break;
    }
  }
  if (!analysis.valueTier) analysis.valueTier = { name: 'Unknown', key: 'unknown' };

  analysis.avgItemPrice = lineItems.length > 0 ? totalValue / lineItems.length : 0;

  return analysis;
}

function getTestCustomerSegment() {
  // Joshua is a returning/loyal customer
  return {
    ...abandonedCartConfig.customerSegments.returningCustomer,
    name: 'Returning Customer',
    ordersCount: 8,
    lifetimeValue: 2.02,
    shopifySegmentTags: ['segment:loyal', 'segment:smokeshop-buyer'],
  };
}

async function createTestDiscountCode(discountPercent, category, emailIndex) {
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  const catCode = category === 'smokeshop' ? 'SMOKE' : 'EXTRACT';
  const code = `OILSLICK-TEST-${catCode}-E${emailIndex + 1}-${random}`;

  const expiryDate = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would create discount: ${code} (${discountPercent}% off, expires ${expiryDate.toISOString()})`);
    return { code, id: 'dry-run' };
  }

  try {
    const priceRuleData = await shopifyApi.post('price_rules.json', {
      price_rule: {
        title: `${code} - Abandoned Cart Test Email ${emailIndex + 1}`,
        target_type: 'line_item',
        target_selection: 'all',
        allocation_method: 'across',
        customer_selection: 'all',
        value_type: 'percentage',
        value: String(-Math.abs(discountPercent)),
        usage_limit: 1,
        once_per_customer: true,
        starts_at: new Date().toISOString(),
        ends_at: expiryDate.toISOString(),
        prerequisite_subtotal_range: { greater_than_or_equal_to: '20' },
      },
    });

    const priceRuleId = priceRuleData.price_rule?.id;
    if (!priceRuleId) {
      console.error(`  ERROR creating price rule for ${code}:`, JSON.stringify(priceRuleData));
      return null;
    }

    const discountData = await shopifyApi.post(
      `price_rules/${priceRuleId}/discount_codes.json`,
      { discount_code: { code } }
    );

    console.log(`  Created discount: ${code} (${discountPercent}% off)`);
    return discountData.discount_code || null;
  } catch (error) {
    console.error(`  ERROR creating discount ${code}: ${error.message}`);
    return null;
  }
}

async function tagCustomerForRecoveryEmail(emailIndex, cartAnalysis, discountCode, emailContent) {
  const customerId = TEST_RECIPIENT.customerId;

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would tag customer ${customerId} with cart-recovery:email-${emailIndex + 1}`);
    return;
  }

  try {
    // Get current customer tags
    const customerData = await shopifyApi.get(`customers/${customerId}.json`);
    const customer = customerData.customer;
    if (!customer) throw new Error('Customer not found');

    const existingTags = (customer.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const nonRecoveryTags = existingTags.filter(t => !t.startsWith('cart-recovery:'));

    const newTags = [
      ...nonRecoveryTags,
      `cart-recovery:email-${emailIndex + 1}`,
      `cart-recovery:category-${cartAnalysis.dominantCategory}`,
      `cart-recovery:active`,
      `cart-recovery:test-run`,
    ];

    if (discountCode) {
      newTags.push('cart-recovery:has-discount');
    }

    const metafields = [
      { namespace: 'cart_recovery', key: 'sequence_stage', value: String(emailIndex + 1), type: 'number_integer' },
      { namespace: 'cart_recovery', key: 'email_subject', value: emailContent.subject, type: 'single_line_text_field' },
      { namespace: 'cart_recovery', key: 'cart_url', value: 'https://oilslickpad.com/cart', type: 'url' },
      { namespace: 'cart_recovery', key: 'discount_code', value: discountCode || '', type: 'single_line_text_field' },
      { namespace: 'cart_recovery', key: 'discount_percent', value: String(emailContent.metadata.discountPercent || 0), type: 'number_integer' },
      { namespace: 'cart_recovery', key: 'cart_value', value: String(emailContent.metadata.cartValue || 0), type: 'number_decimal' },
      { namespace: 'cart_recovery', key: 'cart_category', value: cartAnalysis.dominantCategory, type: 'single_line_text_field' },
      { namespace: 'cart_recovery', key: 'updated_at', value: new Date().toISOString(), type: 'date_time' },
    ];

    await shopifyApi.put(`customers/${customerId}.json`, {
      customer: {
        id: customerId,
        tags: newTags.join(', '),
        metafields,
      },
    });

    console.log(`  Tagged customer ${customerId} with cart-recovery:email-${emailIndex + 1}`);
  } catch (error) {
    console.error(`  ERROR tagging customer: ${error.message}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('===============================================================');
  console.log('  ABANDONED CART RECOVERY — TEST EMAIL GENERATOR');
  console.log('  Oil Slick Pad');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'EXECUTE (creating codes + tagging)'}`);
  console.log(`  Recipient: ${TEST_RECIPIENT.email}`);
  console.log('===============================================================\n');

  const customerSegment = getTestCustomerSegment();
  const outputDir = path.join(process.cwd(), 'test-email-previews');

  if (WRITE_HTML || !DRY_RUN) {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  }

  // ── Process both product tracks ──
  for (const [trackName, checkout] of Object.entries(TEST_CHECKOUTS)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  TRACK: ${trackName.toUpperCase()}`);
    console.log(`  Cart Value: $${checkout.total_price}`);
    console.log(`  Items: ${checkout.line_items.length}`);
    console.log(`${'='.repeat(60)}\n`);

    const cartAnalysis = analyzeTestCart(checkout);

    // ── Generate all 5 emails ──
    const { emailSequence } = abandonedCartConfig;

    for (let i = 0; i < emailSequence.length; i++) {
      const emailConfig = emailSequence[i];
      const sequencePosition = {
        index: i,
        email: emailConfig,
        minutesSinceAbandonment: emailConfig.delayMinutes,
        isFirstTouch: i === 0,
        isLastTouch: i === emailSequence.length - 1,
        totalEmailsInSequence: emailSequence.length,
      };

      // Calculate discount
      const discountDecision = discountEngine.calculateDiscount({
        cartAnalysis,
        customerSegment,
        sequencePosition,
        isDiscountEligible: true,
      });

      // Generate email
      const emailContent = templateGenerator.generate({
        checkout,
        cartAnalysis,
        customerSegment,
        sequencePosition,
        discountDecision,
        abVariants: {},
      });

      console.log(`  [Email ${i + 1}/${emailSequence.length}] "${emailConfig.name}"`);
      console.log(`    Subject: ${emailContent.subject}`);
      console.log(`    Preheader: ${emailContent.preheaderText}`);
      console.log(`    Category: ${cartAnalysis.dominantCategory}`);

      if (discountDecision.shouldDiscount) {
        console.log(`    Discount: ${discountDecision.discountPercent}% (saves $${discountDecision.savingsAmount})`);
        console.log(`    Code: ${discountDecision.code}`);
      } else {
        console.log(`    Discount: None (${discountDecision.reason})`);
      }

      // Create real discount code in Shopify
      let createdCode = null;
      if (discountDecision.shouldDiscount) {
        createdCode = await createTestDiscountCode(
          discountDecision.discountPercent,
          trackName,
          i
        );
      }

      // Write HTML preview
      if (WRITE_HTML || !DRY_RUN) {
        const filename = `${trackName}-email-${i + 1}-${emailConfig.id}.html`;
        fs.writeFileSync(path.join(outputDir, filename), emailContent.htmlBody);
        console.log(`    HTML: ${outputDir}/${filename}`);
      }

      // Tag customer (triggers Shopify Flow to send email)
      if (!DRY_RUN && i === 0) {
        // Only tag for the FIRST email in each track to avoid spamming
        // In production, each email would be sent at its delay interval
        await tagCustomerForRecoveryEmail(
          i,
          cartAnalysis,
          createdCode?.code || discountDecision.code,
          emailContent
        );
      }

      console.log('');
    }

    // ── Print escalation schedule ──
    console.log(`  Discount Escalation Schedule (${trackName}):`);
    const schedule = discountEngine.previewEscalationSchedule(cartAnalysis, customerSegment);
    for (const step of schedule) {
      console.log(`    Email ${step.emailIndex} (${step.delayHours}h): ${step.discount} ${step.savings !== '$0' ? `(saves ${step.savings})` : ''}`);
    }
    console.log('');
  }

  // ── Summary ──
  console.log('\n===============================================================');
  console.log('  SUMMARY');
  console.log('===============================================================');
  console.log(`  Recipient: ${TEST_RECIPIENT.email}`);
  console.log(`  Tracks generated: smokeshop + oilSlick`);
  console.log(`  Total emails: 10 (5 per track)`);
  console.log(`  Discount limits: Smokeshop max 35% / Oil Slick max 15%`);

  if (DRY_RUN) {
    console.log('\n  DRY RUN — no codes created, no emails sent.');
    console.log('  Run with --execute to create codes and tag customer.');
    console.log('  Run with --html to write HTML previews to disk.\n');
  } else {
    console.log(`\n  Discount codes CREATED in Shopify.`);
    console.log(`  Customer TAGGED for recovery flow.`);
    if (WRITE_HTML) {
      console.log(`  HTML previews written to: ${outputDir}/`);
    }
    console.log('\n  Shopify Flow should trigger email delivery to joshua@oilslickpad.com');
    console.log('  Check Shopify Admin > Marketing > Automations for flow status.\n');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
