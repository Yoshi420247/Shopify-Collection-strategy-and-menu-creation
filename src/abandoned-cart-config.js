// Abandoned Cart Workflow Configuration
// Tailored for Oil Slick Pad (oilslickpad.com)
//
// Two product categories with distinct margin profiles:
//   - Oil Slick (tagged "Oil Slick"): Packaging & extraction - low margin, max 10% discount
//   - Smokeshop (tagged "Cloud YHS" or "What You Need"): Higher margin, max 40% discount

export const abandonedCartConfig = {

  // =========================================================================
  // PRODUCT CATEGORY DEFINITIONS
  // Used to classify cart items and determine discount ceilings
  // =========================================================================
  productCategories: {
    oilSlick: {
      name: 'Oil Slick / Extraction',
      description: 'Packaging & extraction supplies (silicone pads, FEP, PTFE, jars)',
      identifiers: {
        vendors: ['Oil Slick'],
        tags: ['Oil Slick'],
      },
      maxDiscountPercent: 15,   // Updated per owner: max 15% for extraction / Oil Slick vendor
      marginProfile: 'low',
      freeShippingThreshold: null, // Do not offer free shipping on low-margin items
    },
    smokeshop: {
      name: 'Smokeshop',
      description: 'Smoke & vape devices and accessories (YHS Cloud, What You Need, All In Smokeshop)',
      identifiers: {
        vendors: ['What You Need', 'Cloud YHS', 'YHS Cloud'],
        tags: ['Cloud YHS', 'What You Need', 'YHS Cloud'],
        collections: ['smoke-and-vape', 'all-accessories', 'all-bongs', 'all-rigs', 'all-pipes'],
      },
      maxDiscountPercent: 35,   // Updated per owner: max 35% for smokeshop products
      marginProfile: 'high',
      freeShippingThreshold: 75, // Free shipping at $75+ for smokeshop items
    },
  },

  // =========================================================================
  // CUSTOMER SEGMENTS
  // Determines messaging tone, discount aggressiveness, and channel strategy
  // =========================================================================
  customerSegments: {
    newVisitor: {
      name: 'New Visitor',
      description: 'First-time site visitor, no purchase history',
      criteria: { ordersCount: 0, hasAccount: false },
      priority: 'medium',
      trustLevel: 'low',
      discountMultiplier: 0.7, // More conservative - earn the sale with trust, not discounts
    },
    newCustomer: {
      name: 'New Customer',
      description: 'Has account but no completed orders',
      criteria: { ordersCount: 0, hasAccount: true },
      priority: 'high',
      trustLevel: 'medium',
      discountMultiplier: 0.85,
    },
    returningCustomer: {
      name: 'Returning Customer',
      description: '1-3 previous orders',
      criteria: { ordersCountMin: 1, ordersCountMax: 3 },
      priority: 'high',
      trustLevel: 'high',
      discountMultiplier: 1.0,
    },
    loyalCustomer: {
      name: 'Loyal Customer',
      description: '4+ orders or $500+ lifetime value',
      criteria: { ordersCountMin: 4, lifetimeValueMin: 500 },
      priority: 'vip',
      trustLevel: 'highest',
      discountMultiplier: 0.5, // Use loyalty rewards, not discounts - protect margins
    },
    wholesaleLead: {
      name: 'Wholesale Lead',
      description: 'Cart value $500+ suggesting bulk/wholesale intent',
      criteria: { cartValueMin: 500 },
      priority: 'critical',
      trustLevel: 'medium',
      discountMultiplier: 0.6, // Tiered pricing handles wholesale, not cart discounts
    },
  },

  // =========================================================================
  // CART VALUE TIERS
  // Different recovery strategies based on what's at stake
  // =========================================================================
  cartValueTiers: {
    micro: {
      name: 'Micro Cart',
      range: { min: 0, max: 25 },
      strategy: 'minimal', // Not worth aggressive recovery
      maxEmails: 2,
      enableSMS: false,
      enableRetargeting: false,
    },
    small: {
      name: 'Small Cart',
      range: { min: 25, max: 75 },
      strategy: 'standard',
      maxEmails: 3,
      enableSMS: false,
      enableRetargeting: true,
    },
    medium: {
      name: 'Medium Cart',
      range: { min: 75, max: 200 },
      strategy: 'aggressive',
      maxEmails: 4,
      enableSMS: true,
      enableRetargeting: true,
    },
    large: {
      name: 'Large Cart',
      range: { min: 200, max: 500 },
      strategy: 'premium',
      maxEmails: 5,
      enableSMS: true,
      enableRetargeting: true,
    },
    whale: {
      name: 'Whale Cart',
      range: { min: 500, max: Infinity },
      strategy: 'white-glove', // Personal outreach, phone call, custom pricing
      maxEmails: 5,
      enableSMS: true,
      enableRetargeting: true,
    },
  },

  // =========================================================================
  // EMAIL SEQUENCE DEFINITIONS
  // Timing, content strategy, and discount escalation for each touchpoint
  // Based on Klaviyo/Omnisend best practices: 3-5 emails, escalating incentives
  // =========================================================================
  emailSequence: [
    {
      id: 'reminder',
      name: 'Gentle Reminder',
      delayMinutes: 60, // 1 hour - catches warm intent
      strategy: 'no_discount',
      contentFocus: 'product_reminder',
      subjectLineTemplates: [
        'You left something behind, {{first_name}}',
        'Your {{product_name}} is waiting',
        'Still thinking it over?',
        'Your Oil Slick Pad cart',
      ],
      elements: {
        showProductImages: true,
        showCartSummary: true,
        showSocialProof: false,
        showUrgency: false,
        showDiscount: false,
        showCrossSells: false,
        showTrustBadges: true,
        ctaText: 'Complete Your Order',
      },
      expectedMetrics: {
        openRate: 0.50,      // 50% - industry average for first touch
        clickRate: 0.08,     // 8%
        conversionRate: 0.04, // 4% placed order rate
      },
    },
    {
      id: 'social_proof',
      name: 'Trust Builder',
      delayMinutes: 1440, // 24 hours
      strategy: 'social_proof_only',
      contentFocus: 'trust_building',
      subjectLineTemplates: [
        'See why customers love {{product_name}}',
        '{{review_count}} 5-star reviews on your cart items',
        'Here\'s what others are saying about {{product_name}}',
        'Don\'t just take our word for it',
      ],
      elements: {
        showProductImages: true,
        showCartSummary: true,
        showSocialProof: true,
        showUrgency: false,
        showDiscount: false,
        showCrossSells: false,
        showTrustBadges: true,
        showReviews: true,
        showRatings: true,
        ctaText: 'Return to Your Cart',
      },
      expectedMetrics: {
        openRate: 0.42,
        clickRate: 0.065,
        conversionRate: 0.03,
      },
    },
    {
      id: 'incentive_light',
      name: 'Light Incentive',
      delayMinutes: 2880, // 48 hours
      strategy: 'light_discount',
      contentFocus: 'incentive_introduction',
      discountEscalation: {
        oilSlick: { percent: 5, type: 'percentage' },       // 5% - starter offer (max 15%)
        smokeshop: { percent: 10, type: 'percentage' },     // 10% - starter offer (max 35%)
      },
      subjectLineTemplates: [
        'A little something to sweeten the deal',
        '{{discount_percent}}% off your cart - just for you',
        'We saved your cart + a special offer',
        'Your items are going fast - here\'s {{discount_percent}}% off',
      ],
      elements: {
        showProductImages: true,
        showCartSummary: true,
        showSocialProof: true,
        showUrgency: true,
        showDiscount: true,
        showDiscountExpiry: true,
        showCrossSells: false,
        showTrustBadges: true,
        ctaText: 'Claim Your {{discount_percent}}% Off',
      },
      discountExpiry: {
        hours: 48,
        showCountdown: true,
      },
      expectedMetrics: {
        openRate: 0.38,
        clickRate: 0.07,
        conversionRate: 0.035,
      },
    },
    {
      id: 'incentive_strong',
      name: 'Strong Incentive',
      delayMinutes: 4320, // 72 hours (3 days)
      strategy: 'strong_discount',
      contentFocus: 'urgency_plus_incentive',
      discountEscalation: {
        oilSlick: { percent: 10, type: 'percentage' },      // 10% - strong (max 15%)
        smokeshop: { percent: 25, type: 'percentage' },     // 25% - strong (max 35%)
      },
      subjectLineTemplates: [
        'Last chance: {{discount_percent}}% off expires soon',
        'Your cart won\'t wait forever - {{discount_percent}}% off inside',
        'We really want you to have this, {{first_name}}',
        'Final offer: {{discount_percent}}% off your {{product_name}}',
      ],
      elements: {
        showProductImages: true,
        showCartSummary: true,
        showSocialProof: true,
        showUrgency: true,
        showDiscount: true,
        showDiscountExpiry: true,
        showCountdownTimer: true,
        showCrossSells: true,
        showTrustBadges: true,
        showAlternativeProducts: false,
        ctaText: 'Get {{discount_percent}}% Off Now',
      },
      discountExpiry: {
        hours: 24,
        showCountdown: true,
      },
      expectedMetrics: {
        openRate: 0.32,
        clickRate: 0.06,
        conversionRate: 0.025,
      },
    },
    {
      id: 'final_push',
      name: 'Final Push',
      delayMinutes: 10080, // 7 days
      strategy: 'max_discount_or_alternatives',
      contentFocus: 'last_chance_with_alternatives',
      discountEscalation: {
        oilSlick: { percent: 15, type: 'percentage' },      // 15% - absolute max per owner
        smokeshop: { percent: 35, type: 'percentage' },     // 35% - absolute max per owner
      },
      subjectLineTemplates: [
        'Your biggest discount yet - {{discount_percent}}% off',
        'We\'re clearing your cart in 24 hours',
        'One last thing, {{first_name}}...',
        'Before we say goodbye to your cart',
      ],
      elements: {
        showProductImages: true,
        showCartSummary: true,
        showSocialProof: true,
        showUrgency: true,
        showDiscount: true,
        showDiscountExpiry: true,
        showCountdownTimer: true,
        showCrossSells: true,
        showTrustBadges: true,
        showAlternativeProducts: true,
        showFeedbackRequest: true,
        ctaText: 'Last Chance - {{discount_percent}}% Off',
      },
      discountExpiry: {
        hours: 24,
        showCountdown: true,
      },
      expectedMetrics: {
        openRate: 0.28,
        clickRate: 0.05,
        conversionRate: 0.02,
      },
    },
  ],

  // =========================================================================
  // SMS SEQUENCE (complement to email - higher open rates)
  // Only enabled for medium+ carts with SMS opt-in
  // =========================================================================
  smsSequence: [
    {
      id: 'sms_reminder',
      name: 'SMS Reminder',
      delayMinutes: 30, // 30 minutes - SMS is more immediate
      template: 'Hey {{first_name}}! You left items in your cart at Oil Slick Pad. Complete your order: {{cart_url}}',
      maxChars: 160,
      strategy: 'no_discount',
    },
    {
      id: 'sms_incentive',
      name: 'SMS Incentive',
      delayMinutes: 2880, // 48 hours - aligns with email #3
      template: '{{first_name}}, get {{discount_percent}}% off your cart at Oil Slick Pad! Use code {{discount_code}} at checkout. Expires in 48hrs: {{cart_url}}',
      maxChars: 160,
      strategy: 'light_discount',
    },
    {
      id: 'sms_final',
      name: 'SMS Final Push',
      delayMinutes: 5760, // 4 days
      template: 'Last chance! {{discount_percent}}% off your Oil Slick Pad cart expires tonight. Don\'t miss out: {{cart_url}}',
      maxChars: 160,
      strategy: 'strong_discount',
    },
  ],

  // =========================================================================
  // EXIT INTENT POPUP CONFIGURATION
  // On-site recovery before the cart is even abandoned
  // =========================================================================
  exitIntent: {
    enabled: true,
    triggerConditions: {
      desktop: 'cursor_leaves_viewport',
      mobile: 'rapid_scroll_up',
      minTimeOnPage: 10, // seconds - don't annoy quick bouncers
      minCartValue: 20, // Only show for carts worth recovering
      cooldownDays: 7, // Don't show again for 7 days
    },
    variants: [
      {
        id: 'exit_email_capture',
        name: 'Save Cart + Email Capture',
        weight: 0.4, // 40% of traffic
        headline: 'Don\'t lose your cart!',
        body: 'Enter your email and we\'ll save your items. Plus get {{discount_percent}}% off if you complete your order today.',
        captureEmail: true,
        showDiscount: true,
        discountRules: {
          oilSlick: 5,
          smokeshop: 15,
        },
      },
      {
        id: 'exit_free_shipping',
        name: 'Free Shipping Threshold',
        weight: 0.3, // 30% of traffic
        headline: 'You\'re {{amount_away}} from free shipping!',
        body: 'Add {{amount_away}} more to your cart and shipping is on us.',
        captureEmail: false,
        showDiscount: false,
        showFreeShippingProgress: true,
        minCartForDisplay: 40, // Only show if close to threshold
      },
      {
        id: 'exit_urgency',
        name: 'Scarcity + Urgency',
        weight: 0.3, // 30% of traffic
        headline: 'Your items are in high demand!',
        body: '{{viewers_count}} other people are looking at items in your cart right now.',
        captureEmail: true,
        showDiscount: false,
        showViewerCount: true,
      },
    ],
  },

  // =========================================================================
  // DISCOUNT CODE GENERATION RULES
  // Prevents discount abuse and protects margins
  // =========================================================================
  discountRules: {
    codeFormat: 'OILSLICK-{{SEGMENT}}-{{RANDOM6}}', // e.g., OILSLICK-NEW-A3F8K2
    codeExpiry: {
      default: 72, // hours
      finalPush: 24, // hours - more urgency
    },
    usageLimit: 1, // Single use per code
    minimumOrderValue: 20, // Must meet store minimum
    combinableWithOtherDiscounts: false,
    excludeSaleItems: true,
    // Rate limiting to prevent serial cart abandoners gaming discounts
    customerRateLimits: {
      maxDiscountCodesPerMonth: 2,
      maxDiscountCodesPerQuarter: 4,
      cooldownAfterRedemption: 30, // days before eligible for another abandoned cart discount
    },
    // Never discount these product types (already thin margin or pricing restricted)
    excludedProductTags: [
      'no-discount',
      'map-pricing', // Minimum Advertised Price products
    ],
  },

  // =========================================================================
  // CROSS-SELL CONFIGURATION
  // Product recommendations within recovery emails
  // =========================================================================
  crossSell: {
    enabled: true,
    maxRecommendations: 3,
    // Only show cross-sells in email #4 and #5 (don't distract from primary recovery)
    enabledAfterEmailIndex: 3,
    strategies: [
      {
        name: 'complementary_by_family',
        description: 'Show accessories that go with the abandoned product family',
        weight: 0.5,
        rules: {
          // Product family → recommended accessory families
          'glass-bong': ['flower-bowl', 'ash-catcher', 'downstem', 'cleaning-supply'],
          'glass-rig': ['banger', 'carb-cap', 'dab-tool', 'torch'],
          'spoon-pipe': ['lighter', 'screen', 'cleaning-supply'],
          'nectar-collector': ['dab-tool', 'torch', 'container'],
          'bubbler': ['flower-bowl', 'cleaning-supply'],
          'rolling-paper': ['rolling-tray', 'grinder', 'lighter'],
          'grinder': ['rolling-paper', 'storage-accessory', 'rolling-tray'],
          'banger': ['carb-cap', 'dab-tool', 'torch'],
        },
      },
      {
        name: 'price_tier_alternatives',
        description: 'If cart was abandoned due to price, show lower-priced alternatives',
        weight: 0.3,
        priceReductionPercent: 30, // Show products 30% cheaper than abandoned item
      },
      {
        name: 'best_sellers_in_category',
        description: 'Show top sellers from the same collection',
        weight: 0.2,
      },
    ],
  },

  // =========================================================================
  // A/B TESTING FRAMEWORK
  // Continuously optimize every element of the recovery flow
  // =========================================================================
  abTesting: {
    enabled: true,
    minimumSampleSize: 100, // Per variant before declaring a winner
    confidenceLevel: 0.95, // 95% statistical significance
    tests: [
      {
        id: 'subject_line_style',
        name: 'Subject Line Style',
        element: 'subject_line',
        variants: [
          { id: 'personal', template: 'You left something behind, {{first_name}}' },
          { id: 'product', template: 'Your {{product_name}} is waiting' },
          { id: 'urgency', template: 'Your cart expires soon' },
          { id: 'curiosity', template: 'Still thinking about it?' },
        ],
        primaryMetric: 'open_rate',
        active: true,
      },
      {
        id: 'discount_timing',
        name: 'Discount Introduction Timing',
        element: 'discount_email_position',
        variants: [
          { id: 'email_2', description: 'Introduce discount in email #2 (24hr)' },
          { id: 'email_3', description: 'Introduce discount in email #3 (48hr) - default' },
          { id: 'email_4', description: 'Introduce discount in email #4 (72hr)' },
        ],
        primaryMetric: 'revenue_per_recipient',
        active: true,
      },
      {
        id: 'cta_style',
        name: 'Call to Action Style',
        element: 'cta_button',
        variants: [
          { id: 'direct', text: 'Complete Your Order' },
          { id: 'casual', text: 'Get Back to Shopping' },
          { id: 'urgency', text: 'Claim Your Items Now' },
          { id: 'discount', text: 'Get {{discount_percent}}% Off' },
        ],
        primaryMetric: 'click_rate',
        active: true,
      },
      {
        id: 'social_proof_type',
        name: 'Social Proof Approach',
        element: 'social_proof',
        variants: [
          { id: 'reviews', description: 'Show star ratings and written reviews' },
          { id: 'popularity', description: 'Show "X people bought this today" counter' },
          { id: 'ugc', description: 'Show customer photos with the product' },
          { id: 'combined', description: 'Reviews + popularity counter' },
        ],
        primaryMetric: 'conversion_rate',
        active: true,
      },
    ],
  },

  // =========================================================================
  // ANALYTICS & REPORTING
  // KPIs to track for continuous improvement
  // =========================================================================
  analytics: {
    kpis: [
      { id: 'recovery_rate', name: 'Cart Recovery Rate', target: 0.15, unit: 'percent', description: 'Percent of abandoned carts that convert' },
      { id: 'revenue_recovered', name: 'Revenue Recovered', target: null, unit: 'currency', description: 'Total $ recovered from abandoned carts' },
      { id: 'revenue_per_recipient', name: 'Revenue Per Recipient', target: 5.81, unit: 'currency', description: 'Avg revenue per abandoned cart email sent' },
      { id: 'email_open_rate', name: 'Email Open Rate', target: 0.50, unit: 'percent', description: 'Target: 50%+ (industry benchmark)' },
      { id: 'email_click_rate', name: 'Email Click Rate', target: 0.06, unit: 'percent', description: 'Target: 6%+ (industry benchmark)' },
      { id: 'placed_order_rate', name: 'Placed Order Rate', target: 0.033, unit: 'percent', description: 'Target: 3.3%+ (Klaviyo benchmark)' },
      { id: 'unsubscribe_rate', name: 'Unsubscribe Rate', target: 0.006, unit: 'percent', description: 'Keep below 0.6%' },
      { id: 'avg_discount_given', name: 'Avg Discount Given', target: null, unit: 'percent', description: 'Track margin impact' },
      { id: 'discount_abuse_rate', name: 'Discount Abuse Rate', target: 0.02, unit: 'percent', description: 'Serial abandoners gaming discounts' },
      { id: 'sms_opt_in_rate', name: 'SMS Opt-In Rate', target: 0.15, unit: 'percent', description: 'Percent of customers with SMS consent' },
      { id: 'time_to_recovery', name: 'Avg Time to Recovery', target: null, unit: 'hours', description: 'Hours from abandonment to purchase' },
      { id: 'aov_recovered', name: 'AOV of Recovered Carts', target: null, unit: 'currency', description: 'Average order value of recovered carts' },
    ],
    reportingInterval: 'weekly',
    alertThresholds: {
      recoveryRateDropPercent: 20, // Alert if recovery rate drops 20% week over week
      unsubscribeRateMax: 0.01,    // Alert if unsubs exceed 1%
      spamComplaintMax: 0.001,     // Alert if spam complaints exceed 0.1%
    },
  },

  // =========================================================================
  // BROWSE ABANDONMENT (separate from cart abandonment)
  // For visitors who viewed products but never added to cart
  // =========================================================================
  browseAbandonment: {
    enabled: true,
    triggerConditions: {
      minProductViews: 2,           // Must view at least 2 products
      minTimeOnSite: 60,            // At least 60 seconds on site
      noCartActivity: true,         // Did not add anything to cart
      notPurchasedRecently: 7,      // Days since last purchase
    },
    emailSequence: [
      {
        id: 'browse_reminder',
        delayMinutes: 120, // 2 hours
        subjectTemplates: [
          'See anything you like, {{first_name}}?',
          'You were checking out {{product_name}}',
          'Picked out something special?',
        ],
        showDiscount: false,
        showRecommendations: true,
        maxRecommendations: 4,
      },
      {
        id: 'browse_incentive',
        delayMinutes: 4320, // 3 days
        subjectTemplates: [
          'Still interested? Here\'s {{discount_percent}}% off',
          'A little nudge for {{first_name}}',
        ],
        showDiscount: true,
        discountRules: {
          oilSlick: 8,
          smokeshop: 20,
        },
        showRecommendations: true,
        maxRecommendations: 6,
      },
    ],
  },

  // =========================================================================
  // CHECKOUT ABANDONMENT (highest intent - different from cart abandonment)
  // For customers who started checkout but didn't complete payment
  // =========================================================================
  checkoutAbandonment: {
    enabled: true,
    triggerConditions: {
      startedCheckout: true,
      notCompletedPayment: true,
    },
    emailSequence: [
      {
        id: 'checkout_reminder',
        delayMinutes: 30, // 30 minutes - very high intent, recover fast
        subjectTemplates: [
          'Your order is almost complete, {{first_name}}',
          'One more step to finish your order',
          'We saved your checkout - pick up where you left off',
        ],
        showDiscount: false,
        showTrustSignals: true, // SSL badges, secure payment icons, return policy
        showPaymentOptions: true, // Remind of payment methods available
        elements: {
          showSecurityBadges: true,
          showReturnPolicy: true,
          showPaymentLogos: true,
          showGuestCheckoutReminder: true,
          showShippingEstimate: true,
        },
      },
      {
        id: 'checkout_incentive',
        delayMinutes: 1440, // 24 hours
        subjectTemplates: [
          'Complete your order + get {{discount_percent}}% off',
          'Your items are reserved - with a bonus inside',
        ],
        showDiscount: true,
        discountRules: {
          oilSlick: 8,
          smokeshop: 20,
        },
      },
    ],
  },
};

export default abandonedCartConfig;
