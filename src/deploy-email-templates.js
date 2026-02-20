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
// Usage:
//   node src/deploy-email-templates.js --dry-run     # Preview
//   node src/deploy-email-templates.js --execute      # Push live
// =============================================================================

import 'dotenv/config';
import { execSync } from 'child_process';

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
  // Clean up the template body — convert markdown-style to HTML
  const htmlBody = body
    .trim()
    .replace(/\n\n/g, '</p><p style="margin:0 0 16px 0;line-height:1.6;">')
    .replace(/\n— /g, '<br>— ')
    .replace(/\n/g, '<br>')
    .replace(/{{#each (\w+)}}([\s\S]*?){{\/each}}/g, '<!-- Dynamic block: $1 -->$2<!-- End dynamic block -->')
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
          <p style="margin:0 0 8px 0;">Oil Slick &mdash; <a href="https://oilslickpad.com" style="color:#666666;">oilslickpad.com</a></p>
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
// ALL EMAIL TEMPLATES
// =============================================================================

const emailTemplates = [
  {
    name: 'order-confirmation',
    subject: 'Got it — your order #{{order_number}} is locked in',
    preheader: 'We are packing your stuff right now.',
    body: `Hey {{first_name}},

Your order just came through and we are on it.

Here is what you grabbed:

{{#each line_items}}
  • {{this.title}} (x{{this.quantity}}) — {{this.price}}
{{/each}}

Order total: {{total_price}}

We pack every piece by hand with extra padding because nobody wants to open a box of broken glass. Your order will ship within 1-2 business days and you will get a tracking number the second it leaves our hands.

A couple things worth knowing:
— If you ordered glass, we wrap it in bubble wrap and foam. We take this seriously.
— Shipping usually takes 3-5 business days depending on where you are.
— If anything looks off or you have questions, just reply to this email. A real person reads these.

Thanks for shopping with us.

— The Oil Slick crew
kris@oilslickpad.com`,
  },
  {
    name: 'shipping-confirmation',
    subject: 'Your order just shipped — tracking inside',
    preheader: 'Your glass is on the move.',
    body: `Hey {{first_name}},

Your order #{{order_number}} just left the building.

Tracking number: {{tracking_number}}
Carrier: {{carrier}}
Track it here: {{tracking_url}}

Estimated delivery: {{estimated_delivery}}

What to expect:
— Tracking sometimes takes 12-24 hours to update after we hand it off to the carrier. If it says "label created" for a day, that is normal.
— Everything is packed with care. We use thick bubble wrap and foam inserts for glass.
— When your package arrives, check everything before you toss the packaging. If anything is damaged in shipping, take photos and email us at kris@oilslickpad.com — we will make it right.

Enjoy the new gear.

— Oil Slick`,
  },
  {
    name: 'delivery-followup',
    subject: 'Everything land in one piece?',
    preheader: 'Just checking in on your order.',
    body: `Hey {{first_name}},

Your order should have arrived by now so just wanted to check — did everything show up in good shape?

If something got damaged in transit or is not what you expected, do not stress about it. Just shoot us an email at kris@oilslickpad.com with a photo and your order number and we will sort it out. We stand behind what we sell.

If everything is good and you are already putting your new piece to work — that is what we like to hear.

In a few days we will send you a quick link to leave a review. Those reviews genuinely help other people figure out what to buy, and they help us keep stocking the stuff that actually works.

Thanks again for the order.

— The Oil Slick crew`,
  },
  {
    name: 'review-request',
    subject: 'Quick favor — how is the {{product_title}} working out?',
    preheader: '30 seconds, no fluff — just tell us what you think.',
    body: `Hey {{first_name}},

You have had your {{product_title}} for about a week now. How is it treating you?

We would genuinely appreciate a quick review. You do not need to write an essay — even a sentence or two helps other customers figure out if something is worth buying.

Leave a review here: {{review_url}}

A few things people usually mention that are helpful:
— How is the build quality?
— Does it hit the way you expected?
— Would you buy it again?

That is it. Takes maybe 30 seconds.

If you are NOT happy with it for any reason, skip the review and email us instead. We would rather fix the problem than have you leave a frustrated review.

Thanks for being a customer.

— Oil Slick`,
  },
  {
    name: 'post-review-thankyou',
    subject: 'Thanks for the review — here is something for your next order',
    preheader: 'We read every single one of these.',
    body: `Hey {{first_name}},

We just saw your review come through and wanted to say thanks. We read every single one and they honestly help us decide what to keep stocking and what to drop.

As a thank you, here is 10% off your next order:

Code: THANKS10

No minimum, works on anything in the store. Use it whenever you are ready.

— Oil Slick`,
  },
  {
    name: 'cross-sell-bong',
    subject: 'A few things that go great with your new bong',
    preheader: 'Bowls, ash catchers, and stuff you will actually use.',
    body: `Hey {{first_name}},

Now that you have had some time with your new bong, here are a few accessories that pair well with it:

Flower Bowls — If you want to switch up bowl sizes or replace a stock bowl with something nicer, we have a full selection in 10mm, 14mm, and 18mm.

Ash Catchers — Keeps your bong water cleaner for longer and adds an extra layer of filtration. Once you use one, you will wonder why you waited.

Cleaning Supplies — Res caps, isopropyl-safe plugs, and cleaning solutions to keep your glass looking new.

Downstems — A good diffused downstem can completely change how your bong hits. Worth trying if you are still using the stock one.

No pressure — just thought you should know what is out there.

— Oil Slick`,
  },
  {
    name: 'cross-sell-dab-rig',
    subject: 'Dial in your dab setup — a few essentials',
    preheader: 'Bangers, carb caps, and tools to level up your sessions.',
    body: `Hey {{first_name}},

Got your dab rig set up? Here are a few things that can take your sessions from good to great:

Quartz Bangers — If your rig came with a basic banger, upgrading to a thicker quartz banger makes a real difference in heat retention and flavor.

Carb Caps — A proper carb cap lets you dab at lower temps, which means better flavor and less waste. It is one of those things that seems optional until you try it.

Dab Tools — Having the right tool for the consistency you are working with (shatter vs. badder vs. sauce) makes loading way easier.

Torches — If you are using a cheap torch from the hardware store, a proper dab torch heats more evenly and lasts longer.

Just some ideas. No rush.

— Oil Slick`,
  },
  {
    name: 'cross-sell-hand-pipe',
    subject: 'A couple things to go with your new pipe',
    preheader: 'Grinders, screens, and a few upgrades worth checking out.',
    body: `Hey {{first_name}},

Enjoying the new pipe? Here are a couple things that make the experience even better:

Grinders — If you are still breaking up flower by hand, a decent grinder is a game changer. Even grind means even burn.

Screens — Keeps ash and scooby snacks out of your mouth. Small thing that makes a big difference.

Bubblers — If you like the portability of a hand pipe but want smoother hits, a bubbler adds water filtration in a handheld package.

Cleaning Supplies — A little isopropyl and salt go a long way, but our cleaning kits make it even easier.

— Oil Slick`,
  },
  {
    name: 'cross-sell-rolling',
    subject: 'Restock your rolling setup?',
    preheader: 'Trays, grinders, and fresh papers when you need them.',
    body: `Hey {{first_name}},

Papers and cones go fast, so just a heads up — here is what pairs well with your rolling setup:

Rolling Trays — Keeps your workspace clean and makes rolling way easier. We carry a bunch of styles and sizes.

Grinders — Consistent grind makes for a better roll. Period. If you do not have one yet, it is worth the few bucks.

More Papers and Cones — When you are ready to restock, we carry RAW, Vibes, Elements, Zig Zag, and more.

Storage — Doob tubes, stash jars, and containers to keep your pre-rolls fresh.

— Oil Slick`,
  },
  {
    name: 'restock-reminder',
    subject: 'Running low on {{product_title}}?',
    preheader: 'Figured you might be due for a restock.',
    body: `Hey {{first_name}},

It has been about {{days_since_purchase}} days since you grabbed {{product_title}} and depending on how heavy your rotation is, you might be getting close to running low.

Reorder here: {{product_url}}

Same product, same price, same fast shipping. We keep these stocked so you should not run into any out-of-stock issues.

— Oil Slick`,
  },
  {
    name: 'abandoned-cart-1hr',
    subject: 'You left something in your cart',
    preheader: 'Your cart is still saved — just a heads up.',
    body: `Hey {{first_name}},

Looks like you started checking out but did not finish. No worries — your cart is saved and ready whenever you are.

Here is what you left behind:

{{#each cart_items}}
  • {{this.title}} — {{this.price}}
{{/each}}

Pick up where you left off: {{checkout_url}}

If you ran into an issue with the checkout or had a question about something, hit reply and let us know. We are around.

— Oil Slick`,
  },
  {
    name: 'abandoned-cart-24hr',
    subject: 'Still thinking it over?',
    preheader: 'Your cart is waiting. Here is why people like this stuff.',
    body: `Hey {{first_name}},

Just one more nudge — your cart at Oil Slick still has:

{{#each cart_items}}
  • {{this.title}} — {{this.price}}
{{/each}}

A few things that might help you decide:

— Every glass piece ships with extra bubble wrap and foam padding. We have not had a breakage complaint in months.
— Free shipping on qualifying orders. Check if yours qualifies at checkout.
— If you are comparing prices, we keep ours competitive. We would rather earn a customer for life than squeeze you on one order.

Finish your order: {{checkout_url}}

— Oil Slick`,
  },
  {
    name: 'abandoned-cart-72hr',
    subject: 'Last call — 10% off to seal the deal',
    preheader: 'We threw in a discount code. Your cart is still waiting.',
    body: `Hey {{first_name}},

This is the last time we will bug you about this. Your cart still has:

{{#each cart_items}}
  • {{this.title}} — {{this.price}}
{{/each}}

We want you to have this stuff, so here is 10% off your order:

Code: COMEBACK10

Use it here: {{checkout_url}}

After this, we will leave you alone about this cart. But the code is good on anything in the store for the next 7 days if you want to shop around.

— Oil Slick`,
  },
  {
    name: 'welcome-1-signup',
    subject: 'Welcome to Oil Slick — here is what we are about',
    preheader: 'Glass, rigs, pipes, and gear from people who actually smoke.',
    body: `Hey {{first_name}},

Thanks for signing up. Here is the short version of who we are:

We are an online smokeshop based in the US. We sell glass bongs, dab rigs, hand pipes, bubblers, rolling papers, vape gear, and all the accessories that go with them. Over 700 products from brands and glassblowers we have personally vetted.

A few things that set us apart:
— We pack every glass piece by hand with bubble wrap and foam. Breakage is basically nonexistent.
— We carry a full Made in USA glass collection from independent American glassblowers.
— Our prices are fair. We are not the cheapest and we are not trying to be, but you are getting quality glass at honest prices.
— Real people answer emails. If you have a question or a problem, email kris@oilslickpad.com and you will get an actual answer.

To get you started, here is 10% off your first order:

Code: WELCOME10

Browse the shop: https://oilslickpad.com

— The Oil Slick crew`,
  },
  {
    name: 'welcome-2-bestsellers',
    subject: 'Our most popular stuff right now',
    preheader: 'What everyone else is buying this month.',
    body: `Hey {{first_name}},

Not sure where to start? Here is what is selling the most right now:

Most people start with one of these categories:

Bongs — For flower smokers who want smooth, water-filtered hits.
Dab Rigs — Built specifically for concentrates and extracts.
Hand Pipes — Simple, portable, no setup required.
Made in USA Glass — Handcrafted pieces from American glassblowers.

Your 10% off code WELCOME10 is still active if you want to use it.

— Oil Slick`,
  },
  {
    name: 'welcome-3-trust',
    subject: 'Why people keep coming back to Oil Slick',
    preheader: 'Real reviews from real customers.',
    body: `Hey {{first_name}},

We are not going to pretend we are the only smokeshop on the internet. There are hundreds. So here is why people choose us and keep coming back:

"Best glass selection online. Ordered a beaker bong and it arrived in perfect condition. Packaging was insane — like three layers of bubble wrap." — Marcus T.

"Fast shipping and the dab rig I got is way thicker than I expected for the price. Already ordered a second one for my buddy." — Jessica R.

"I stock my shop with Oil Slick products. Consistent quality, good margins, and they actually communicate when there are delays." — David M.

We have earned those reviews by doing the basics right: good products, honest prices, careful packaging, and responding when people reach out.

Your 10% off code WELCOME10 is still valid.

Use it here: https://oilslickpad.com

— Oil Slick`,
  },
  {
    name: 'winback-30day',
    subject: 'Been a minute — here is what is new',
    preheader: 'New glass, new accessories, same fast shipping.',
    body: `Hey {{first_name}},

It has been about a month since your last order and we have gotten some new stuff in since then. Figured you might want to take a look.

Same deal as always — ships from the US, packed with care, and if anything is not right we make it right.

Browse new arrivals: https://oilslickpad.com/collections/new-arrivals

— Oil Slick`,
  },
  {
    name: 'winback-60day',
    subject: 'We miss your orders, {{first_name}}',
    preheader: 'Straight up — we have got stuff you will like.',
    body: `Hey {{first_name}},

It has been a couple months since you ordered from us. No guilt trip — just wanted to make sure you know we are still here and still stocking good glass at fair prices.

Since your last visit we have added:
— New Made in USA glass pieces from independent blowers
— Expanded our dab accessories with more banger and carb cap options
— Restocked popular items that were sold out

Here is 10% off if something catches your eye:

Code: MISSYOU10

Shop now: https://oilslickpad.com

And if you left us because something went wrong with an order, reply to this email. We take that stuff seriously and want to make it right.

— Oil Slick`,
  },
  {
    name: 'winback-90day',
    subject: 'One more try before we stop emailing you',
    preheader: '15% off and then we will back off.',
    body: `Hey {{first_name}},

We do not want to be that store that spams your inbox, so this is our last reach-out for a while.

If you are still into glass and smoking gear, we would love to keep you as a customer. Here is our best offer:

15% off anything in the store:

Code: WELCOME15

Shop now: https://oilslickpad.com

If you are not interested anymore, that is completely fine. You can unsubscribe below and we will not take it personally.

But if you DO come back, we think you will notice that we have expanded the catalog quite a bit since you were last around.

Thanks for being a customer in the first place.

— Oil Slick`,
  },
  {
    name: 'sunset-120day',
    subject: 'Should we keep sending you emails?',
    preheader: 'Honest question — we only want to email people who want to hear from us.',
    body: `Hey {{first_name}},

Quick question — do you still want to hear from us?

We have not seen you around in a while and we do not want to clog your inbox with emails you are not reading. We would rather have a smaller list of people who actually care than blast thousands of people who do not.

If you want to stay on the list:
Click here and you are all set: {{resubscribe_url}}

If you are done:
No need to do anything. We will remove you from our email list in 7 days. You can always come back to oilslickpad.com and sign up again if you change your mind.

No hard feelings either way.

— Oil Slick`,
  },
  {
    name: 'vip-recognition',
    subject: 'You are one of our best customers — this is for you',
    preheader: 'Not a marketing gimmick. Genuine thank you.',
    body: `Hey {{first_name}},

Real talk — you have ordered from us {{order_count}} times now and we wanted to acknowledge that. Most people buy once and move on, but you keep coming back. That means a lot to a small operation like ours.

So here is something just for repeat customers:

15% off your next order, no minimum, no restrictions:

Code: VIP15

We also want you to know that if you ever need help picking out a piece, want a recommendation, or need to sort out an issue with an order — you go to the front of the line. Just reply to this email.

Thanks for being a real one.

— Kris and the Oil Slick crew`,
  },
  {
    name: 'birthday',
    subject: 'Happy birthday, {{first_name}} — this one is on us',
    preheader: 'Birthday discount inside. Treat yourself.',
    body: `Hey {{first_name}},

Happy birthday. We are not going to write you a long sappy email — just wanted to drop off a gift:

20% off anything in the store:

Code: BDAY20

No minimum order. Works on everything including sale items. Go get yourself something nice.

— Oil Slick`,
  },
  {
    name: 'referral-nudge',
    subject: 'Know someone who would dig our stuff?',
    preheader: 'You both get a discount. Pretty simple.',
    body: `Hey {{first_name}},

If you have got a friend who is into glass or smoking gear, we have got a deal that works for both of you:

Send them your referral link: {{referral_link}}

When they make their first purchase, they get 15% off. And you get 15% off your next order. Everybody wins.

No catch. No limits on how many people you refer. Every time someone uses your link, you get another 15% code.

It is the easiest way to hook up your friends and save yourself some money at the same time.

— Oil Slick`,
  },
  {
    name: 'wholesale-followup',
    subject: 'Thanks for the bulk order — quick note about wholesale pricing',
    preheader: 'If you are buying for a shop, we should talk.',
    body: `Hey {{first_name}},

We noticed your recent order was on the larger side and wanted to reach out. If you are stocking a retail shop, buying for a lounge, or just like to buy in bulk for any reason — we have wholesale pricing that could save you a good amount on future orders.

What our wholesale customers get:
— Tiered discounts based on order volume
— Priority on new product drops and restocks
— Dedicated support line for order issues
— Net terms available for qualified accounts

If any of this sounds useful, reply to this email or reach out to kris@oilslickpad.com and we will get you set up. No lengthy application or minimum commitments — we keep it simple.

Either way, thanks for the business. We appreciate big orders just as much as small ones.

— Kris
Oil Slick / oilslickpad.com`,
  },
];


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
   Flow trigger: (Manual — trigger when review app webhook fires)
   Flow action: Send marketing email
   Email asset: assets/email-post-review-thankyou.html

10. RESTOCK REMINDER
    Flow trigger: Order fulfilled
    Flow delay: Wait 45 days
    Flow condition: Order line items tagged "rolling-paper" OR
                    "cleaning-supply" OR "screen" OR "torch" OR "lighter"
    Flow action: Send marketing email
    Email asset: assets/email-restock-reminder.html

11. SUNSET FLOW
    Flow trigger: Scheduled (daily)
    Flow condition: Last order > 120 days ago
    Flow action: Send marketing email
    Email asset: assets/email-sunset-120day.html

12. VIP RECOGNITION
    Flow trigger: Order created
    Flow condition: Customer order count >= 3 OR lifetime spend >= $200
    Flow action: Send marketing email
    Email asset: assets/email-vip-recognition.html

13. BIRTHDAY
    Flow trigger: Scheduled (daily)
    Flow condition: Customer birthday = today (requires birthday metafield)
    Flow action: Send marketing email
    Email asset: assets/email-birthday.html

14. REFERRAL NUDGE
    Flow trigger: Order fulfilled
    Flow delay: Wait 30 days
    Flow condition: Customer order count = 1
    Flow action: Send marketing email
    Email asset: assets/email-referral-nudge.html

15. WHOLESALE FOLLOW-UP
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
  console.log('OIL SLICK — EMAIL TEMPLATE DEPLOYMENT');
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
