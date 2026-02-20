// ============================================================================
// Shopify Email Sender
//
// Bridges the recovery engine with Shopify's native email system.
//
// How it works:
//   1. Engine decides what email to send (content, discount, timing)
//   2. This module tags the customer and sets metafields via Admin API
//   3. Shopify Flow automations trigger on the tags and send Shopify Emails
//   4. The metafields carry all dynamic data (discount code, cart URL, etc.)
//
// Customer tags added (Shopify Flow triggers on these):
//   - cart-recovery:email-1  through  cart-recovery:email-5
//   - cart-recovery:has-discount
//   - cart-recovery:category-oilslick  or  cart-recovery:category-smokeshop
//
// Customer metafields set (Shopify Email templates read these):
//   - cart_recovery.discount_code
//   - cart_recovery.discount_percent
//   - cart_recovery.cart_url
//   - cart_recovery.email_subject
//   - cart_recovery.email_body_html
//   - cart_recovery.sequence_stage
// ============================================================================

import * as shopifyApi from './shopify-api.js';

const METAFIELD_NAMESPACE = 'cart_recovery';

export class ShopifyEmailSender {
  constructor() {
    this.sentCount = 0;
    this.errorCount = 0;
  }

  /**
   * Sends a recovery email by tagging the customer and setting metafields.
   * Shopify Flow picks up the tag change and sends the actual email.
   *
   * @param {Object} checkout - The abandoned checkout object
   * @param {Object} emailContent - Generated email content (subject, html, text, metadata)
   * @param {Object} discountDecision - Discount calculation result
   * @param {Object} cartAnalysis - Cart classification data
   * @param {Object} sequencePosition - Which email in the sequence
   * @returns {Object} { success, method, details }
   */
  async send(checkout, emailContent, discountDecision, cartAnalysis, sequencePosition) {
    const customerId = checkout.customer?.id;

    if (!customerId) {
      // No Shopify customer record — store email for manual follow-up
      console.log(`  ⚠️  No customer ID for ${checkout.email} — logging for manual outreach`);
      return {
        success: false,
        method: 'manual',
        details: 'No Shopify customer record — email content logged for manual send',
      };
    }

    try {
      // Step 1: Build metafields with all dynamic email data
      const metafields = this.buildMetafields(checkout, emailContent, discountDecision, cartAnalysis, sequencePosition);

      // Step 2: Build recovery tags
      const tags = this.buildTags(cartAnalysis, discountDecision, sequencePosition);

      // Step 3: Update the customer via REST API (tags + metafields)
      await this.updateCustomer(customerId, tags, metafields);

      this.sentCount++;
      return {
        success: true,
        method: 'shopify_flow',
        details: `Tagged customer ${customerId} with ${tags.join(', ')} — Shopify Flow will send email`,
      };
    } catch (error) {
      this.errorCount++;
      console.error(`  ❌ Failed to tag customer ${customerId}: ${error.message}`);
      return {
        success: false,
        method: 'error',
        details: error.message,
      };
    }
  }

  /**
   * Builds metafields that carry the email content for Shopify Flow / Shopify Email.
   */
  buildMetafields(checkout, emailContent, discountDecision, cartAnalysis, sequencePosition) {
    const cartUrl = checkout.abandoned_checkout_url || 'https://oilslickpad.com/cart';
    const discountUrl = discountDecision.code
      ? `${cartUrl}${cartUrl.includes('?') ? '&' : '?'}discount=${encodeURIComponent(discountDecision.code)}`
      : cartUrl;

    return [
      {
        namespace: METAFIELD_NAMESPACE,
        key: 'sequence_stage',
        value: String(sequencePosition.index + 1),
        type: 'number_integer',
      },
      {
        namespace: METAFIELD_NAMESPACE,
        key: 'email_subject',
        value: emailContent.subject,
        type: 'single_line_text_field',
      },
      {
        namespace: METAFIELD_NAMESPACE,
        key: 'cart_url',
        value: discountUrl,
        type: 'url',
      },
      {
        namespace: METAFIELD_NAMESPACE,
        key: 'discount_code',
        value: discountDecision.code || '',
        type: 'single_line_text_field',
      },
      {
        namespace: METAFIELD_NAMESPACE,
        key: 'discount_percent',
        value: String(discountDecision.discountPercent || 0),
        type: 'number_integer',
      },
      {
        namespace: METAFIELD_NAMESPACE,
        key: 'cart_value',
        value: cartAnalysis.totalValue.toFixed(2),
        type: 'number_decimal',
      },
      {
        namespace: METAFIELD_NAMESPACE,
        key: 'cart_category',
        value: cartAnalysis.dominantCategory,
        type: 'single_line_text_field',
      },
      {
        namespace: METAFIELD_NAMESPACE,
        key: 'email_body_html',
        value: emailContent.htmlBody,
        type: 'multi_line_text_field',
      },
      {
        namespace: METAFIELD_NAMESPACE,
        key: 'updated_at',
        value: new Date().toISOString(),
        type: 'date_time',
      },
    ];
  }

  /**
   * Builds tags that Shopify Flow triggers on.
   */
  buildTags(cartAnalysis, discountDecision, sequencePosition) {
    const tags = [];

    // Sequence position tag — Shopify Flow triggers on this
    tags.push(`cart-recovery:email-${sequencePosition.index + 1}`);

    // Category tag
    tags.push(`cart-recovery:category-${cartAnalysis.dominantCategory}`);

    // Discount flag
    if (discountDecision.shouldDiscount) {
      tags.push('cart-recovery:has-discount');
    }

    // Active flag (Flow can check this to see if recovery is in progress)
    tags.push('cart-recovery:active');

    return tags;
  }

  /**
   * Updates a Shopify customer with tags and metafields.
   * Preserves existing tags (appends, doesn't overwrite).
   */
  async updateCustomer(customerId, newTags, metafields) {
    // First, get current customer to preserve existing tags
    const customerData = await shopifyApi.get(`customers/${customerId}.json`);
    const customer = customerData.customer;

    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    // Merge tags: remove old cart-recovery tags, add new ones
    const existingTags = (customer.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const nonRecoveryTags = existingTags.filter(t => !t.startsWith('cart-recovery:'));
    const mergedTags = [...nonRecoveryTags, ...newTags].join(', ');

    // Update customer with tags + metafields
    await shopifyApi.put(`customers/${customerId}.json`, {
      customer: {
        id: customerId,
        tags: mergedTags,
        metafields,
      },
    });
  }

  /**
   * Clears recovery tags from a customer (call after recovery completes or expires).
   */
  async clearRecoveryTags(customerId) {
    try {
      const customerData = await shopifyApi.get(`customers/${customerId}.json`);
      const customer = customerData.customer;
      if (!customer) return;

      const existingTags = (customer.tags || '').split(',').map(t => t.trim()).filter(Boolean);
      const cleanedTags = existingTags.filter(t => !t.startsWith('cart-recovery:')).join(', ');

      await shopifyApi.put(`customers/${customerId}.json`, {
        customer: { id: customerId, tags: cleanedTags },
      });
    } catch (error) {
      console.error(`  Failed to clear recovery tags for customer ${customerId}: ${error.message}`);
    }
  }

  /**
   * Returns summary stats for this run.
   */
  getSummary() {
    return {
      sent: this.sentCount,
      errors: this.errorCount,
    };
  }
}

export default ShopifyEmailSender;
