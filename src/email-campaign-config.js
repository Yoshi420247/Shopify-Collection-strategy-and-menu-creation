// ============================================================================
// Email Campaign Configuration: Smokeshop Collection Expansion Launch
//
// 5-tier segmented campaign with unique 30% off one-time discount codes.
// Staggered rollout: VIPs first, then warm buyers, then broader audience.
//
// Strategy based on:
//   - Drew Sanocki's Three Multipliers (customer count × AOV × frequency)
//   - Ezra Firestone's 4-email launch sequence (announce → proof → scarcity → last chance)
//   - Chase Dimond's segmented value-first approach
//
// Each tier gets a tailored email sequence with segment-specific messaging.
// ============================================================================

export const campaignConfig = {
  // ── Campaign Identity ──────────────────────────────────────────────────
  campaign: {
    id: 'smokeshop-expansion-2026',
    name: 'Smokeshop Collection Expansion Launch',
    description: 'Drive sales into newly expanded Smoke & Vape collection with 30% off unique codes',
    launchDate: null, // Set at runtime
  },

  // ── Discount Configuration ─────────────────────────────────────────────
  discount: {
    percent: 30,
    codePrefix: 'SMOKE30',
    expiryDays: 14,
    usageLimit: 1,           // Each code works once
    oncePerCustomer: true,   // One redemption per customer
    // Target the smokeshop collection — products from vendor "What You Need" + "Cloud YHS"
    targetCollectionHandle: 'smoke-and-vape',
    // Minimum purchase to use the code
    minimumSubtotal: 0,
    // Shopify Price Rule value type
    valueType: 'percentage',
    value: -30,
  },

  // ── Staggered Rollout Schedule ─────────────────────────────────────────
  // Each tier launches on a different day. Within each tier, emails
  // are spaced 3 days apart per the sequence timing.
  rollout: {
    tier1_day: 0,   // VIPs + smokeshop-repeat: launch immediately
    tier2_day: 1,   // Warm smokeshop buyers: 1 day after
    tier3_day: 3,   // One-timers + cooling-off: 3 days after
    tier4_day: 5,   // At-risk + lost: 5 days after
    tier5_day: 7,   // No-purchase activation: 7 days after
  },

  // ── Customer Tier Definitions ──────────────────────────────────────────
  // Tiers are evaluated top-to-bottom. A customer matches the FIRST tier
  // whose conditions are met (higher tiers suppress lower ones).
  tiers: [
    {
      id: 'tier1',
      name: 'Inner Circle',
      tag: 'campaign:smokeshop-launch-tier1',
      // VIP, champion, or smokeshop-repeat customers
      includeTags: ['segment:vip', 'segment:champion', 'segment:smokeshop-repeat'],
      excludeTags: [],
      matchLogic: 'any',  // Customer has ANY of these tags
      emailCount: 4,
      estimatedSize: 1220,
      segmentCode: 'VIP',
      description: 'VIPs, champions, and repeat smokeshop buyers — your most valuable customers',
    },
    {
      id: 'tier2',
      name: 'Warm Buyers',
      tag: 'campaign:smokeshop-launch-tier2',
      includeTags: ['segment:smokeshop-buyer'],
      // Active customers who already bought smokeshop products but aren't tier 1
      requireActiveTags: ['segment:active-30d', 'segment:active-90d', 'segment:smokeshop-high-value'],
      excludeTags: [],
      matchLogic: 'include_any_and_require_any',
      emailCount: 4,
      estimatedSize: 6280,
      segmentCode: 'WB',
      description: 'Active smokeshop buyers and high-value smokeshop customers',
    },
    {
      id: 'tier3',
      name: 'One-Timers',
      tag: 'campaign:smokeshop-launch-tier3',
      includeTags: ['segment:one-time-buyer', 'segment:cooling-off'],
      excludeTags: [],
      matchLogic: 'any',
      emailCount: 3,
      estimatedSize: 13500,
      segmentCode: 'OT',
      description: 'One-time buyers and cooling-off customers who need a reason to come back',
    },
    {
      id: 'tier4',
      name: 'Win-Back',
      tag: 'campaign:smokeshop-launch-tier4',
      includeTags: ['segment:at-risk', 'segment:lost'],
      excludeTags: [],
      matchLogic: 'any',
      emailCount: 2,
      estimatedSize: 17000,
      segmentCode: 'WK',
      description: 'At-risk and lost customers — strong incentive to re-engage',
    },
    {
      id: 'tier5',
      name: 'Activation',
      tag: 'campaign:smokeshop-launch-tier5',
      includeTags: ['segment:no-purchase'],
      excludeTags: [],
      matchLogic: 'any',
      emailCount: 2,
      estimatedSize: 12000,
      segmentCode: 'NP',
      description: 'Never-purchased accounts — first-purchase activation with strong incentive',
    },
  ],

  // ── Email Sequences ────────────────────────────────────────────────────
  // Each tier has a tailored sequence. The `dayOffset` is relative to that
  // tier's rollout day.
  emailSequences: {
    tier1: [
      {
        id: 'tier1-e1',
        name: 'VIP Exclusive Early Access',
        dayOffset: 0,
        subject: "{{first_name}}, the door's open early",
        preheader: "500+ new pieces. Your code. 48 hours before anyone else knows.",
        strategy: 'exclusivity',
        showDiscount: true,
        showProducts: true,
        showSocialProof: false,
        showUrgency: false,
        ctaText: 'Shop It First',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
      {
        id: 'tier1-e2',
        name: 'VIP Collection Deep Dive',
        dayOffset: 3,
        subject: "7 pieces almost gone (your 30% still works)",
        preheader: "Warehouse flagged these as critical stock. We held your code.",
        strategy: 'social_proof',
        showDiscount: true,
        showProducts: true,
        showSocialProof: true,
        showUrgency: false,
        ctaText: 'Grab Them at 30% Off',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
      {
        id: 'tier1-e3',
        name: 'VIP Reminder + Category Spotlight',
        dayOffset: 6,
        subject: "The hidden drops nobody's talking about",
        preheader: "Heady glass. Brand collabs. Travel rigs. 48 hours left on your code.",
        strategy: 'scarcity',
        showDiscount: true,
        showProducts: true,
        showSocialProof: false,
        showUrgency: true,
        ctaText: 'See the Hidden Picks',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
      {
        id: 'tier1-e4',
        name: 'VIP Last Chance',
        dayOffset: 9,
        subject: "Your 30% dies at midnight",
        preheader: "This code gets permanently deactivated. No extensions. No re-sends.",
        strategy: 'last_chance',
        showDiscount: true,
        showProducts: false,
        showSocialProof: false,
        showUrgency: true,
        ctaText: 'Use It Before Midnight',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
    ],

    tier2: [
      {
        id: 'tier2-e1',
        name: 'Smokeshop Expansion Announcement',
        dayOffset: 0,
        subject: "{{first_name}}, this wasn't here last week",
        preheader: "500+ pieces from $9. Your personal 30% code is at the bottom.",
        strategy: 'announcement',
        showDiscount: true,
        showProducts: true,
        showSocialProof: false,
        showUrgency: false,
        ctaText: 'See What Dropped',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
      {
        id: 'tier2-e2',
        name: 'Social Proof + Bestsellers',
        dayOffset: 3,
        subject: "12 pieces won't make it to next week",
        preheader: "One-run stock. Once they sell, the listing disappears. 30% still active.",
        strategy: 'social_proof',
        showDiscount: true,
        showProducts: true,
        showSocialProof: true,
        showUrgency: false,
        ctaText: 'Grab Before They Go',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
      {
        id: 'tier2-e3',
        name: 'Category Spotlight + Urgency',
        dayOffset: 6,
        subject: "48 hours left (our top picks inside)",
        preheader: "Sorted by category so you find the good stuff fast. Code expires Friday.",
        strategy: 'scarcity',
        showDiscount: true,
        showProducts: true,
        showSocialProof: false,
        showUrgency: true,
        ctaText: 'Browse My Picks',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
      {
        id: 'tier2-e4',
        name: 'Last Chance',
        dayOffset: 9,
        subject: "Final notice: 30% off ends tonight",
        preheader: "After midnight this code is dead. Not being dramatic, just honest.",
        strategy: 'last_chance',
        showDiscount: true,
        showProducts: false,
        showSocialProof: false,
        showUrgency: true,
        ctaText: 'Use My Code Now',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
    ],

    tier3: [
      {
        id: 'tier3-e1',
        name: 'Re-engagement + Expansion',
        dayOffset: 0,
        subject: "{{first_name}}, you left. We built this.",
        preheader: "500+ new pieces and a 30% code with your name on it. Literally.",
        strategy: 'reengagement',
        showDiscount: true,
        showProducts: true,
        showSocialProof: true,
        showUrgency: false,
        ctaText: 'See What You Missed',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
      {
        id: 'tier3-e2',
        name: 'Urgency + Bestsellers',
        dayOffset: 4,
        subject: "Wait, did you even open the last one?",
        preheader: "Top-rated glass at wholesale prices. 3 days left on your 30% code.",
        strategy: 'scarcity',
        showDiscount: true,
        showProducts: true,
        showSocialProof: false,
        showUrgency: true,
        ctaText: 'Show Me the Glass',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
      {
        id: 'tier3-e3',
        name: 'Final Reminder',
        dayOffset: 8,
        subject: "Last email. Last chance. 30% off.",
        preheader: "This code gets killed tomorrow. We can't bring it back.",
        strategy: 'last_chance',
        showDiscount: true,
        showProducts: false,
        showSocialProof: false,
        showUrgency: true,
        ctaText: 'Claim It Now',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
    ],

    tier4: [
      {
        id: 'tier4-e1',
        name: 'Win-Back: A Lot Has Changed',
        dayOffset: 0,
        subject: "{{first_name}}, we rebuilt the whole store",
        preheader: "500+ pieces you've never seen. Secret 30% code inside -- just for you.",
        strategy: 'winback',
        showDiscount: true,
        showProducts: true,
        showSocialProof: true,
        showUrgency: false,
        ctaText: 'Take a Look Inside',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
      {
        id: 'tier4-e2',
        name: 'Win-Back: Last Chance',
        dayOffset: 5,
        subject: "We can't hold this 30% much longer",
        preheader: "24 hours. Then this code gets permanently deleted from our system.",
        strategy: 'last_chance',
        showDiscount: true,
        showProducts: false,
        showSocialProof: false,
        showUrgency: true,
        ctaText: 'Save 30% Before It Goes',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
    ],

    tier5: [
      {
        id: 'tier5-e1',
        name: 'First Purchase: Meet Our Smokeshop',
        dayOffset: 0,
        subject: "Your first order is 30% off (no catch)",
        preheader: "500+ pieces from $9. Wholesale prices before the discount even kicks in.",
        strategy: 'activation',
        showDiscount: true,
        showProducts: true,
        showSocialProof: true,
        showUrgency: false,
        ctaText: 'Get My 30% Off',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
      {
        id: 'tier5-e2',
        name: 'First Purchase: Last Chance',
        dayOffset: 5,
        subject: "This 30% code expires tomorrow",
        preheader: "Bongs from $17. Rigs from $13. After tomorrow, full price only.",
        strategy: 'last_chance',
        showDiscount: true,
        showProducts: false,
        showSocialProof: false,
        showUrgency: true,
        ctaText: 'Lock In My Discount',
        ctaUrl: 'https://oilslickpad.com/collections/smoke-and-vape',
      },
    ],
  },

  // ── Product Showcases ──────────────────────────────────────────────────
  // Featured categories for the product spotlight sections in emails.
  productShowcase: {
    categories: [
      {
        title: 'Bongs & Water Pipes',
        url: 'https://oilslickpad.com/collections/bongs-water-pipes',
        description: 'Premium glass bongs from top brands — beakers, straight tubes, and more.',
        priceRange: '$24 - $299',
      },
      {
        title: 'Dab Rigs',
        url: 'https://oilslickpad.com/collections/dab-rigs',
        description: 'Glass and silicone rigs for concentrates — recyclers, mini rigs, e-rigs.',
        priceRange: '$19 - $249',
      },
      {
        title: 'Hand Pipes',
        url: 'https://oilslickpad.com/collections/hand-pipes',
        description: 'Spoon pipes, sherlocks, and steamrollers in glass and silicone.',
        priceRange: '$9 - $89',
      },
      {
        title: 'Accessories',
        url: 'https://oilslickpad.com/collections/accessories',
        description: 'Quartz bangers, carb caps, grinders, torches, rolling papers — everything you need.',
        priceRange: '$3 - $129',
      },
      {
        title: 'Nectar Collectors',
        url: 'https://oilslickpad.com/collections/nectar-collectors',
        description: 'Glass and silicone nectar collectors for on-the-go dabbing.',
        priceRange: '$12 - $79',
      },
      {
        title: 'Brand Names',
        url: 'https://oilslickpad.com/collections/smoke-and-vape',
        description: 'RAW, Cookies, Puffco, Lookah, G Pen, Zig Zag, Monark & more.',
        priceRange: '$5 - $299',
      },
    ],
  },

  // ── Suppression & Safety ───────────────────────────────────────────────
  suppression: {
    // Only email customers who have opted in
    requireOptedIn: true,
    optedInTag: 'segment:opted-in',
    // Campaign tag prefix — prevents double-sends across runs
    campaignTagPrefix: 'campaign:smokeshop-launch-',
    // If a customer already has a campaign tag, skip them
    skipAlreadyTagged: true,
  },

  // ── Email Styling ──────────────────────────────────────────────────────
  styling: {
    headerBg: 'linear-gradient(135deg, #1a1a2e, #16213e)',
    accentColor: '#e94560',
    bodyBg: '#f5f5f5',
    cardBg: '#ffffff',
    textColor: '#333333',
    mutedColor: '#888888',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    storeName: 'Oil Slick Pad',
    storeUrl: 'https://oilslickpad.com',
    logoText: 'Oil Slick Pad',
    privacyUrl: 'https://oilslickpad.com/policies/privacy-policy',
    contactUrl: 'https://oilslickpad.com/pages/contact',
  },
};

export default campaignConfig;
