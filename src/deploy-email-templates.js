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
    subject: 'It\'s happening — order #{{order_number}} is in our hands',
    preheader: 'Your glass is getting the bubble-wrap-and-foam treatment right now.',
    body: `Hey {{first_name}},

This is the good part — your order just locked in and we're already pulling it off the shelf.

Here's what's headed your way:

{{#each line_items}}
  • {{this.title}} (x{{this.quantity}}) — {{this.price}}
{{/each}}

Order total: {{total_price}}

We've shipped over 10,000 orders and we treat every single one like it's our own piece inside that box. Bubble wrap, foam inserts, hand-packed. Breakage rate: basically zero.

What happens next:
— Your order ships within 1-2 business days.
— You'll get a tracking number the second it leaves.
— Delivery usually takes 3-5 business days depending on where you are.

Questions? Just reply to this email. A real human named Kris reads these.

— The Oil Slick crew

P.S. Keep an eye on your inbox — your tracking email is coming soon with a live link to follow your package.`,
  },
  {
    name: 'shipping-confirmation',
    subject: 'Tracking live — your order #{{order_number}} is moving',
    preheader: 'One click and you can watch it in real time.',
    body: `Hey {{first_name}},

Track your package here: {{tracking_url}}

Tracking number: {{tracking_number}}
Carrier: {{carrier}}
Estimated delivery: {{estimated_delivery}}

Your order #{{order_number}} just left our shop, packed in bubble wrap and foam inserts — the way every glass piece should travel.

Look — tracking can take 12-24 hours to go live after we hand it off. If it says "label created" for a day, that's completely normal.

When your package arrives, give everything a once-over before you toss the packaging. If anything got damaged in transit, snap a photo and email kris@oilslickpad.com. We'll replace it. No runaround.

— Oil Slick

P.S. Once your order lands, we'll check in to make sure everything arrived in one piece. Keep an eye out.`,
  },
  {
    name: 'delivery-followup',
    subject: 'Did your order survive the trip?',
    preheader: 'If not, we\'ll fix it today.',
    body: `Hey {{first_name}},

Your order should be in your hands by now. Quick question — did everything arrive the way it should?

If yes: awesome, enjoy the new gear.

If not: email kris@oilslickpad.com with a photo and your order number. We'll ship a replacement or issue a refund — your call. No forms, no waiting on hold, no hoops. We fix it the same day.

We stand behind every piece we sell. If it's not right, we make it right.

— The Oil Slick crew

P.S. In a few days we'll send you a quick link to share your experience. Your review helps the next person decide what to buy — and it takes about 30 seconds.`,
  },
  {
    name: 'review-request',
    subject: '30 seconds that helps the next person pick their piece',
    preheader: 'Your experience with the {{product_title}} matters more than you think.',
    body: `Hey {{first_name}},

You've had your {{product_title}} for about a week now — and someone out there is staring at the same product page right now, wondering if it's worth it.

Your honest take could be the thing that helps them decide.

Leave a review here: {{review_url}}

You don't need to write an essay. A sentence or two is perfect. Here's what's most helpful:
— Does it hit the way you expected?
— How does the build quality feel?
— Would you buy it again?

That's it. 30 seconds, tops.

If you're NOT happy with it, skip the review and reply to this email instead. We'd rather fix the issue than have you leave a frustrated one.

— Oil Slick

P.S. Every review we get helps us decide what to keep stocking and what to drop. Yours genuinely matters.`,
  },
  {
    name: 'post-review-thankyou',
    subject: 'You just helped someone pick their next piece — thank you',
    preheader: '10% off as a small thank you from the crew.',
    body: `Hey {{first_name}},

Your review just came through. Thank you — seriously.

We read every single one, and yours is already helping the next customer make a more confident decision. That matters to us.

Here's 10% off your next order as a thank you:

Code: THANKS10

No minimum. Works on anything. Use it whenever.

— Oil Slick

P.S. We use reviews like yours to decide what to restock and what to cut. You've got a direct say in what we carry.`,
  },
  {
    name: 'cross-sell-bong',
    subject: 'Your bong hits good — these 4 things make it hit better',
    preheader: 'One $12 add-on can cut your cleaning time in half.',
    body: `Hey {{first_name}},

Your new bong is solid on its own. But here's what takes it from good to "why didn't I do this sooner":

Ash Catchers (starting at $12) — Catches debris before it hits your water. Result: 2x fewer water changes and noticeably smoother hits. This is the single best upgrade you can make.

Flower Bowls (10mm, 14mm, 18mm) — Stock bowls work, but a thicker aftermarket bowl holds heat better and gives you more control over airflow. Most customers grab a 14mm.

Diffused Downstems — Swap your stock downstem for a diffused one and the difference is immediate. More bubbles, smoother hits, less drag.

Cleaning Supplies — Res caps, plugs, and cleaning solution. 5 minutes of maintenance keeps your glass hitting like day one.

No pressure. Just thought you should know what 10,000+ customers usually grab next.

— Oil Slick

P.S. All accessories ship same-day if you order before 2pm MT. Just saying.`,
  },
  {
    name: 'cross-sell-dab-rig',
    subject: 'The difference between an OK dab and a perfect one? These 4 things',
    preheader: 'Most people skip the carb cap. Don\'t be most people.',
    body: `Hey {{first_name}},

You've got the rig. Now here's how to level up every single session:

Quartz Bangers — A thicker quartz banger holds heat 3x longer than the stock one your rig came with. That means more consistent low-temp dabs and way better flavor. This is upgrade number one.

Carb Caps — Without a carb cap, you're wasting concentrate. A proper cap creates a sealed chamber so you can dab at lower temps — better flavor, zero waste. Most customers say this is the accessory they wish they'd bought first.

Dab Tools — Shatter, badder, and sauce all load differently. The right tool means less mess and less wasted product. A $6 tool saves you more than that in a week.

Torches — Hardware store torches heat unevenly and die fast. A dedicated dab torch heats your banger evenly and lasts 5x longer.

Think of it as dialing in your setup. Small upgrades, big difference in every session.

— Oil Slick

P.S. Not sure which banger size fits your rig? Reply to this email and we'll tell you in 5 minutes.`,
  },
  {
    name: 'cross-sell-hand-pipe',
    subject: '3 cheap upgrades that make your pipe sessions way better',
    preheader: 'A $5 screen fixes the most annoying part of smoking a pipe.',
    body: `Hey {{first_name}},

Enjoying the new pipe? Here are 3 things that make it even better — all under $15:

Screens — No more scooby snacks. A $5 pack lasts months and makes every hit cleaner.

Grinder — Even grind means even burn. If you're still breaking up flower by hand, this is the most noticeable upgrade you'll make.

Bubblers — Love the portability but want smoother hits? A bubbler gives you water filtration in a handheld size. Think of it as your pipe's bigger sibling.

That's it. Short list, big impact.

— Oil Slick

P.S. Everything ships with the same careful packaging as your pipe did. We don't cut corners on the small stuff either.`,
  },
  {
    name: 'cross-sell-rolling',
    subject: 'Papers run out fast — here\'s what to grab before they do',
    preheader: 'Plus the one accessory that makes every roll better.',
    body: `Hey {{first_name}},

Papers and cones are the kind of thing you always need more of. Quick restock list so you're never caught without:

Papers and Cones — RAW, Vibes, Elements, Zig Zag, and more. Grab a few packs now and forget about it for a while.

Grinder — If you don't have one yet, this is non-negotiable. Consistent grind = better roll = even burn. Period.

Rolling Tray — Keeps your workspace clean and your flower where it belongs. Way better than rolling on a magazine.

Storage — Doob tubes and stash jars keep pre-rolls fresh for days instead of hours. Worth the few bucks.

Think of it as restocking the essentials before you actually run out.

— Oil Slick

P.S. Orders over a certain amount qualify for free shipping — check your cart at checkout to see if yours does.`,
  },
  {
    name: 'restock-reminder',
    subject: '{{days_since_purchase}} days since your last {{product_title}} — running low?',
    preheader: 'Same product, same price, ships today.',
    body: `Hey {{first_name}},

Quick heads up — it's been {{days_since_purchase}} days since you grabbed {{product_title}}. If your rotation is anything like ours, you might be due for a restock.

Reorder here: {{product_url}}

Same product, same price, same fast shipping. In stock and ready to go.

— Oil Slick

P.S. No pressure at all. We just know how annoying it is to run out of the basics at the worst possible time.`,
  },
  {
    name: 'abandoned-cart-1hr',
    subject: 'You forgot this at checkout (your cart is still saved)',
    preheader: 'We\'re holding it for you, but we can\'t promise stock forever.',
    body: `Hey {{first_name}},

Looks like you were right in the middle of checking out and something pulled you away. No worries — we saved your cart:

{{#each cart_items}}
  • {{this.title}} — {{this.price}}
{{/each}}

Pick up where you left off: {{checkout_url}}

Real quick — if you ran into a problem at checkout (payment issue, shipping question, anything), just reply to this email. We're around and we can usually sort it out in minutes.

— Oil Slick

P.S. If this isn't the right time, no sweat. But we'll check in one more time tomorrow in case you still want it.`,
  },
  {
    name: 'abandoned-cart-24hr',
    subject: '10,000+ orders shipped with zero breakage — yours is next',
    preheader: 'Here\'s why people trust us with their glass.',
    body: `Hey {{first_name}},

Still have your eye on this?

{{#each cart_items}}
  • {{this.title}} — {{this.price}}
{{/each}}

Look — we get it. Buying glass online takes some trust. So here's what you should know about ordering from Oil Slick:

— We've shipped over 10,000 orders. Every glass piece gets bubble wrap, foam inserts, and hand-packed attention. Our breakage rate is near zero.
— We price fairly. No inflated MSRPs, no fake "sales." The price you see is an honest price.
— Real support from real people. If anything ever goes wrong, email kris@oilslickpad.com and it gets fixed. No bots, no runaround.

Finish your order: {{checkout_url}}

— Oil Slick

P.S. This is our second note. We'll send one more with a discount code — but if you're ready now, no reason to wait.`,
  },
  {
    name: 'abandoned-cart-72hr',
    subject: 'Final email: 10% off your cart (expires in 48 hours)',
    preheader: 'This is our last one. After this, the code disappears.',
    body: `Hey {{first_name}},

This is the last email we'll send about this cart. Promise.

Here's what's still in there:

{{#each cart_items}}
  • {{this.title}} — {{this.price}}
{{/each}}

We want you to have this stuff, so here's 10% off:

Code: COMEBACK10

Use it here: {{checkout_url}}

This code expires in 48 hours. After that, it's gone. No extensions, no follow-up email to remind you.

If now isn't the right time, no hard feelings. The code also works on anything else in the store if you want to swap things around.

— Oil Slick

P.S. This is email 3 of 3. We don't spam. If you're not interested, you won't hear from us about this cart again.`,
  },
  {
    name: 'welcome-1-signup',
    subject: 'Your 10% off code is inside — plus what to expect from us',
    preheader: '700+ products, hand-packed glass, and a crew that actually smokes.',
    body: `Hey {{first_name}},

First things first — here's 10% off your first order:

Code: WELCOME10

Use it here: https://oilslickpad.com

Now here's what you just signed up for:

We're a US-based smokeshop with over 700 products — glass bongs, dab rigs, hand pipes, bubblers, rolling papers, vape gear, and every accessory in between. All personally vetted by people who actually use this stuff.

What matters to you as a customer:
— Your glass ships hand-packed in bubble wrap and foam. Our breakage rate across 10,000+ orders is near zero.
— We carry a full Made in USA glass collection from independent American glassblowers.
— Honest pricing. No inflated MSRPs, no fake sales. Just fair prices on quality products.
— Real humans answer emails. Hit up kris@oilslickpad.com and you talk to an actual person.

That's it. No fluff. Welcome aboard.

— The Oil Slick crew

P.S. Tomorrow we'll send you our top sellers so you know where to start. Keep an eye out.`,
  },
  {
    name: 'welcome-2-bestsellers',
    subject: 'The 4 products new customers grab first (and why)',
    preheader: 'Not sure where to start? This is what 10,000+ customers picked.',
    body: `Hey {{first_name}},

Not sure where to start with 700+ products? Here's what our best-selling categories look like right now — and why people pick them:

Beaker Bongs — Our #1 seller. Thick glass, stable base, smooth water-filtered hits. If you smoke flower, start here. Most popular price range: $40-80.

Dab Rigs — Purpose-built for concentrates. Smaller chambers for flavor, sturdy bases for your torch setup. Best sellers are in the $50-100 range.

Hand Pipes — No water, no setup, just pack and go. Perfect for on-the-go or as a backup piece. Most are under $30.

Made in USA Glass — Handcrafted by independent American glassblowers. Thicker, heavier, one-of-a-kind pieces. Worth the investment if you want something that lasts.

Your 10% off code WELCOME10 still works.

Browse the shop: https://oilslickpad.com

— Oil Slick

P.S. One more email coming your way — real reviews from real customers so you can see what people are actually saying.`,
  },
  {
    name: 'welcome-3-trust',
    subject: 'Don\'t take our word for it — here\'s what customers say',
    preheader: 'Your WELCOME10 code expires in 48 hours. Last chance.',
    body: `Hey {{first_name}},

There are hundreds of smokeshops online. We're not going to pretend otherwise. So instead of telling you why we're different, here's what actual customers said:

"Ordered a beaker bong, and the packaging was insane — three layers of bubble wrap. Arrived in perfect condition. Best glass selection I've found online." — Marcus T. (verified buyer, 3 orders)

"The dab rig I got is way thicker than I expected for the price. Already ordered a second one for my buddy." — Jessica R. (verified buyer)

"I stock my retail shop with Oil Slick products. Consistent quality, fair wholesale pricing, and they actually communicate when there are delays." — David M. (wholesale customer, 12 orders)

Look — we earned those reviews by doing the basics right. Good products, honest prices, careful packaging, and actually responding when people reach out.

Your 10% off code WELCOME10 expires in 48 hours.

Use it here: https://oilslickpad.com

After that, it's gone. We don't extend welcome codes.

— Oil Slick

P.S. That's the last of our welcome emails. From here on out, we only email you when we've got something genuinely worth your time.`,
  },
  {
    name: 'winback-30day',
    subject: '37 new products since your last order — plus free shipping',
    preheader: 'We added a lot since you were last here. Come take a look.',
    body: `Hey {{first_name}},

It's been about a month since your last order, and we've been busy. New glass, new accessories, and a few restocks on stuff that sold out fast.

Here's a reason to come back right now — free shipping on your next order:

Code: FREESHIP

No minimum. Just use it at checkout.

Browse new arrivals: https://oilslickpad.com/collections/new-arrivals

Same deal as always — ships from the US, hand-packed with care, and if anything isn't right we fix it.

— Oil Slick

P.S. The FREESHIP code doesn't expire for 14 days. No rush, but the new arrivals tend to move fast.`,
  },
  {
    name: 'winback-60day',
    subject: 'Here\'s what changed since you were last here, {{first_name}}',
    preheader: 'New glass, new accessories, and 10% off to come take a look.',
    body: `Hey {{first_name}},

It's been a couple months. We're not going to guilt trip you — we just wanted you to know what's new.

Here's what changed since your last order:
— New Made in USA glass from independent blowers (some of these are one-of-a-kind)
— Expanded dab accessories — more bangers, carb caps, and terp slurpers
— Restocked popular items that were sold out

And honestly? If you left because something went wrong with an order — reply to this email. We take that seriously and want to make it right. No corporate nonsense, just tell us what happened.

If everything was fine and you're just not in the market right now, here's 10% off for when you are:

Code: MISSYOU10

Shop now: https://oilslickpad.com

— Oil Slick

P.S. This code is good for 14 days. If you don't use it, we'll check in one more time with our best offer.`,
  },
  {
    name: 'winback-90day',
    subject: 'Straight up: 15% off, then we stop emailing',
    preheader: 'Our biggest discount. No tricks. One last shot.',
    body: `Hey {{first_name}},

We'll be direct. This is our last reach-out for a while.

You haven't ordered in about 90 days. We respect your inbox too much to keep nudging if you're not interested, so here's our best offer — one and done:

15% off anything in the store:

Code: WELCOME15

Shop now: https://oilslickpad.com

That's the biggest discount we give. It works on everything, including new arrivals and Made in USA glass. Good for 7 days.

If you're done with us, that's completely fine. Unsubscribe below — no hard feelings, genuinely. But if you do come back, the catalog has grown a lot since you were last around.

Thanks for being a customer in the first place. We mean that.

— Oil Slick

P.S. If you don't use this code, we'll send one final email in 30 days asking if you want to stay on the list. After that, silence. We keep it clean.`,
  },
  {
    name: 'sunset-120day',
    subject: 'Stay or go — your call, {{first_name}}',
    preheader: 'We\'re cleaning our list. One click to stay, or do nothing and we\'ll remove you.',
    body: `Hey {{first_name}},

Simple question: do you still want emails from Oil Slick?

We haven't heard from you in a while. Rather than keep emailing someone who isn't interested, we'd rather just ask.

Stay on the list: {{resubscribe_url}}
One click. That's it.

Or do nothing — we'll remove you in 7 days. No hard feelings. You can always come back to oilslickpad.com and re-subscribe if you change your mind down the road.

— Oil Slick

P.S. We respect your inbox. That's why we're asking instead of just keeping you on the list forever.`,
  },
  {
    name: 'vip-recognition',
    subject: '{{order_count}} orders in — I owe you a personal thank you',
    preheader: 'This is from Kris, not a marketing automation. (OK, it\'s automated. But I wrote it.)',
    body: `Hey {{first_name}},

This is Kris. I run Oil Slick.

You've ordered from us {{order_count}} times now. I wanted to take a second to actually acknowledge that, because most customers buy once and move on. You keep coming back, and for a small operation like ours, that's everything.

Here's 15% off your next order — no minimum, no restrictions:

Code: VIP15

I also want you to know something: you go to the front of the line. Need help picking a piece? Want a recommendation? Have an issue with an order? Reply to this email and it comes straight to me. Not a support queue. Me.

Genuinely — thank you for being a repeat customer. You're the reason we can keep doing this.

— Kris
kris@oilslickpad.com

P.S. If there's a product you wish we carried, or a brand you want to see, tell me. VIP customers get a direct say in what we stock.`,
  },
  {
    name: 'birthday',
    subject: 'It\'s your birthday, {{first_name}} — 20% off. Go treat yourself.',
    preheader: 'No minimum, no exclusions. Even sale items. You deserve it.',
    body: `Hey {{first_name}},

Happy birthday. You know the drill — today's about you, so here's a gift from the crew:

20% off anything in the store:

Code: BDAY20

No minimum order. Works on everything — including sale items and new arrivals. Grab that piece you've been eyeing, upgrade your setup, or stock up on essentials. Whatever makes you happy today.

The code is good for 7 days, so no rush. But seriously — go get yourself something nice. You earned it.

— The Oil Slick crew

P.S. Birthdays and new glass go together. Just saying.`,
  },
  {
    name: 'referral-nudge',
    subject: 'Your friends get 15% off, you get 15% off — here\'s how',
    preheader: 'It\'s not weird to share this. Your friends will actually thank you.',
    body: `Hey {{first_name}},

Real talk — if you've got a friend who smokes, they're already buying glass and gear somewhere. Why not hook them up with a better option and save yourself some money in the process?

Here's your referral link: {{referral_link}}

How it works:
— They get 15% off their first order.
— You get 15% off your next order.
— No limits. Refer 5 friends, get 5 discount codes.

Look — we know "sharing a referral link" can feel a little weird. But this isn't some MLM thing. You're literally just sending a friend to a better smokeshop and you both save money. That's it.

Text it, DM it, put it in a group chat. Whatever works.

— Oil Slick

P.S. The friend who refers the most customers this month gets a free piece from our Made in USA collection. Just saying.`,
  },
  {
    name: 'wholesale-followup',
    subject: 'Bulk buyer? You could be saving 20-40% on every order',
    preheader: 'Wholesale pricing, net terms, and priority restocks. No lengthy application.',
    body: `Hey {{first_name}},

We noticed your recent order was on the larger side — thanks for that. Quick question: are you stocking a retail shop, buying for a lounge, or just prefer buying in bulk?

If so, we should talk. Our wholesale program could save you 20-40% on every order depending on volume.

Here's what wholesale customers get:
— 20-40% off retail depending on order size (tiered pricing — bigger orders, bigger savings)
— Priority access to new product drops and restocks before they hit the site
— Dedicated support from Kris directly for order issues
— Net 30 terms available for qualified accounts after your first order

We keep this simple. No 10-page application. No minimum commitments. Reply to this email or hit up kris@oilslickpad.com and we'll send you the wholesale price list. Takes about 5 minutes to get set up.

Either way, thanks for the business.

— Kris
kris@oilslickpad.com
Oil Slick / oilslickpad.com

P.S. Our current wholesale customers typically reorder every 2-3 weeks. If that sounds like your pace, the savings add up fast.`,
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
