// ============================================================================
// Cart Analyzer Module
// Classifies and scores abandoned carts for optimal recovery strategy
// ============================================================================

export class CartAnalyzer {
  constructor(config) {
    this.config = config;
  }

  /**
   * Determines the cart value tier from configuration.
   */
  getCartValueTier(totalValue) {
    const { cartValueTiers } = this.config;

    for (const [key, tier] of Object.entries(cartValueTiers)) {
      if (totalValue >= tier.range.min && totalValue < tier.range.max) {
        return { ...tier, key };
      }
    }

    // Fallback to highest tier
    return { ...cartValueTiers.whale, key: 'whale' };
  }

  /**
   * Calculates a recovery priority score (0-100) based on multiple signals.
   * Higher score = more effort should be spent recovering this cart.
   */
  calculateRecoveryScore(cartAnalysis, customerSegment) {
    let score = 0;

    // ── Cart value component (0-35 points) ──
    const value = cartAnalysis.totalValue;
    if (value >= 500) score += 35;
    else if (value >= 200) score += 28;
    else if (value >= 100) score += 22;
    else if (value >= 50) score += 15;
    else if (value >= 25) score += 8;
    else score += 3;

    // ── Customer segment component (0-25 points) ──
    const segmentScores = {
      'Wholesale Lead': 25,
      'Loyal Customer': 22,
      'Returning Customer': 20,
      'New Customer': 15,
      'New Visitor': 10,
    };
    score += segmentScores[customerSegment.name] || 10;

    // ── Margin opportunity component (0-20 points) ──
    // Smokeshop items have higher margins so recovery is more profitable
    if (cartAnalysis.dominantCategory === 'smokeshop') {
      score += 20;
    } else if (cartAnalysis.dominantCategory === 'oilSlick') {
      score += 8; // Still worth recovering but lower profit per sale
    } else {
      score += 12;
    }

    // ── Cart completeness component (0-10 points) ──
    // More items = more invested browsing time = higher intent
    if (cartAnalysis.itemCount >= 5) score += 10;
    else if (cartAnalysis.itemCount >= 3) score += 7;
    else if (cartAnalysis.itemCount >= 2) score += 5;
    else score += 2;

    // ── Recency component (0-10 points) ──
    // Fresher abandonment = warmer intent
    // This is calculated externally; placeholder score for recently abandoned
    score += 5;

    return Math.min(100, score);
  }

