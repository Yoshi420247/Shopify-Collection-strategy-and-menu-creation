// ============================================================================
// Email Template Generator
// Creates personalized abandoned cart recovery emails with dynamic content,
// social proof, urgency elements, and category-specific messaging.
//
// Generates both HTML and plain text versions suitable for
// Klaviyo, Omnisend, Shopify Flow, or direct SMTP.
// ============================================================================

export class EmailTemplateGenerator {
  constructor(config) {
    this.config = config;
  }

  /**
   * Generates the full email payload for a recovery touchpoint.
   */
  generate({ checkout, cartAnalysis, customerSegment, sequencePosition, discountDecision, abVariants }) {
    const email = sequencePosition.email;
    const elements = email.elements;

    // Resolve subject line (with A/B test variant if active)
    const subject = this.resolveSubjectLine(email, checkout, cartAnalysis, discountDecision, abVariants);

    // Build sections
    const sections = [];

    // Greeting
    sections.push(this.buildGreeting(checkout, customerSegment, sequencePosition));

    // Cart summary with product images
    if (elements.showCartSummary) {
      sections.push(this.buildCartSummary(checkout, cartAnalysis));
    }

    // Social proof block
    if (elements.showSocialProof) {
      sections.push(this.buildSocialProof(cartAnalysis, abVariants));
    }

    // Discount offer
    if (elements.showDiscount && discountDecision.shouldDiscount) {
      sections.push(this.buildDiscountBlock(discountDecision, email));
    }

    // Urgency elements
    if (elements.showUrgency) {
      sections.push(this.buildUrgencyBlock(cartAnalysis, email));
    }

    // Trust badges
    if (elements.showTrustBadges) {
      sections.push(this.buildTrustBadges(customerSegment));
    }

    // Cross-sell recommendations
    if (elements.showCrossSells) {
      sections.push(this.buildCrossSells(cartAnalysis));
    }

    // Alternative products (final emails only)
    if (elements.showAlternativeProducts) {
      sections.push(this.buildAlternatives(cartAnalysis));
    }

    // Feedback request (final email)
    if (elements.showFeedbackRequest) {
      sections.push(this.buildFeedbackRequest(checkout));
    }

    // CTA button
    const ctaText = this.resolveCTA(elements.ctaText, discountDecision, abVariants);
    sections.push(this.buildCTABlock(checkout, ctaText, discountDecision));

    // Footer
    sections.push(this.buildFooter());

    return {
      subject,
      preheaderText: this.buildPreheader(email, cartAnalysis, discountDecision),
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
  // SUBJECT LINE
  // ──────────────────────────────────────────────────────────────────────────

  resolveSubjectLine(email, checkout, cartAnalysis, discountDecision, abVariants) {
    // Check if A/B test provides a subject variant
    let template;
    if (abVariants?.subject_line) {
      template = abVariants.subject_line.template;
    } else {
      // Select based on strategy: use first template as default
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
  // EMAIL SECTIONS
  // ──────────────────────────────────────────────────────────────────────────

  buildGreeting(checkout, customerSegment, sequencePosition) {
    const name = checkout.customer?.first_name || 'there';

    const greetings = {
      'New Visitor': {
        0: `Hey ${name},\n\nLooks like you were checking out some items at Oil Slick Pad. We saved your cart in case you want to pick up where you left off.`,
        1: `Hi ${name},\n\nWe noticed you left a few items behind. No pressure - but we thought you might want to know what others are saying about them.`,
        2: `Hi ${name},\n\nStill thinking about your cart? We've got a little something to help you decide.`,
        3: `Hey ${name},\n\nWe get it - sometimes you need time to decide. Here's our best offer to make it easier.`,
        4: `Hi ${name},\n\nThis is our last note about your cart. Before we let it go, we wanted to give you one final offer.`,
      },
      'Returning Customer': {
        0: `Welcome back, ${name}!\n\nGreat to see you shopping again. We noticed your cart is still waiting for you.`,
        1: `Hey ${name},\n\nYour cart items are getting popular. Here's why our customers love them.`,
        2: `Hi ${name},\n\nAs a valued customer, we wanted to offer you something special on your cart.`,
        3: `${name},\n\nYour loyalty means a lot to us. Here's an exclusive offer just for you.`,
        4: `Hi ${name},\n\nLast chance to grab your cart items with our best discount.`,
      },
      default: {
        0: `Hi ${name},\n\nYou left some items in your cart at Oil Slick Pad. We saved them for you.`,
        1: `Hey ${name},\n\nStill interested in your cart items? Here's what other customers think.`,
        2: `Hi ${name},\n\nWe've got a special offer for you on your saved cart.`,
        3: `${name},\n\nDon't miss out - your exclusive discount is about to expire.`,
        4: `Hi ${name},\n\nFinal notice: your cart and our best offer expire soon.`,
      },
    };

    const segmentGreetings = greetings[customerSegment.name] || greetings.default;
    const text = segmentGreetings[sequencePosition.index] || segmentGreetings[0];

    return { type: 'greeting', text, html: `<p style="font-size:16px;line-height:1.6;color:#333;">${text.replace(/\n/g, '<br>')}</p>` };
  }

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
      <table style="width:100%;border-collapse:collapse;margin:20px 0;" role="presentation">
        <tr style="background:#f8f8f8;border-bottom:2px solid #e0e0e0;">
          <th style="padding:12px;text-align:left;font-size:14px;color:#666;">Item</th>
          <th style="padding:12px;text-align:center;font-size:14px;color:#666;">Qty</th>
          <th style="padding:12px;text-align:right;font-size:14px;color:#666;">Price</th>
        </tr>
        ${rows.map(r => `
          <tr style="border-bottom:1px solid #eee;">
            <td style="padding:12px;">
              ${r.imageUrl ? `<img src="${r.imageUrl}" alt="${r.title}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:12px;">` : ''}
              <span style="font-size:14px;font-weight:600;color:#333;">${r.title}</span>
              ${r.variantTitle ? `<br><span style="font-size:12px;color:#888;">${r.variantTitle}</span>` : ''}
            </td>
            <td style="padding:12px;text-align:center;font-size:14px;color:#333;">x${r.quantity}</td>
            <td style="padding:12px;text-align:right;font-size:14px;font-weight:600;color:#333;">$${r.price}</td>
          </tr>
        `).join('')}
        <tr style="background:#f0f0f0;">
          <td colspan="2" style="padding:14px;font-size:16px;font-weight:700;color:#333;">Cart Total</td>
          <td style="padding:14px;text-align:right;font-size:16px;font-weight:700;color:#333;">$${cartAnalysis.totalValue.toFixed(2)}</td>
        </tr>
      </table>
    `;

    return { type: 'cart_summary', text, html };
  }

  buildSocialProof(cartAnalysis, abVariants) {
    const category = cartAnalysis.dominantCategory;

    // Category-specific social proof (value propositions, not fake reviews)
    const proofData = {
      oilSlick: {
        headline: 'Why professionals choose Oil Slick',
        points: [
          { icon: '🏭', text: 'Medical-grade PTFE - lab-tested, non-stick, solvent-resistant' },
          { icon: '📦', text: 'Trusted by extraction labs and processors nationwide' },
          { icon: '🚚', text: 'Most orders ship same day from Colorado' },
        ],
        statsLine: 'Serving the extraction industry since 2012',
      },
      smokeshop: {
        headline: 'Why shop with Oil Slick Pad',
        points: [
          { icon: '✅', text: 'Curated selection - every piece hand-picked for quality' },
          { icon: '📦', text: 'Discreet, well-padded shipping - arrives in perfect condition' },
          { icon: '💰', text: 'Wholesale prices direct to you - skip the headshop markup' },
        ],
        statsLine: 'Top-rated smoke shop with fast, discreet shipping',
      },
      unknown: {
        headline: 'Why shop with Oil Slick Pad',
        points: [
          { icon: '⭐', text: 'Premium products at competitive prices' },
          { icon: '🚚', text: 'Fast shipping on every order' },
          { icon: '↩️', text: 'Easy returns if you\'re not 100% satisfied' },
        ],
        statsLine: 'Quality products, fast shipping, happy customers',
      },
    };

    const data = proofData[category] || proofData.unknown;

    const text = [
      `\n${data.headline}`,
      ...data.points.map(p => `  ${p.icon} ${p.text}`),
      data.statsLine,
      '',
    ].join('\n');

    const html = `
      <div style="background:#fafafa;border-radius:8px;padding:24px;margin:20px 0;">
        <h3 style="color:#333;margin:0 0 16px;font-size:18px;">${data.headline}</h3>
        ${data.points.map(p => `
          <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:14px;">
            <span style="font-size:20px;line-height:1;">${p.icon}</span>
            <p style="font-size:14px;color:#333;margin:0;line-height:1.5;">${p.text}</p>
          </div>
        `).join('')}
        <p style="font-size:13px;color:#666;text-align:center;margin:12px 0 0;padding-top:12px;border-top:1px solid #eee;">${data.statsLine}</p>
      </div>
    `;

    return { type: 'social_proof', text, html };
  }

  buildDiscountBlock(discountDecision, emailConfig) {
    const percent = discountDecision.discountPercent;
    const code = discountDecision.code;
    const savings = discountDecision.savingsAmount;
    const expiryHours = discountDecision.expiryHours;
    const isFreeShipping = discountDecision.freeShipping;

    let headline, body;
    if (isFreeShipping) {
      headline = 'FREE SHIPPING on your order!';
      body = `Use code ${code} at checkout for free shipping. Expires in ${expiryHours} hours.`;
    } else {
      headline = `${percent}% OFF your cart`;
      body = `Use code ${code} at checkout to save $${savings}. This offer expires in ${expiryHours} hours.`;
    }

    const text = `\n🎁 ${headline}\n${body}\nCode: ${code}\n`;

    const html = `
      <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:12px;padding:32px;margin:24px 0;text-align:center;">
        <h2 style="color:#e94560;margin:0 0 12px;font-size:28px;font-weight:800;">${headline}</h2>
        <p style="color:#fff;font-size:15px;margin:0 0 20px;line-height:1.5;">${body}</p>
        <div style="background:#fff;display:inline-block;padding:12px 32px;border-radius:8px;border:2px dashed #e94560;">
          <span style="font-size:22px;font-weight:700;color:#1a1a2e;letter-spacing:3px;">${code}</span>
        </div>
        ${emailConfig.discountExpiry?.showCountdown ? `
          <p style="color:#e94560;font-size:13px;margin:16px 0 0;">⏰ Expires in ${expiryHours} hours</p>
        ` : ''}
      </div>
    `;

    return { type: 'discount', text, html };
  }

  buildUrgencyBlock(cartAnalysis, emailConfig) {
    const productName = cartAnalysis.highestPriceItem?.title || 'your items';
    const itemCount = cartAnalysis.itemCount;

    const urgencyMessages = [
      `${productName} is popular right now - don't miss out!`,
      `Items in your cart are selling fast. We can only hold them so long.`,
      `Your cart has ${itemCount} item${itemCount > 1 ? 's' : ''} waiting. Complete your order before they're gone.`,
    ];

    const message = urgencyMessages[Math.floor(Math.random() * urgencyMessages.length)];

    const text = `\n⚡ ${message}\n`;

    const html = `
      <div style="background:#fff3cd;border-left:4px solid #ffc107;padding:16px 20px;margin:20px 0;border-radius:0 8px 8px 0;">
        <p style="font-size:14px;color:#856404;margin:0;font-weight:600;">⚡ ${message}</p>
      </div>
    `;

    return { type: 'urgency', text, html };
  }

  buildTrustBadges(customerSegment) {
    // Emphasize trust more for new/unknown customers
    const isNewCustomer = ['New Visitor', 'New Customer'].includes(customerSegment.name);

    const badges = [
      { icon: '🔒', label: 'Secure Checkout', detail: '256-bit SSL encryption' },
      { icon: '🚚', label: 'Fast Shipping', detail: 'Most orders ship same day' },
      { icon: '↩️', label: 'Easy Returns', detail: 'Hassle-free return policy' },
    ];

    if (isNewCustomer) {
      badges.push({ icon: '⭐', label: '10,000+ Customers', detail: 'Trusted since 2012' });
    }

    const text = badges.map(b => `${b.icon} ${b.label} - ${b.detail}`).join('\n');

    const html = `
      <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:16px;margin:20px 0;padding:16px 0;border-top:1px solid #eee;border-bottom:1px solid #eee;">
        ${badges.map(b => `
          <div style="text-align:center;flex:1;min-width:120px;">
            <div style="font-size:24px;">${b.icon}</div>
            <div style="font-size:12px;font-weight:700;color:#333;margin-top:4px;">${b.label}</div>
            <div style="font-size:11px;color:#888;">${b.detail}</div>
          </div>
        `).join('')}
      </div>
    `;

    return { type: 'trust_badges', text, html };
  }

  buildCrossSells(cartAnalysis) {
    const category = cartAnalysis.dominantCategory;

    // Category-specific collection links instead of static placeholders
    const crossSellData = {
      oilSlick: {
        headline: 'Complete Your Extraction Setup',
        description: 'Essential accessories that pair with your Oil Slick products:',
        link: 'https://oilslickpad.com/collections/oil-slick',
        linkText: 'Browse Oil Slick Accessories',
      },
      smokeshop: {
        headline: 'Upgrade Your Experience',
        description: 'Must-have accessories for your new piece:',
        link: 'https://oilslickpad.com/collections/all',
        linkText: 'Browse Accessories',
      },
      unknown: {
        headline: 'You Might Also Like',
        description: 'Check out our best sellers:',
        link: 'https://oilslickpad.com/collections/all',
        linkText: 'Browse All Products',
      },
    };

    const data = crossSellData[category] || crossSellData.unknown;

    const text = `\n--- ${data.headline.toUpperCase()} ---\n${data.description}\n${data.link}\n---\n`;

    const html = `
      <div style="margin:24px 0;text-align:center;">
        <h3 style="color:#333;font-size:16px;margin:0 0 8px;">${data.headline}</h3>
        <p style="color:#666;font-size:14px;margin:0 0 16px;">${data.description}</p>
        <a href="${data.link}" style="display:inline-block;padding:10px 24px;background:#f8f8f8;border:1px solid #ddd;border-radius:8px;color:#333;font-size:14px;font-weight:600;text-decoration:none;">${data.linkText} &rarr;</a>
      </div>
    `;

    return { type: 'cross_sells', text, html };
  }

  buildAlternatives(cartAnalysis) {
    const text = '\nNot quite right? Browse similar products at different price points on our store.\n';

    const html = `
      <div style="background:#f0f8ff;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
        <h3 style="color:#333;font-size:16px;margin:0 0 8px;">Not quite right?</h3>
        <p style="color:#666;font-size:14px;margin:0;">Browse similar products at different price points.</p>
        <a href="https://oilslickpad.com/collections/all" style="display:inline-block;margin-top:12px;color:#e94560;font-size:14px;text-decoration:underline;">Browse All Products →</a>
      </div>
    `;

    return { type: 'alternatives', text, html };
  }

  buildFeedbackRequest(checkout) {
    // Link to contact page (which exists on all Shopify stores) instead of a nonexistent /pages/feedback
    const contactUrl = 'https://oilslickpad.com/pages/contact';

    const text = `\nWe'd love to hear from you - what could we do better?\nReply to this email or reach out: ${contactUrl}\n`;

    const html = `
      <div style="background:#f8f8f8;border-radius:8px;padding:20px;margin:20px 0;text-align:center;">
        <h3 style="color:#333;font-size:16px;margin:0 0 12px;">We'd love your feedback</h3>
        <p style="color:#666;font-size:13px;margin:0 0 16px;">What could we do better? Your input helps us improve.</p>
        <a href="${contactUrl}" style="display:inline-block;padding:10px 24px;background:#fff;border:2px solid #e94560;border-radius:8px;color:#e94560;font-size:13px;font-weight:600;text-decoration:none;">Share Your Thoughts</a>
      </div>
    `;

    return { type: 'feedback', text, html };
  }

  buildCTABlock(checkout, ctaText, discountDecision) {
    // Build cart recovery URL with discount pre-applied
    let cartUrl = checkout.abandoned_checkout_url || `https://oilslickpad.com/cart`;
    if (discountDecision.code) {
      const separator = cartUrl.includes('?') ? '&' : '?';
      cartUrl += `${separator}discount=${encodeURIComponent(discountDecision.code)}`;
    }

    const text = `\n👉 ${ctaText}: ${cartUrl}\n`;

    const html = `
      <div style="text-align:center;margin:32px 0;">
        <a href="${cartUrl}" style="display:inline-block;background:#e94560;color:#fff;padding:16px 48px;border-radius:8px;font-size:18px;font-weight:700;text-decoration:none;letter-spacing:0.5px;">${ctaText}</a>
        <p style="font-size:12px;color:#888;margin-top:12px;">or copy this link: <a href="${cartUrl}" style="color:#888;">${cartUrl}</a></p>
      </div>
    `;

    return { type: 'cta', text, html, url: cartUrl };
  }

  buildFooter() {
    const text = [
      '\n-',
      'Oil Slick Pad - oilslickpad.com',
      'Premium extraction supplies & smokeshop',
      '',
      'You\'re receiving this because you left items in your cart at oilslickpad.com.',
      'Manage your email preferences in your Oil Slick Pad account.',
    ].join('\n');

    const html = `
      <div style="border-top:1px solid #eee;padding:24px 0;margin-top:32px;text-align:center;">
        <p style="font-size:14px;font-weight:600;color:#333;margin:0 0 4px;">Oil Slick Pad</p>
        <p style="font-size:12px;color:#888;margin:0 0 12px;">Premium extraction supplies & smokeshop</p>
        <p style="font-size:11px;color:#aaa;margin:0;">You're receiving this because you left items in your cart at oilslickpad.com.<br>
        Sent via Shopify Email - manage preferences in your account.<br>
        <a href="https://oilslickpad.com/policies/privacy-policy" style="color:#aaa;">Privacy Policy</a></p>
      </div>
    `;

    return { type: 'footer', text, html };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // ASSEMBLY
  // ──────────────────────────────────────────────────────────────────────────

  buildPreheader(email, cartAnalysis, discountDecision) {
    if (discountDecision.shouldDiscount) {
      return `${discountDecision.discountPercent}% off your $${cartAnalysis.totalValue.toFixed(0)} cart - limited time only`;
    }
    return `Your $${cartAnalysis.totalValue.toFixed(0)} cart is still waiting for you`;
  }

  assembleHTML(sections, subject) {
    const body = sections.map(s => s.html).join('\n');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <!--[if mso]><style>table{border-collapse:collapse;}</style><![endif]-->
      </head>
      <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;margin-top:20px;margin-bottom:20px;">
          <!-- Header -->
          <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:24px;text-align:center;">
            <h1 style="color:#fff;margin:0;font-size:24px;font-weight:300;">Oil Slick Pad</h1>
          </div>
          <!-- Content -->
          <div style="padding:32px 24px;">
            ${body}
          </div>
        </div>
      </body>
      </html>
    `;
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
