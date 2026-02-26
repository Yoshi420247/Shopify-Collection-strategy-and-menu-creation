// ============================================================================
// Discount Engine
// Calculates optimal discount amounts respecting category margins and
// preventing discount abuse.
//
// Key constraints:
//   - Oil Slick / Extraction products: MAX 15% discount (low margins)
//   - Smokeshop products (Cloud YHS / What You Need / YHS Cloud): MAX 35% discount
//   - Mixed carts: Weighted discount based on category split
//   - Serial abandoners: Rate-limited to prevent gaming
//   - Loyal customers: Use loyalty rewards, not discounts
// ============================================================================

import crypto from 'crypto';

export class DiscountEngine {
  constructor(config) {
    this.config = config;
  }

  /**
   * Main entry point. Calculates the right discount for a specific cart/customer/sequence combo.
   *
   * @returns {Object} discountDecision
   *   - shouldDiscount: boolean
   *   - discountPercent: number
   *   - code: string
   *   - reason: string
   *   - expiryHours: number
   *   - valueType: string
   */
  calculateDiscount({ cartAnalysis, customerSegment, sequencePosition, isDiscountEligible }) {
    const emailConfig = sequencePosition.email;

    // ── Rule 1: No discount if sequence position doesn't call for it ──
    if (emailConfig.strategy === 'no_discount' || emailConfig.strategy === 'social_proof_only') {
      return {
        shouldDiscount: false,
        discountPercent: 0,
        code: null,
        reason: `Sequence position "${emailConfig.name}" does not include discounts`,
        expiryHours: 0,
        valueType: null,
      };
    }

    // ── Rule 2: No discount if customer is rate-limited ──
    if (!isDiscountEligible) {
      return {
        shouldDiscount: false,
        discountPercent: 0,
        code: null,
        reason: 'Customer has exceeded discount rate limits',
        expiryHours: 0,
        valueType: null,
      };
    }

    // ── Rule 3: Loyal customers get loyalty messaging, not cart discounts ──
    if (customerSegment.name === 'Loyal Customer') {
      return {
        shouldDiscount: false,
        discountPercent: 0,
        code: null,
        reason: 'Loyal customer - use loyalty perks instead of cart discounts',
        expiryHours: 0,
        valueType: null,
        useAlternativeStrategy: 'loyalty_points',
      };
    }

    // ── Rule 4: Calculate category-aware discount ──
    const baseDiscount = this.getBaseDiscountForSequence(emailConfig, cartAnalysis);
    const adjustedDiscount = this.applySegmentMultiplier(baseDiscount, customerSegment);
    const cappedDiscount = this.enforceDiscountCeiling(adjustedDiscount, cartAnalysis);

    // ── Rule 5: Ensure minimum value proposition ──
    // A discount of less than 5% on a low-value cart isn't worth the effort
    if (cappedDiscount < 5 && cartAnalysis.totalValue < 50) {
      // Switch to free shipping instead if applicable
      const freeShipThreshold = this.config.productCategories.smokeshop.freeShippingThreshold;
      if (freeShipThreshold && cartAnalysis.totalValue >= freeShipThreshold * 0.7) {
        return {
          shouldDiscount: true,
          discountPercent: 0,
          code: this.generateCode(customerSegment, 'FREESHIP'),
          reason: 'Small percentage discount replaced with free shipping offer',
          expiryHours: emailConfig.discountExpiry?.hours || 48,
          valueType: 'free_shipping',
          freeShipping: true,
        };
      }
    }

    // ── Generate unique code ──
    const code = this.generateCode(customerSegment, cappedDiscount);

    return {
      shouldDiscount: true,
      discountPercent: cappedDiscount,
      code,
      reason: `${emailConfig.name}: ${cappedDiscount}% off for ${customerSegment.name}`,
      expiryHours: emailConfig.discountExpiry?.hours || 48,
      valueType: 'percentage',
      freeShipping: false,
      savingsAmount: (cartAnalysis.totalValue * cappedDiscount / 100).toFixed(2),
    };
  }

  /**
   * Gets the base discount percentage defined for this sequence position.
   */
  getBaseDiscountForSequence(emailConfig, cartAnalysis) {
    if (!emailConfig.discountEscalation) return 0;

    const category = cartAnalysis.dominantCategory;

    if (category === 'oilSlick' && emailConfig.discountEscalation.oilSlick) {
      return emailConfig.discountEscalation.oilSlick.percent;
    }

    if (category === 'smokeshop' && emailConfig.discountEscalation.smokeshop) {
      return emailConfig.discountEscalation.smokeshop.percent;
    }

    // Mixed/unknown: use the more conservative (Oil Slick) discount
    if (emailConfig.discountEscalation.oilSlick) {
      return emailConfig.discountEscalation.oilSlick.percent;
    }

    return 0;
  }

