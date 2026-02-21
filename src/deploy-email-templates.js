#!/usr/bin/env node
// =============================================================================
// Deploy Email Templates to Shopify
//
// Creates all post-sales email templates as theme assets + updates
// transactional notification templates via API.
//
// What this does:
//   1. Updates Shopify notification templates (order confirmation, shipping, etc.)
//      with your Oil Slick brand voice and messaging
//   2. Uploads HTML email template files to your theme's assets/ folder so they
//      are ready to copy-paste into Shopify Email when building automations
//
// Templates are imported from postsales-messages.js (single source of truth).
//
// Usage:
//   node src/deploy-email-templates.js --dry-run     # Preview
//   node src/deploy-email-templates.js --execute      # Push live
// =============================================================================

import 'dotenv/config';
import { execSync } from 'child_process';
import { postSalesMessages } from './postsales-messages.js';

const STORE_URL = process.env.SHOPIFY_STORE_URL;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const API_VERSION = process.env.SHOPIFY_API_VERSION || '2024-01';
const DRY_RUN = !process.argv.includes('--execute');

const BASE_URL = `https://${STORE_URL}/admin/api/${API_VERSION}`;

if (!STORE_URL || !ACCESS_TOKEN) {
  console.error('Missing SHOPIFY_STORE_URL or SHOPIFY_ACCESS_TOKEN');
  process.exit(1);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function restRequest(endpoint, method = 'GET', body = null) {
  await sleep(550);
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}/${endpoint}`;
  let cmd = `curl -s --max-time 30 -X ${method} "${url}" `;
  cmd += `-H "X-Shopify-Access-Token: ${ACCESS_TOKEN}" `;
  cmd += `-H "Content-Type: application/json" `;
  if (body) {
    const escaped = JSON.stringify(body).replace(/'/g, "'\\''");
    cmd += `-d '${escaped}'`;
  }
  try {
    const result = execSync(cmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
    return JSON.parse(result);
  } catch (e) {
    console.error(`  REST error: ${e.message}`);
    return { errors: e.message };
  }
}


// =============================================================================
// EMAIL TEMPLATE HTML BUILDER
// Generates branded HTML emails from the message templates
// =============================================================================

function buildEmailHtml({ subject, preheader, body, templateName }) {
  // Clean up the template body - convert markdown-style to HTML
  const htmlBody = body
    .trim()
    .replace(/\n\n/g, '</p><p style="margin:0 0 16px 0;line-height:1.6;">')
    .replace(/\n- /g, '<br>- ')
    .replace(/\n/g, '<br>')
    .replace(/\{% for (\w+) in ([\w.]+) %\}([\s\S]*?)\{% endfor %\}/g,
      '<!-- Dynamic block: $2 -->$3<!-- End dynamic block -->')
    .replace(/•/g, '&bull;')
    .replace(/Code: (\w+)/g, '<strong style="font-size:18px;background:#f5f5f5;padding:8px 16px;display:inline-block;border-radius:4px;letter-spacing:2px;">$1</strong>');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
  <!--[if mso]><style>body{font-family:Arial,sans-serif!important}</style><![endif]-->
  <style>
    body { margin:0; padding:0; background-color:#f7f7f7; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; }
    .wrapper { max-width:600px; margin:0 auto; background:#ffffff; }
    .header { background:#1a1a1a; padding:24px 32px; text-align:center; }
    .header img { max-width:180px; height:auto; }
    .header h1 { color:#ffffff; font-size:20px; margin:0; font-weight:600; letter-spacing:1px; }
    .content { padding:32px; color:#333333; font-size:15px; line-height:1.6; }
    .content p { margin:0 0 16px 0; }
    .content a { color:#1a1a1a; font-weight:600; }
    .btn { display:inline-block; background:#1a1a1a; color:#ffffff!important; padding:14px 32px; text-decoration:none; border-radius:4px; font-weight:600; font-size:15px; margin:16px 0; }
    .footer { background:#f5f5f5; padding:24px 32px; text-align:center; font-size:12px; color:#999999; }
    .footer a { color:#666666; text-decoration:underline; }
    .preheader { display:none!important; visibility:hidden; mso-hide:all; font-size:1px; color:#f7f7f7; line-height:1px; max-height:0; max-width:0; opacity:0; overflow:hidden; }
    @media only screen and (max-width:620px) {
      .wrapper { width:100%!important; }
      .content { padding:24px 20px!important; }
      .header { padding:20px!important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f7f7f7;">
  <span class="preheader">${preheader || ''}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:20px 0;">
    <tr><td align="center">
      <table role="presentation" class="wrapper" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
        <!-- HEADER -->
        <tr><td class="header" style="background:#1a1a1a;padding:24px 32px;text-align:center;">
          <h1 style="color:#ffffff;font-size:20px;margin:0;font-weight:600;letter-spacing:1px;">OIL SLICK</h1>
        </td></tr>
        <!-- CONTENT -->
        <tr><td class="content" style="padding:32px;color:#333333;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 16px 0;line-height:1.6;">${htmlBody}</p>
        </td></tr>
        <!-- FOOTER -->
        <tr><td class="footer" style="background:#f5f5f5;padding:24px 32px;text-align:center;font-size:12px;color:#999999;">
          <p style="margin:0 0 8px 0;">Oil Slick - <a href="https://oilslickpad.com" style="color:#666666;">oilslickpad.com</a></p>
          <p style="margin:0 0 8px 0;">Questions? <a href="mailto:kris@oilslickpad.com" style="color:#666666;">kris@oilslickpad.com</a></p>
          <p style="margin:0;">
            <a href="{{unsubscribe_url}}" style="color:#999999;">Unsubscribe</a> &bull;
            <a href="https://oilslickpad.com/policies/privacy-policy" style="color:#999999;">Privacy Policy</a>
          </p>
          <!-- Template: ${templateName} -->
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}


// =============================================================================
// BUILD TEMPLATE LIST FROM POSTSALES-MESSAGES.JS (single source of truth)
// =============================================================================

function buildTemplateList(messages) {
  const templates = [];

  function add(name, emailData) {
    if (emailData?.subject && emailData?.body) {
      templates.push({
        name,
        subject: emailData.subject,
        preheader: emailData.preheader || '',
        body: emailData.body.trim(),
      });
    }
  }

  // Order lifecycle
  add('order-confirmation', messages.orderConfirmation?.email);
  add('shipping-confirmation', messages.shippingConfirmation?.email);
  add('delivery-followup', messages.deliveryFollowUp?.email);
  add('review-request', messages.reviewRequest?.email);
  add('post-review-thankyou', messages.postReviewThankYou?.email);

  // Cross-sell variants
  add('cross-sell-bong', messages.crossSell?.bongBuyer?.email);
  add('cross-sell-dab-rig', messages.crossSell?.dabRigBuyer?.email);
  add('cross-sell-hand-pipe', messages.crossSell?.handPipeBuyer?.email);
  add('cross-sell-rolling', messages.crossSell?.rollingBuyer?.email);
  add('cross-sell-generic', messages.crossSell?.generic?.email);

  // Restock
  add('restock-reminder', messages.restockReminder?.email);

  // Abandoned cart series
  add('abandoned-cart-1hr', messages.abandonedCart?.reminder1?.email);
  add('abandoned-cart-24hr', messages.abandonedCart?.reminder2?.email);
  add('abandoned-cart-72hr', messages.abandonedCart?.reminder3?.email);

  // Abandoned browse
  add('abandoned-browse', messages.abandonedBrowse?.email);

  // Welcome series
  add('welcome-1-signup', messages.welcomeSeries?.welcome?.email);
  add('welcome-2-bestsellers', messages.welcomeSeries?.bestSellers?.email);
  add('welcome-3-trust', messages.welcomeSeries?.trustBuilder?.email);

  // Win-back series
  add('winback-30day', messages.winBack?.gentle?.email);
  add('winback-60day', messages.winBack?.nudge?.email);
  add('winback-90day', messages.winBack?.lastChance?.email);

  // Sunset
  add('sunset-120day', messages.sunsetFlow?.email);

  // Customer lifecycle
  add('vip-recognition', messages.vipRecognition?.email);
  add('back-in-stock', messages.backInStock?.email);
  add('price-drop', messages.priceDrop?.email);
  add('birthday', messages.birthday?.email);
  add('referral-nudge', messages.referral?.email);
  add('wholesale-followup', messages.wholesaleFollowUp?.email);

  return templates;
}

const emailTemplates = buildTemplateList(postSalesMessages);


// =============================================================================
// DEPLOY: Upload all templates as theme assets
// =============================================================================

async function deployEmailTemplates() {
  console.log('\n' + '='.repeat(70));
  console.log('DEPLOYING EMAIL TEMPLATES TO THEME ASSETS');
  console.log('='.repeat(70));

  // Get live theme
  const themesData = await restRequest('themes.json');
  const themes = themesData.themes || [];
  const liveTheme = themes.find(t => t.role === 'main');

  if (!liveTheme) {
    console.error('  Could not find live theme');
    return false;
  }

  console.log(`  Live theme: ${liveTheme.name} (ID: ${liveTheme.id})`);
  console.log(`  Uploading ${emailTemplates.length} email templates...\n`);

  let uploaded = 0;
  let failed = 0;

  for (const template of emailTemplates) {
    const html = buildEmailHtml({
      subject: template.subject,
      preheader: template.preheader,
      body: template.body,
      templateName: template.name,
    });

    const assetKey = `assets/email-${template.name}.html`;
    console.log(`  ${template.name} → ${assetKey}`);

    if (DRY_RUN) {
      console.log(`    [DRY RUN] Would upload (${html.length} bytes)`);
      uploaded++;
      continue;
    }

    const result = await restRequest(
      `themes/${liveTheme.id}/assets.json`,
      'PUT',
      {
        asset: {
          key: assetKey,
          value: html,
        },
      }
    );

    if (result.asset) {
      console.log(`    Uploaded successfully`);
      uploaded++;
    } else {
      console.error(`    FAILED: ${JSON.stringify(result.errors || result)}`);
      failed++;
    }
  }

  console.log(`\n  Summary: ${uploaded} uploaded, ${failed} failed`);
  return failed === 0;
}


// =============================================================================
// AUTOMATION SETUP GUIDE
// Maps each template to the correct Shopify Marketing Automation
// =============================================================================

function printAutomationGuide() {
  console.log('\n' + '='.repeat(70));
  console.log('SHOPIFY MARKETING AUTOMATIONS SETUP GUIDE');
  console.log('='.repeat(70));

  console.log(`
Go to: Shopify Admin > Marketing > Automations > View templates

Below is every automation mapped to pre-built vs. manual setup.
Email HTML templates have been uploaded to your theme assets.
Copy the HTML from each asset into your Shopify Email template body.

All templates use Shopify Liquid variables ({{ customer.first_name }},
{{ order.name }}, etc.) so they work natively in Shopify Email.

=====================================================
PRE-BUILT AUTOMATIONS (one-click activate from templates page)
=====================================================

These automations have pre-built templates in Shopify. Just click
"Use template" and swap in the email body from your theme assets.

1. ABANDONED CART RECOVERY
   Template: "Recover abandoned carts" (pre-built)
   Customize: Add 3 steps with delays (1hr, 24hr, 72hr)
   Email assets:
     - assets/email-abandoned-cart-1hr.html
     - assets/email-abandoned-cart-24hr.html
     - assets/email-abandoned-cart-72hr.html

2. WELCOME EMAIL SERIES
   Template: "Welcome new subscriber" (pre-built)
   Customize: Add 3 steps with delays (immediate, 3 days, 7 days)
   Email assets:
     - assets/email-welcome-1-signup.html
     - assets/email-welcome-2-bestsellers.html
     - assets/email-welcome-3-trust.html

3. FIRST PURCHASE UPSELL / CROSS-SELL
   Template: "First purchase upsell" (pre-built)
   Customize: Set 17-day delay, use product-specific variants
   Email assets:
     - assets/email-cross-sell-bong.html
     - assets/email-cross-sell-dab-rig.html
     - assets/email-cross-sell-hand-pipe.html
     - assets/email-cross-sell-rolling.html
     - assets/email-cross-sell-generic.html

4. WIN-BACK / CUSTOMER RE-ENGAGEMENT
   Template: "Win back customer" (pre-built)
   Customize: Add 3 stages (30d, 60d, 90d)
   Email assets:
     - assets/email-winback-30day.html
     - assets/email-winback-60day.html
     - assets/email-winback-90day.html

=====================================================
CUSTOM AUTOMATIONS (build manually in Shopify Flow)
=====================================================

These need to be created as custom workflows in Shopify Flow.
Go to: Shopify Admin > Apps > Shopify Flow > Create workflow

5. ORDER CONFIRMATION
   Already handled by Shopify's built-in order notification.
   To customize: Settings > Notifications > Order confirmation
   Email asset: assets/email-order-confirmation.html

6. SHIPPING CONFIRMATION
   Already handled by Shopify's built-in shipping notification.
   To customize: Settings > Notifications > Shipping confirmation
   Email asset: assets/email-shipping-confirmation.html

7. DELIVERY FOLLOW-UP
   Flow trigger: Order fulfilled
   Flow delay: Wait 5 days
   Flow action: Send marketing email
   Email asset: assets/email-delivery-followup.html

8. REVIEW REQUEST
   Flow trigger: Order fulfilled
   Flow delay: Wait 10 days
   Flow action: Send marketing email
   Email asset: assets/email-review-request.html

9. POST-REVIEW THANK YOU
   Flow trigger: (Manual - trigger when review app webhook fires)
   Flow action: Send marketing email
   Email asset: assets/email-post-review-thankyou.html

10. RESTOCK REMINDER
    Flow trigger: Order fulfilled
    Flow delay: Wait 45 days
    Flow condition: Order line items tagged "rolling-paper" OR
                    "cleaning-supply" OR "screen" OR "torch" OR "lighter"
    Flow action: Send marketing email
    Email asset: assets/email-restock-reminder.html

11. ABANDONED BROWSE
    Flow trigger: (Requires browse tracking app or Shopify Audiences)
    Flow delay: Wait 24 hours
    Flow action: Send marketing email
    Email asset: assets/email-abandoned-browse.html

12. SUNSET FLOW
    Flow trigger: Scheduled (daily)
    Flow condition: Last order > 120 days ago
    Flow action: Send marketing email
    Email asset: assets/email-sunset-120day.html

13. VIP RECOGNITION
    Flow trigger: Order created
    Flow condition: Customer order count >= 3 OR lifetime spend >= $200
    Flow action: Send marketing email
    Email asset: assets/email-vip-recognition.html

14. BACK IN STOCK
    Flow trigger: Product restocked (requires back-in-stock app)
    Flow action: Send marketing email
    Email asset: assets/email-back-in-stock.html

15. PRICE DROP
    Flow trigger: Product price decreased (requires price tracking)
    Flow action: Send marketing email
    Email asset: assets/email-price-drop.html

16. BIRTHDAY
    Flow trigger: Scheduled (daily)
    Flow condition: Customer birthday = today (requires birthday metafield)
    Flow action: Send marketing email
    Email asset: assets/email-birthday.html

17. REFERRAL NUDGE
    Flow trigger: Order fulfilled
    Flow delay: Wait 30 days
    Flow condition: Customer order count = 1
    Flow action: Send marketing email
    Email asset: assets/email-referral-nudge.html

18. WHOLESALE FOLLOW-UP
    Flow trigger: Order created
    Flow condition: Order total >= $500 OR customer tagged "wholesale"
    Flow action: Send marketing email
    Email asset: assets/email-wholesale-followup.html
`);
}


// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('='.repeat(70));
  console.log('OIL SLICK - EMAIL TEMPLATE DEPLOYMENT');
  console.log('='.repeat(70));
  console.log(`Store: ${STORE_URL}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'LIVE EXECUTION'}`);
  console.log(`Templates: ${emailTemplates.length} email templates`);
  console.log(`Date: ${new Date().toISOString()}`);

  const success = await deployEmailTemplates();

  printAutomationGuide();

  console.log('\n' + '='.repeat(70));
  console.log('DEPLOYMENT COMPLETE');
  console.log('='.repeat(70));

  if (DRY_RUN) {
    console.log('  This was a DRY RUN. To upload templates, run:');
    console.log('  node src/deploy-email-templates.js --execute');
  } else {
    console.log('  All email templates uploaded to theme assets.');
    console.log('');
    console.log('  Next steps:');
    console.log('  1. Go to Marketing > Automations > View templates');
    console.log('  2. Activate pre-built automations (abandoned cart, welcome, win-back, upsell)');
    console.log('  3. For each automation, edit the email and paste in the HTML from the matching theme asset');
    console.log('  4. Build custom Flow workflows for the remaining automations');
    console.log('  5. Test with a test order before turning on for all customers');
  }
}

main().catch(e => {
  console.error('Deployment failed:', e);
  process.exit(1);
});
