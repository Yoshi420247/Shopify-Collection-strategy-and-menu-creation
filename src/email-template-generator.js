// ============================================================================
// Email Template Generator — Abandoned Cart Recovery
// Oil Slick Pad (oilslickpad.com)
//
// Email copy written in the style of top Shopify ecommerce thought leaders:
// - Chase Dimond: Direct-response, conversational, high-converting subject lines
// - Ezra Firestone: Value-first, brand storytelling, community-driven
// - Drew Sanocki: Segment-aware, RFM-driven personalization
// - Ben Jabbawy: Behavioral triggers, dynamic content, mobile-first design
//
// 5-email escalating sequence:
//   1. Gentle Reminder (1hr)  — No discount, warm & personal
//   2. Trust Builder (24hr)   — Social proof, value props
//   3. Light Incentive (48hr) — 5-10% oil slick / 10% smokeshop
//   4. Strong Incentive (72hr)— 10% oil slick / 25% smokeshop
//   5. Final Push (7 days)    — 15% oil slick / 35% smokeshop
//
// Two product-specific tracks:
//   - Oil Slick / Extraction: Professional tone, lab-grade trust signals
//   - Smokeshop: Casual, lifestyle-driven, social proof heavy
// ============================================================================

export class EmailTemplateGenerator {
  constructor(config) {
    this.config = config;
  }