  /**
   * Analyzes why a cart may have been abandoned based on available signals.
   * Returns an array of probable abandonment reasons with confidence scores.
   */
  inferAbandonmentReasons(cartAnalysis, checkout) {
    const reasons = [];

    // High cart value → price shock
    if (cartAnalysis.totalValue > 150) {
      reasons.push({
        reason: 'price_shock',
        confidence: 0.7,
        description: 'Cart total may have caused sticker shock',
        mitigation: 'Show price breakdown, offer payment plans, highlight value',
      });
    }

    // Single expensive item → comparison shopping
    if (cartAnalysis.itemCount === 1 && cartAnalysis.avgItemPrice > 75) {
      reasons.push({
        reason: 'comparison_shopping',
        confidence: 0.6,
        description: 'Likely comparing prices across stores',
        mitigation: 'Emphasize unique value, show competitor price match if applicable',
      });
    }

    // No customer account → trust issues
    if (!checkout.customer?.id) {
      reasons.push({
        reason: 'trust_concern',
        confidence: 0.5,
        description: 'New visitor may not trust the store with payment info',
        mitigation: 'Show security badges, reviews, return policy',
      });
    }

    // Cart below free shipping threshold → shipping cost surprise
    const freeShipThreshold = this.config.productCategories.smokeshop.freeShippingThreshold;
    if (freeShipThreshold && cartAnalysis.totalValue < freeShipThreshold) {
      reasons.push({
        reason: 'shipping_cost',
        confidence: 0.65,
        description: 'Shipping costs may have been unexpected',
        mitigation: `Show "You're $${(freeShipThreshold - cartAnalysis.totalValue).toFixed(0)} from free shipping" message`,
      });
    }

    // Multiple items in cart → distraction / decision fatigue
    if (cartAnalysis.itemCount >= 4) {
      reasons.push({
        reason: 'decision_fatigue',
        confidence: 0.4,
        description: 'Too many items may have led to choice paralysis',
        mitigation: 'Highlight top-rated item, suggest a curated bundle',
      });
    }

    // Default: generic distraction
    reasons.push({
      reason: 'distraction',
      confidence: 0.5,
      description: 'Customer was interrupted or lost focus',
      mitigation: 'Simple reminder with direct cart link',
    });

    // Sort by confidence descending
    return reasons.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Determines the optimal recovery channel mix for this cart.
   */
  getChannelStrategy(cartAnalysis, customerSegment) {
    const tier = cartAnalysis.valueTier;
    const tierConfig = this.config.cartValueTiers[tier?.key] || this.config.cartValueTiers.small;

    const channels = {
      email: {
        enabled: true,
        maxEmails: tierConfig.maxEmails,
        priority: 'primary',
      },
      sms: {
        enabled: tierConfig.enableSMS && !!customerSegment.phone,
        priority: 'secondary',
      },
      retargeting: {
        enabled: tierConfig.enableRetargeting,
        platforms: ['facebook', 'google'],
        priority: 'supplementary',
      },
      personalOutreach: {
        enabled: tier?.key === 'whale',
        method: 'phone_call',
        priority: 'primary',
      },
    };

    return channels;
  }

  /**
   * Determines cross-sell recommendations based on cart contents.
   */
  getCrossSellRecommendations(cartAnalysis) {
    const { crossSell } = this.config;
    if (!crossSell.enabled) return [];

    const recommendations = [];
    const cartFamilies = new Set();

    // Gather product families from cart
    for (const category of Object.values(cartAnalysis.categories)) {
      for (const item of category.items) {
        // Extract family from tags if available
        const tags = (item.tags || '').split(',').map(t => t.trim());
        for (const tag of tags) {
          if (tag.startsWith('family:')) {
            cartFamilies.add(tag.replace('family:', ''));
          }
        }
      }
    }

    // Find complementary products
    const complementaryRules = crossSell.strategies.find(s => s.name === 'complementary_by_family');
    if (complementaryRules) {
      for (const family of cartFamilies) {
        const complements = complementaryRules.rules[family] || [];
        for (const complement of complements) {
          if (!cartFamilies.has(complement)) {
            recommendations.push({
              family: complement,
              reason: `Complements ${family} in cart`,
              strategy: 'complementary',
            });
          }
        }
      }
    }

    return recommendations.slice(0, crossSell.maxRecommendations);
  }

  /**
   * Determines if a mixed cart (Oil Slick + Smokeshop items) needs
   * special handling with split discount codes.
   */
  analyzeMixedCart(cartAnalysis) {
    if (!cartAnalysis.isMixedCart) {
      return {
        isMixed: false,
        strategy: 'single_discount',
        description: 'Single category cart - use standard discount',
      };
    }

    const oilSlickPercent = (cartAnalysis.categories.oilSlick.subtotal / cartAnalysis.totalValue) * 100;
    const smokeshopPercent = (cartAnalysis.categories.smokeshop.subtotal / cartAnalysis.totalValue) * 100;

    // If one category dominates (>80%), treat as single category
    if (oilSlickPercent > 80) {
      return {
        isMixed: true,
        strategy: 'dominant_oilslick',
        description: 'Oil Slick dominant - use Oil Slick discount ceiling',
        effectiveMaxDiscount: this.config.productCategories.oilSlick.maxDiscountPercent,
      };
    }

    if (smokeshopPercent > 80) {
      return {
        isMixed: true,
        strategy: 'dominant_smokeshop',
        description: 'Smokeshop dominant - use Smokeshop discount ceiling',
        effectiveMaxDiscount: this.config.productCategories.smokeshop.maxDiscountPercent,
      };
    }

    // Truly mixed cart: use weighted average of max discounts
    const weightedMax = (
      (oilSlickPercent / 100) * this.config.productCategories.oilSlick.maxDiscountPercent +
      (smokeshopPercent / 100) * this.config.productCategories.smokeshop.maxDiscountPercent
    );

    return {
      isMixed: true,
      strategy: 'weighted_discount',
      description: `Mixed cart (${oilSlickPercent.toFixed(0)}% Oil Slick / ${smokeshopPercent.toFixed(0)}% Smokeshop) - weighted max ${weightedMax.toFixed(0)}%`,
      effectiveMaxDiscount: Math.round(weightedMax),
      oilSlickPercent,
      smokeshopPercent,
    };
  }
}

export default CartAnalyzer;