  /**
   * Adjusts discount based on customer segment multiplier.
   *
   * - New visitors get smaller discounts (earn with trust, not $$)
   * - Returning customers get full configured discount
   * - Loyal customers are excluded from cart discounts entirely
   */
  applySegmentMultiplier(baseDiscount, customerSegment) {
    const multiplier = customerSegment.discountMultiplier || 1.0;
    return Math.round(baseDiscount * multiplier);
  }

  /**
   * Enforces the hard discount ceiling per product category.
   * This is the critical margin protection mechanism.
   */
  enforceDiscountCeiling(discount, cartAnalysis) {
    const { productCategories } = this.config;
    const category = cartAnalysis.dominantCategory;

    let maxDiscount;

    if (category === 'oilSlick') {
      maxDiscount = productCategories.oilSlick.maxDiscountPercent; // 10%
    } else if (category === 'smokeshop') {
      maxDiscount = productCategories.smokeshop.maxDiscountPercent; // 40%
    } else if (cartAnalysis.isMixedCart) {
      // For mixed carts, use weighted maximum
      const oilSlickWeight = cartAnalysis.categories.oilSlick.subtotal / cartAnalysis.totalValue;
      const smokeshopWeight = cartAnalysis.categories.smokeshop.subtotal / cartAnalysis.totalValue;
      maxDiscount = Math.round(
        oilSlickWeight * productCategories.oilSlick.maxDiscountPercent +
        smokeshopWeight * productCategories.smokeshop.maxDiscountPercent
      );
    } else {
      // Unknown category: use the conservative ceiling
      maxDiscount = productCategories.oilSlick.maxDiscountPercent; // 10%
    }

    return Math.min(discount, maxDiscount);
  }

  /**
   * Generates a unique, single-use discount code.
   * Format: OILSLICK-{SEGMENT_CODE}-{RANDOM}
   */
  generateCode(customerSegment, discountOrLabel) {
    const segmentCodes = {
      'New Visitor': 'NV',
      'New Customer': 'NC',
      'Returning Customer': 'RC',
      'Loyal Customer': 'VIP',
      'Wholesale Lead': 'WS',
    };

    const segCode = segmentCodes[customerSegment.name] || 'XX';
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    const label = typeof discountOrLabel === 'string' ? discountOrLabel : `${discountOrLabel}OFF`;

    return `OILSLICK-${segCode}-${label}-${random}`;
  }

  /**
   * Calculates the discount escalation schedule for a full sequence.
   * Useful for previewing what discounts a customer will see across all emails.
   */
  previewEscalationSchedule(cartAnalysis, customerSegment) {
    const { emailSequence } = this.config;
    const schedule = [];

    for (let i = 0; i < emailSequence.length; i++) {
      const email = emailSequence[i];
      const decision = this.calculateDiscount({
        cartAnalysis,
        customerSegment,
        sequencePosition: { index: i, email },
        isDiscountEligible: true,
      });

      schedule.push({
        emailIndex: i + 1,
        emailName: email.name,
        delayHours: email.delayMinutes / 60,
        discount: decision.shouldDiscount ? `${decision.discountPercent}%` : 'None',
        reason: decision.reason,
        savings: decision.savingsAmount ? `$${decision.savingsAmount}` : '$0',
      });
    }

    return schedule;
  }

  /**
   * Validates that a proposed discount doesn't violate any business rules.
   * Returns { valid: boolean, violations: string[] }
   */
  validateDiscount(discountPercent, cartAnalysis) {
    const violations = [];
    const { productCategories } = this.config;

    // Check category ceiling
    if (cartAnalysis.dominantCategory === 'oilSlick') {
      if (discountPercent > productCategories.oilSlick.maxDiscountPercent) {
        violations.push(
          `Oil Slick discount ${discountPercent}% exceeds maximum ${productCategories.oilSlick.maxDiscountPercent}%`
        );
      }
    }

    if (cartAnalysis.dominantCategory === 'smokeshop') {
      if (discountPercent > productCategories.smokeshop.maxDiscountPercent) {
        violations.push(
          `Smokeshop discount ${discountPercent}% exceeds maximum ${productCategories.smokeshop.maxDiscountPercent}%`
        );
      }
    }

    // Check minimum order value
    const minOrder = this.config.discountRules.minimumOrderValue;
    const discountedTotal = cartAnalysis.totalValue * (1 - discountPercent / 100);
    if (discountedTotal < minOrder) {
      violations.push(
        `Discounted total $${discountedTotal.toFixed(2)} falls below minimum order $${minOrder}`
      );
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }
}

export default DiscountEngine;