  generate({ checkout, cartAnalysis, customerSegment, sequencePosition, discountDecision, abVariants }) {
    const email = sequencePosition.email;
    const elements = email.elements;

    const subject = this.resolveSubjectLine(email, checkout, cartAnalysis, discountDecision, abVariants);

    const sections = [];

    sections.push(this.buildGreeting(checkout, customerSegment, sequencePosition, cartAnalysis));

    if (elements.showCartSummary) {
      sections.push(this.buildCartSummary(checkout, cartAnalysis));
    }

    if (elements.showSocialProof) {
      sections.push(this.buildSocialProof(cartAnalysis, customerSegment, abVariants));
    }

    if (elements.showDiscount && discountDecision.shouldDiscount) {
      sections.push(this.buildDiscountBlock(discountDecision, email, cartAnalysis));
    }

    if (elements.showUrgency) {
      sections.push(this.buildUrgencyBlock(cartAnalysis, sequencePosition));
    }

    if (elements.showTrustBadges) {
      sections.push(this.buildTrustBadges(customerSegment, cartAnalysis));
    }

    if (elements.showCrossSells) {
      sections.push(this.buildCrossSells(cartAnalysis));
    }

    if (elements.showAlternativeProducts) {
      sections.push(this.buildAlternatives(cartAnalysis));
    }

    if (elements.showFeedbackRequest) {
      sections.push(this.buildFeedbackRequest(checkout));
    }

    const ctaText = this.resolveCTA(elements.ctaText, discountDecision, abVariants);
    sections.push(this.buildCTABlock(checkout, ctaText, discountDecision));

    sections.push(this.buildFooter());

    return {
      subject,
      preheaderText: this.buildPreheader(email, cartAnalysis, discountDecision, customerSegment),
      htmlBody: this.assembleHTML(sections, subject),
      textBody: this.assembleText(sections),
      metadata: {
        sequenceId: email.id,
        sequenceName: email.name,
        customerSegment: customerSegment.name,
        cartCategory: cartAnalysis.dominantCategory,
        cartValue: cartAnalysis.totalValue,
        discountPercent: discountDecision.discountPercent || 0,
        discountCode: discountDecision.code,
        abVariants: abVariants,
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SUBJECT LINES
  // Chase Dimond style: Short, curiosity-driven, personal, emoji-free
  // ──────────────────────────────────────────────────────────────────────────

  resolveSubjectLine(email, checkout, cartAnalysis, discountDecision, abVariants) {
    let template;
    if (abVariants?.subject_line) {
      template = abVariants.subject_line.template;
    } else {
      template = email.subjectLineTemplates[0];
    }

    return this.interpolate(template, {
      first_name: checkout.customer?.first_name || 'there',
      product_name: this.getPrimaryProductName(cartAnalysis),
      discount_percent: discountDecision.discountPercent || '',
      store_name: 'Oil Slick Pad',
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GREETING — Segment-aware, stage-aware
  // Drew Sanocki style: Different voice for different customer segments
  // ──────────────────────────────────────────────────────────────────────────

  buildGreeting(checkout, customerSegment, sequencePosition, cartAnalysis) {
    const name = checkout.customer?.first_name || 'there';
    const isSmokeshop = cartAnalysis.dominantCategory === 'smokeshop';
    const isOilSlick = cartAnalysis.dominantCategory === 'oilSlick';
    const productName = this.getPrimaryProductName(cartAnalysis);

    // ── Smokeshop track ──
    const smokeshopGreetings = {
      'New Visitor': {
        0: `Hey ${name},\n\nYou were this close. Your ${productName} is sitting in your cart, picked out and ready to go.\n\nWe get it — maybe you got distracted, maybe you wanted to sleep on it. Either way, we held everything exactly where you left it.`,
        1: `${name},\n\nReal talk: the piece you picked out? Our customers can't stop raving about it.\n\nWe're not just saying that to get you to buy — we genuinely think you picked well. Here's why.`,
        2: `Hey ${name},\n\nWe don't do this often, but your cart caught our eye.\n\nWe want to make this easy for you — so we're dropping a little incentive your way.`,
        3: `${name},\n\nOkay, we'll be honest. We really don't want you to miss out on this.\n\nThis is the steepest discount we offer on smokeshop gear — and it's only available for the next 24 hours.`,
        4: `${name},\n\nThis is it — the last time we'll reach out about your cart.\n\nBefore we clear it, we wanted to leave you with our absolute best offer. After this, the discount disappears.`,
      },
      'Returning Customer': {
        0: `Welcome back, ${name}.\n\nGood to see a familiar face. You left a ${productName} in your cart — want to finish what you started?`,
        1: `Hey ${name},\n\nYou already know the quality we deliver. Here's what's new about the ${productName} you were looking at — and why customers like you keep coming back.`,
        2: `${name},\n\nBecause you've shopped with us before, we put together something special just for you. Think of it as a thank-you for being part of the Oil Slick Pad family.`,
        3: `${name},\n\nWe save our best deals for our best customers — and that includes you. Your exclusive offer is inside.`,
        4: `${name},\n\nLast call on your cart. We gave you our best returning-customer discount, and it expires tonight.`,
      },
      default: {
        0: `Hey ${name},\n\nLooks like you left some heat in your cart. Don't worry — we saved everything. Your ${productName} is still waiting.`,
        1: `${name},\n\nStill on the fence? Fair enough. Here's what other customers had to say after picking up the same gear.`,
        2: `Hey ${name},\n\nWe want to make this decision easier. Here's a discount just for you.`,
        3: `${name},\n\nTime's running out on your cart — and on this discount. This is our strongest offer yet.`,
        4: `${name},\n\nFinal notice. After today, your cart resets and this offer is gone for good.`,
      },
    };

    // ── Oil Slick / Extraction track ──
    const oilSlickGreetings = {
      'New Visitor': {
        0: `Hi ${name},\n\nYou left some extraction supplies in your cart at Oil Slick Pad. We've held your order — ready whenever you are.\n\nWhether you're stocking up for production or trying us for the first time, we're here to help.`,
        1: `${name},\n\nStill evaluating your options? Here's why extraction professionals across the country choose Oil Slick for their PTFE, FEP, and packaging needs.`,
        2: `Hi ${name},\n\nWe'd love to earn your business. Here's a small incentive to get your first order across the finish line.`,
        3: `${name},\n\nWe understand that choosing the right extraction supplies matters. That's why we're offering our best discount yet on your cart.`,
        4: `${name},\n\nThis is our final message about your saved cart. We're including our maximum discount — something we rarely offer on extraction supplies.`,
      },
      'Returning Customer': {
        0: `Hi ${name},\n\nGood to see you back. Looks like you were restocking some supplies — your cart is saved and ready to process.`,
        1: `${name},\n\nYou already trust Oil Slick quality. Here's what's been updated in our extraction supply line since your last order.`,
        2: `${name},\n\nWe appreciate your continued business. Here's an exclusive reorder discount as a thank-you.`,
        3: `${name},\n\nAs a valued customer, you get priority pricing. This is the best rate we can offer on extraction supplies.`,
        4: `${name},\n\nFinal reminder on your cart. Your preferred-customer pricing expires today.`,
      },
      default: {
        0: `Hi ${name},\n\nYou left some items in your cart at Oil Slick Pad. We've saved your order — it's ready when you are.`,
        1: `${name},\n\nWondering if Oil Slick is the right choice? Here's what sets our extraction supplies apart.`,
        2: `Hi ${name},\n\nWe're offering a limited-time incentive to help you complete your order.`,
        3: `${name},\n\nYour cart discount has been upgraded — but it won't last long.`,
        4: `${name},\n\nLast chance. Your cart and this discount both expire today.`,
      },
    };

    const greetingBank = isSmokeshop ? smokeshopGreetings :
                         isOilSlick ? oilSlickGreetings :
                         smokeshopGreetings; // default to smokeshop

    const segmentGreetings = greetingBank[customerSegment.name] || greetingBank.default;
    const text = segmentGreetings[sequencePosition.index] || segmentGreetings[0];

    return {
      type: 'greeting',
      text,
      html: `<p style="font-size:16px;line-height:1.7;color:#2d2d2d;">${text.replace(/\n\n/g, '</p><p style="font-size:16px;line-height:1.7;color:#2d2d2d;">').replace(/\n/g, '<br>')}</p>`,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CART SUMMARY
  // Ben Jabbawy style: Visual, product-image-forward, mobile-optimized
  // ──────────────────────────────────────────────────────────────────────────

  buildCartSummary(checkout, cartAnalysis) {
    const lineItems = checkout.line_items || [];
    const rows = lineItems.map(item => ({
      title: item.title,
      variantTitle: item.variant_title || '',
      quantity: item.quantity,
      price: parseFloat(item.price).toFixed(2),
      imageUrl: item.image?.src || '',
    }));

    const text = [
      '\n--- YOUR CART ---',
      ...rows.map(r => `${r.title}${r.variantTitle ? ` (${r.variantTitle})` : ''} x${r.quantity} - $${r.price}`),
      `\nCart Total: $${cartAnalysis.totalValue.toFixed(2)}`,
      '---\n',
    ].join('\n');

    const html = `
      <div style="margin:28px 0;">
        <table style="width:100%;border-collapse:collapse;" role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:12px 16px;background:#1a1a2e;border-radius:8px 8px 0 0;" colspan="3">
              <p style="margin:0;font-size:13px;font-weight:700;color:#e94560;text-transform:uppercase;letter-spacing:2px;">Your Cart</p>
            </td>
          </tr>
          ${rows.map(r => `
            <tr style="border-bottom:1px solid #f0f0f0;">
              <td style="padding:16px;">
                ${r.imageUrl ? `<img src="${r.imageUrl}" alt="${r.title}" width="72" height="72" style="width:72px;height:72px;object-fit:cover;border-radius:8px;display:block;">` : '<div style="width:72px;height:72px;background:#f0f0f0;border-radius:8px;"></div>'}
              </td>
              <td style="padding:16px;vertical-align:top;">
                <p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#1a1a2e;">${r.title}</p>
                ${r.variantTitle ? `<p style="margin:0;font-size:13px;color:#888;">${r.variantTitle}</p>` : ''}
                <p style="margin:4px 0 0;font-size:13px;color:#666;">Qty: ${r.quantity}</p>
              </td>
              <td style="padding:16px;text-align:right;vertical-align:top;">
                <p style="margin:0;font-size:16px;font-weight:700;color:#1a1a2e;">$${r.price}</p>
              </td>
            </tr>
          `).join('')}
          <tr style="background:#f8f9fa;">
            <td colspan="2" style="padding:16px;font-size:16px;font-weight:700;color:#1a1a2e;">Total</td>
            <td style="padding:16px;text-align:right;font-size:18px;font-weight:800;color:#1a1a2e;">$${cartAnalysis.totalValue.toFixed(2)}</td>
          </tr>
        </table>
      </div>
    `;

    return { type: 'cart_summary', text, html };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SOCIAL PROOF
  // Ezra Firestone style: Value-first, genuine trust signals, brand story
  // ──────────────────────────────────────────────────────────────────────────

  buildSocialProof(cartAnalysis, customerSegment, abVariants) {
    const category = cartAnalysis.dominantCategory;
    const isNewCustomer = ['New Visitor', 'New Customer'].includes(customerSegment.name);

    const proofData = {
      oilSlick: {
        headline: 'Why extraction pros trust Oil Slick',
        subheadline: 'We\'ve been in the extraction game since 2012. Here\'s what that means for you:',
        points: [
          { label: 'Lab-Grade Materials', detail: 'Every sheet of PTFE and FEP is tested for purity, thickness consistency, and solvent resistance. No surprises mid-run.' },
          { label: 'Trusted by Producers', detail: 'Licensed extraction facilities in 38 states use Oil Slick daily. When your output depends on your materials, you don\'t gamble.' },
          { label: 'Ships Same Day', detail: 'Orders placed before 2pm MT ship the same day. We know downtime costs money.' },
        ],
        badgeLine: 'Made in Colorado | Serving the extraction industry since 2012',
      },
      smokeshop: {
        headline: 'Why 10,000+ customers choose Oil Slick Pad',
        subheadline: isNewCustomer
          ? 'You found us for a reason. Here\'s why people stay:'
          : 'You already know the deal. Here\'s what keeps customers coming back:',
        points: [
          { label: 'Wholesale Pricing, Retail Quantities', detail: 'We cut out the middleman. You get headshop quality at prices that don\'t make you wince.' },
          { label: 'Discreet & Padded Shipping', detail: 'Plain box, bubble wrap, fast delivery. Your piece arrives the way it left our warehouse — perfect.' },
          { label: 'Hand-Picked Selection', detail: 'Every rig, banger, and accessory is chosen by people who actually use this stuff. No junk filler.' },
        ],
        badgeLine: 'Curated quality | Wholesale prices | Ships from Colorado',
      },
      unknown: {
        headline: 'Why customers love Oil Slick Pad',
        subheadline: 'A few things that set us apart:',
        points: [
          { label: 'Quality You Can Trust', detail: 'Every product is curated and quality-checked before it hits our shelves.' },
          { label: 'Fast, Discreet Shipping', detail: 'Most orders ship same day in plain, well-padded packaging.' },
          { label: 'Real Support', detail: 'Questions? We answer emails personally — no bots, no runaround.' },
        ],
        badgeLine: 'Premium quality | Fast shipping | Real humans on support',
      },
    };

    const data = proofData[category] || proofData.unknown;

    const text = [
      `\n${data.headline}`,
      data.subheadline,
      ...data.points.map(p => `  * ${p.label}: ${p.detail}`),
      data.badgeLine,
      '',
    ].join('\n');

    const html = `
      <div style="background:#f8f9fa;border-radius:12px;padding:28px;margin:28px 0;">
        <h3 style="color:#1a1a2e;margin:0 0 6px;font-size:20px;font-weight:700;">${data.headline}</h3>
        <p style="color:#666;font-size:14px;margin:0 0 20px;line-height:1.5;">${data.subheadline}</p>
        ${data.points.map(p => `
          <div style="margin-bottom:18px;padding-left:16px;border-left:3px solid #e94560;">
            <p style="font-size:15px;font-weight:700;color:#1a1a2e;margin:0 0 4px;">${p.label}</p>
            <p style="font-size:14px;color:#555;margin:0;line-height:1.5;">${p.detail}</p>
          </div>
        `).join('')}
        <p style="font-size:12px;color:#999;text-align:center;margin:16px 0 0;padding-top:14px;border-top:1px solid #e8e8e8;letter-spacing:0.5px;text-transform:uppercase;">${data.badgeLine}</p>
      </div>
    `;

    return { type: 'social_proof', text, html };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DISCOUNT BLOCK
  // Chase Dimond style: Bold, clear value prop, urgency without sleaze
  // ──────────────────────────────────────────────────────────────────────────

  buildDiscountBlock(discountDecision, emailConfig, cartAnalysis) {
    const percent = discountDecision.discountPercent;
    const code = discountDecision.code;
    const savings = discountDecision.savingsAmount;
    const expiryHours = discountDecision.expiryHours;
    const isFreeShipping = discountDecision.freeShipping;
    const isSmokeshop = cartAnalysis?.dominantCategory === 'smokeshop';

    let headline, body, belowCode;

    if (isFreeShipping) {
      headline = 'Free shipping. On us.';
      body = 'We picked up the shipping tab on your order. Use this code at checkout:';
      belowCode = `Offer expires in ${expiryHours} hours. One-time use.`;
    } else if (percent >= 25) {
      // Strong discount — make it feel exclusive
      headline = `${percent}% off. Seriously.`;
      body = isSmokeshop
        ? `That\'s $${savings} back in your pocket. We almost never discount smokeshop gear this hard — but we think you\'ll love what\'s in your cart.`
        : `That\'s $${savings} off your extraction supplies. We keep our margins tight, so discounts like this are rare. Use it before it\'s gone.`;
      belowCode = `Expires in ${expiryHours} hours. Single use. Non-stackable.`;
    } else {
      // Light/moderate discount
      headline = `Here's ${percent}% off your cart`;
      body = isSmokeshop
        ? `Use the code below to save $${savings} on your order. It\'s our way of saying "we want you to have this."`
        : `We're applying a ${percent}% discount to help you complete your order. That's $${savings} off.`;
      belowCode = `Valid for ${expiryHours} hours. One-time use.`;
    }

    const text = `\n--- ${headline} ---\n${body}\nCode: ${code}\n${belowCode}\n`;

    const html = `
      <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%);border-radius:16px;padding:36px 28px;margin:32px 0;text-align:center;">
        <p style="color:#e94560;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:3px;margin:0 0 8px;">Exclusive Offer</p>
        <h2 style="color:#ffffff;margin:0 0 14px;font-size:30px;font-weight:800;line-height:1.2;">${headline}</h2>
        <p style="color:#c8c8d0;font-size:15px;margin:0 0 24px;line-height:1.6;max-width:400px;display:inline-block;">${body}</p>
        <div style="background:#ffffff;display:inline-block;padding:14px 40px;border-radius:10px;border:2px dashed #e94560;margin:0 auto;">
          <span style="font-size:24px;font-weight:800;color:#1a1a2e;letter-spacing:4px;font-family:monospace;">${code}</span>
        </div>
        <p style="color:#8888a0;font-size:12px;margin:16px 0 0;line-height:1.4;">${belowCode}</p>
      </div>
    `;

    return { type: 'discount', text, html };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // URGENCY — Honest scarcity, not manufactured panic
  // ──────────────────────────────────────────────────────────────────────────

  buildUrgencyBlock(cartAnalysis, sequencePosition) {
    const productName = cartAnalysis.highestPriceItem?.title || 'your items';
    const isSmokeshop = cartAnalysis.dominantCategory === 'smokeshop';
    const isFinalEmails = sequencePosition.index >= 3;

    let message;
    if (isFinalEmails) {
      message = isSmokeshop
        ? `Heads up: we restock popular pieces, but sizes and colorways sell through fast. The ${productName} in your cart is currently in stock — we can't guarantee that tomorrow.`
        : `Production runs on extraction supplies are limited. The items in your cart are currently available, but once this batch ships, lead times can stretch.`;
    } else {
      message = isSmokeshop
        ? `Quick note: we don't hold carts indefinitely. Your ${productName} is reserved for now, but inventory moves fast.`
        : `Your cart is saved, but inventory levels on extraction supplies fluctuate with production schedules. We recommend completing your order while everything is in stock.`;
    }

    const text = `\n${message}\n`;

    const html = `
      <div style="background:#fffbeb;border:1px solid #f5e6b8;border-radius:10px;padding:18px 22px;margin:24px 0;">
        <p style="font-size:14px;color:#92722e;margin:0;line-height:1.6;font-weight:500;">${message}</p>
      </div>
    `;

    return { type: 'urgency', text, html };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TRUST BADGES — Clean, professional, segment-aware
  // ──────────────────────────────────────────────────────────────────────────

  buildTrustBadges(customerSegment, cartAnalysis) {
    const isNewCustomer = ['New Visitor', 'New Customer'].includes(customerSegment.name);
    const isOilSlick = cartAnalysis?.dominantCategory === 'oilSlick';

    const badges = isOilSlick ? [
      { label: 'Secure Checkout', detail: '256-bit SSL' },
      { label: 'Same-Day Shipping', detail: 'Orders before 2pm MT' },
      { label: 'Bulk Pricing', detail: 'Volume discounts available' },
    ] : [
      { label: 'Secure Checkout', detail: '256-bit SSL' },
      { label: 'Fast Shipping', detail: 'Ships same day' },
      { label: 'Discreet Packaging', detail: 'Plain box, no branding' },
    ];

    if (isNewCustomer) {
      badges.push({ label: '10,000+ Orders', detail: 'Since 2012' });
    }

    const text = badges.map(b => `[${b.label}: ${b.detail}]`).join('  ');

    const html = `
      <table style="width:100%;margin:24px 0;border-collapse:collapse;" role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          ${badges.map(b => `
            <td style="text-align:center;padding:12px 8px;border:1px solid #f0f0f0;border-radius:8px;">
              <p style="font-size:13px;font-weight:700;color:#1a1a2e;margin:0 0 2px;">${b.label}</p>
              <p style="font-size:11px;color:#888;margin:0;">${b.detail}</p>
            </td>
          `).join('')}
        </tr>
      </table>
    `;

    return { type: 'trust_badges', text, html };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CROSS-SELLS — Category-aware product discovery
  // ──────────────────────────────────────────────────────────────────────────

  buildCrossSells(cartAnalysis) {
    const category = cartAnalysis.dominantCategory;

    const crossSellData = {
      oilSlick: {
        headline: 'Complete Your Extraction Setup',
        description: 'Top sellers that pair with your supplies:',
        collections: [
          { name: 'PTFE Sheets & Rolls', url: 'https://oilslickpad.com/collections/ptfe-sheets', tag: 'Best Seller' },
          { name: 'FEP Sheets', url: 'https://oilslickpad.com/collections/fep-sheets', tag: 'Lab Grade' },
          { name: 'Concentrate Containers', url: 'https://oilslickpad.com/collections/concentrate-containers', tag: 'Packaging' },
        ],
      },
      smokeshop: {
        headline: 'Upgrade Your Setup',
        description: 'Accessories that go with what you picked:',
        collections: [
          { name: 'Quartz Bangers', url: 'https://oilslickpad.com/collections/quartz-bangers', tag: 'Essential' },
          { name: 'Carb Caps', url: 'https://oilslickpad.com/collections/carb-caps', tag: 'Popular' },
          { name: 'Dab Tools', url: 'https://oilslickpad.com/collections/dab-tools', tag: 'Must Have' },
        ],
      },
      unknown: {
        headline: 'Customers Also Browsed',
        description: 'Popular picks from our catalog:',
        collections: [
          { name: 'Best Sellers', url: 'https://oilslickpad.com/collections/best-sellers', tag: 'Trending' },
          { name: 'New Arrivals', url: 'https://oilslickpad.com/collections/new-arrivals', tag: 'Just In' },
          { name: 'Clearance', url: 'https://oilslickpad.com/collections/clearance', tag: 'Deals' },
        ],
      },
    };

    const data = crossSellData[category] || crossSellData.unknown;

    const text = [
      `\n--- ${data.headline.toUpperCase()} ---`,
      data.description,
      ...data.collections.map(c => `  [${c.tag}] ${c.name}: ${c.url}`),
      '---\n',
    ].join('\n');

    const html = `
      <div style="margin:32px 0;">
        <h3 style="color:#1a1a2e;font-size:18px;margin:0 0 6px;font-weight:700;">${data.headline}</h3>
        <p style="color:#666;font-size:14px;margin:0 0 16px;">${data.description}</p>
        <table style="width:100%;border-collapse:collapse;" role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            ${data.collections.map(c => `
              <td style="width:33%;padding:8px;text-align:center;vertical-align:top;">
                <a href="${c.url}" style="display:block;padding:20px 12px;background:#f8f9fa;border-radius:10px;text-decoration:none;border:1px solid #eee;">
                  <p style="font-size:10px;font-weight:700;color:#e94560;text-transform:uppercase;letter-spacing:1px;margin:0 0 6px;">${c.tag}</p>
                  <p style="font-size:14px;font-weight:600;color:#1a1a2e;margin:0;">${c.name}</p>
                </a>
              </td>
            `).join('')}
          </tr>
        </table>
      </div>
    `;

    return { type: 'cross_sells', text, html };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ALTERNATIVES — For price-sensitive abandoners
  // ──────────────────────────────────────────────────────────────────────────

  buildAlternatives(cartAnalysis) {
    const isSmokeshop = cartAnalysis.dominantCategory === 'smokeshop';

    const headline = 'Not quite what you were looking for?';
    const body = isSmokeshop
      ? 'We carry hundreds of rigs, pipes, and accessories at every price point. Browse our full collection — there might be something that fits better.'
      : 'We stock a wide range of extraction supplies in different sizes and quantities. See our full catalog to find the right fit for your operation.';
    const link = isSmokeshop
      ? 'https://oilslickpad.com/collections/all-accessories'
      : 'https://oilslickpad.com/collections/extraction-packaging';
    const linkText = 'Browse Alternatives';

    const text = `\n${headline}\n${body}\n${link}\n`;

    const html = `
      <div style="background:#f0f4ff;border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
        <h3 style="color:#1a1a2e;font-size:17px;margin:0 0 8px;font-weight:700;">${headline}</h3>
        <p style="color:#555;font-size:14px;margin:0 0 16px;line-height:1.6;max-width:440px;display:inline-block;">${body}</p>
        <div>
          <a href="${link}" style="display:inline-block;padding:12px 28px;background:#fff;border:2px solid #1a1a2e;border-radius:8px;color:#1a1a2e;font-size:14px;font-weight:600;text-decoration:none;">${linkText}</a>
        </div>
      </div>
    `;

    return { type: 'alternatives', text, html };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FEEDBACK REQUEST
  // ──────────────────────────────────────────────────────────────────────────

  buildFeedbackRequest(checkout) {
    const contactUrl = 'https://oilslickpad.com/pages/contact';

    const text = `\nBefore you go — what stopped you from checking out? Hit reply and tell us. We read every response and genuinely want to improve.\n\nOr reach out: ${contactUrl}\n`;

    const html = `
      <div style="background:#f8f8f8;border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
        <h3 style="color:#1a1a2e;font-size:17px;margin:0 0 10px;font-weight:700;">One quick question</h3>
        <p style="color:#555;font-size:14px;margin:0 0 16px;line-height:1.6;">What stopped you from checking out? Hit reply and tell us — we read every single response.</p>
        <p style="color:#888;font-size:13px;margin:0;">Shipping costs? Product questions? Wrong size? Whatever it is, we want to fix it.</p>
      </div>
    `;

    return { type: 'feedback', text, html };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CTA BUTTON
  // Big, bold, impossible to miss. One clear action.
  // ──────────────────────────────────────────────────────────────────────────

  buildCTABlock(checkout, ctaText, discountDecision) {
    let cartUrl = checkout.abandoned_checkout_url || 'https://oilslickpad.com/cart';
    if (discountDecision.code) {
      const separator = cartUrl.includes('?') ? '&' : '?';
      cartUrl += `${separator}discount=${encodeURIComponent(discountDecision.code)}`;
    }

    const text = `\n>> ${ctaText}: ${cartUrl}\n`;

    const html = `
      <div style="text-align:center;margin:36px 0 24px;">
        <a href="${cartUrl}" style="display:inline-block;background:#e94560;color:#ffffff;padding:18px 52px;border-radius:10px;font-size:18px;font-weight:700;text-decoration:none;letter-spacing:0.5px;mso-padding-alt:18px 52px;">${ctaText}</a>
        <p style="font-size:12px;color:#aaa;margin-top:14px;">Or paste this link in your browser:<br><a href="${cartUrl}" style="color:#999;word-break:break-all;font-size:11px;">${cartUrl}</a></p>
      </div>
    `;

    return { type: 'cta', text, html, url: cartUrl };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // FOOTER
  // ──────────────────────────────────────────────────────────────────────────

  buildFooter() {
    const text = [
      '\n---',
      'Oil Slick Pad | oilslickpad.com',
      'Premium extraction supplies & curated smokeshop',
      'Bellingham, WA | Since 2012',
      '',
      'You\'re receiving this because you left items in your cart at oilslickpad.com.',
      'Reply to this email for any questions. We answer personally.',
    ].join('\n');

    const html = `
      <div style="border-top:1px solid #eee;padding:28px 0 0;margin-top:36px;text-align:center;">
        <p style="font-size:16px;font-weight:700;color:#1a1a2e;margin:0 0 2px;">Oil Slick Pad</p>
        <p style="font-size:12px;color:#888;margin:0 0 16px;">Premium extraction supplies & curated smokeshop<br>Bellingham, WA | Since 2012</p>
        <p style="font-size:11px;color:#aaa;margin:0;line-height:1.6;">
          You're receiving this because you left items in your cart at oilslickpad.com.<br>
          Reply to this email for any questions — we answer personally.<br>
          <a href="https://oilslickpad.com/policies/privacy-policy" style="color:#aaa;">Privacy Policy</a> |
          <a href="https://oilslickpad.com" style="color:#aaa;">Visit Store</a>
        </p>
      </div>
    `;

    return { type: 'footer', text, html };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ASSEMBLY
  // ──────────────────────────────────────────────────────────────────────────

  buildPreheader(email, cartAnalysis, discountDecision, customerSegment) {
    const name = customerSegment?.name || '';
    const isSmokeshop = cartAnalysis.dominantCategory === 'smokeshop';

    if (discountDecision.shouldDiscount) {
      const pct = discountDecision.discountPercent;
      if (pct >= 25) {
        return isSmokeshop
          ? `${pct}% off your gear — our biggest discount. Limited time.`
          : `${pct}% off extraction supplies — rarely discounted this steep.`;
      }
      return `Save ${pct}% on your $${cartAnalysis.totalValue.toFixed(0)} cart. Code inside.`;
    }

    if (email.id === 'social_proof') {
      return isSmokeshop
        ? 'Here\'s why 10,000+ customers chose Oil Slick Pad.'
        : 'Trusted by extraction labs in 38 states.';
    }

    return `Your $${cartAnalysis.totalValue.toFixed(0)} cart is still waiting — ready when you are.`;
  }

  assembleHTML(sections, subject) {
    const body = sections.map(s => s.html).join('\n');

    return `<!DOCTYPE html>
<html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
  <!--[if mso]><style>table{border-collapse:collapse;}td{font-family:Arial,sans-serif;}</style><![endif]-->
  <style>
    @media only screen and (max-width:620px) {
      .email-container { width:100% !important; padding:0 16px !important; }
      .email-content { padding:24px 16px !important; }
      td { display:block !important; width:100% !important; text-align:center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${subject}
  </div>
  <table role="presentation" style="width:100%;border-collapse:collapse;" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding:20px 0;" align="center">
        <div class="email-container" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%);padding:28px 24px;text-align:center;">
            <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:300;letter-spacing:1px;">OIL SLICK PAD</h1>
          </div>
          <!-- Content -->
          <div class="email-content" style="padding:36px 32px;">
            ${body}
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  assembleText(sections) {
    return sections.map(s => s.text).join('\n');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────────────────────

  resolveCTA(template, discountDecision, abVariants) {
    if (abVariants?.cta_button) {
      template = abVariants.cta_button.text;
    }
    return this.interpolate(template, {
      discount_percent: discountDecision.discountPercent || '',
    });
  }

  getPrimaryProductName(cartAnalysis) {
    if (cartAnalysis.highestPriceItem) {
      return cartAnalysis.highestPriceItem.title || 'your items';
    }
    return 'your items';
  }

  interpolate(template, vars) {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
    }
    return result;
  }
}

export default EmailTemplateGenerator;
