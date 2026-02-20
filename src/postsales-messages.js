// =============================================================================
// Post-Sales Messaging System for Oil Slick (oilslickpad.com)
//
// Complete email + SMS automation templates for Shopify Email + Shopify Flow
// All marketing handled natively through Shopify — no third-party tools needed
// Brand voice: casual, knowledgeable, direct — like talking to someone
// who actually works at a smokeshop and gives a damn about your order
//
// Flows covered:
//   1. Order Confirmation
//   2. Shipping Confirmation
//   3. Delivery Follow-Up
//   4. Review Request
//   5. Post-Review Thank You
//   6. Cross-Sell / Complete Your Setup
//   7. Restock Reminder (consumables)
//   8. Abandoned Cart Recovery (3-part series)
//   9. Abandoned Browse
//  10. Win-Back / Lapsed Customer (3-part series)
//  11. Sunset / Final Win-Back
//  12. Welcome Series (new subscribers, 3-part)
//  13. VIP / Repeat Customer
//  14. Back in Stock Notification
//  15. Price Drop Alert
//  16. Birthday
//  17. Refer a Friend Nudge
//  18. Wholesale / B2B Follow-Up
// =============================================================================

const postSalesMessages = {

  // ===========================================================================
  // 1. ORDER CONFIRMATION
  //    Trigger: Immediately after checkout
  //    Goal: Reassure, set expectations, build excitement
  // ===========================================================================

  orderConfirmation: {
    email: {
      subject: 'Got it — your order #{{order_number}} is locked in',
      preheader: 'We are packing your stuff right now.',
      body: `
Hey {{first_name}},

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
kris@oilslickpad.com
      `,
    },
    sms: {
      message: `Oil Slick: Order #{{order_number}} confirmed! We are packing your order now. Tracking info coming soon. Questions? Reply here or email kris@oilslickpad.com`,
    },
  },

  // ===========================================================================
  // 2. SHIPPING CONFIRMATION
  //    Trigger: When fulfillment is created / tracking number added
  //    Goal: Provide tracking, keep excitement going
  // ===========================================================================

  shippingConfirmation: {
    email: {
      subject: 'Your order just shipped — tracking inside',
      preheader: 'Your glass is on the move.',
      body: `
Hey {{first_name}},

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

— Oil Slick
      `,
    },
    sms: {
      message: `Oil Slick: Your order #{{order_number}} just shipped! Track it here: {{tracking_url}} — Enjoy your new gear!`,
    },
  },

  // ===========================================================================
  // 3. DELIVERY FOLLOW-UP
  //    Trigger: 2 days after delivery confirmation
  //    Goal: Check satisfaction, open door for support, plant review seed
  // ===========================================================================

  deliveryFollowUp: {
    email: {
      subject: 'Everything land in one piece?',
      preheader: 'Just checking in on your order.',
      body: `
Hey {{first_name}},

Your order should have arrived by now so just wanted to check — did everything show up in good shape?

If something got damaged in transit or is not what you expected, do not stress about it. Just shoot us an email at kris@oilslickpad.com with a photo and your order number and we will sort it out. We stand behind what we sell.

If everything is good and you are already putting your new piece to work — that is what we like to hear.

In a few days we will send you a quick link to leave a review. Those reviews genuinely help other people figure out what to buy, and they help us keep stocking the stuff that actually works.

Thanks again for the order.

— The Oil Slick crew
      `,
    },
  },

  // ===========================================================================
  // 4. REVIEW REQUEST
  //    Trigger: 7 days after delivery
  //    Goal: Get authentic product reviews, social proof
  // ===========================================================================

  reviewRequest: {
    email: {
      subject: 'Quick favor — how is the {{product_title}} working out?',
      preheader: '30 seconds, no fluff — just tell us what you think.',
      body: `
Hey {{first_name}},

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

— Oil Slick
      `,
    },
    sms: {
      message: `Hey {{first_name}}, how is your {{product_title}} working out? We'd really appreciate a quick review — takes 30 seconds: {{review_url}} — Oil Slick`,
    },
  },

  // ===========================================================================
  // 5. POST-REVIEW THANK YOU
  //    Trigger: After a customer submits a review
  //    Goal: Reinforce the behavior, offer a small incentive for next order
  // ===========================================================================

  postReviewThankYou: {
    email: {
      subject: 'Thanks for the review — here is something for your next order',
      preheader: 'We read every single one of these.',
      body: `
Hey {{first_name}},

We just saw your review come through and wanted to say thanks. We read every single one and they honestly help us decide what to keep stocking and what to drop.

As a thank you, here is 10% off your next order:

Code: THANKS10
Expires: {{expiry_date_30days}}

No minimum, works on anything in the store. Use it whenever you are ready.

— Oil Slick
      `,
    },
  },

  // ===========================================================================
  // 6. CROSS-SELL / COMPLETE YOUR SETUP
  //    Trigger: 14 days after delivery
  //    Goal: Suggest complementary products based on purchase category
  //    Dynamic blocks based on product tags/families
  // ===========================================================================

  crossSell: {
    // Variant A: Customer bought a bong
    bongBuyer: {
      email: {
        subject: 'A few things that go great with your new bong',
        preheader: 'Bowls, ash catchers, and stuff you will actually use.',
        body: `
Hey {{first_name}},

Now that you have had some time with your new bong, here are a few accessories that pair well with it:

Flower Bowls — If you want to switch up bowl sizes or replace a stock bowl with something nicer, we have a full selection in 10mm, 14mm, and 18mm.
{{link_to_collection_flower_bowls}}

Ash Catchers — Keeps your bong water cleaner for longer and adds an extra layer of filtration. Once you use one, you will wonder why you waited.
{{link_to_collection_ash_catchers}}

Cleaning Supplies — Res caps, isopropyl-safe plugs, and cleaning solutions to keep your glass looking new.
{{link_to_collection_cleaning_supplies}}

Downstems — A good diffused downstem can completely change how your bong hits. Worth trying if you are still using the stock one.
{{link_to_collection_downstems}}

No pressure — just thought you should know what is out there.

— Oil Slick
        `,
      },
    },

    // Variant B: Customer bought a dab rig
    dabRigBuyer: {
      email: {
        subject: 'Dial in your dab setup — a few essentials',
        preheader: 'Bangers, carb caps, and tools to level up your sessions.',
        body: `
Hey {{first_name}},

Got your dab rig set up? Here are a few things that can take your sessions from good to great:

Quartz Bangers — If your rig came with a basic banger, upgrading to a thicker quartz banger makes a real difference in heat retention and flavor.
{{link_to_collection_quartz_bangers}}

Carb Caps — A proper carb cap lets you dab at lower temps, which means better flavor and less waste. It is one of those things that seems optional until you try it.
{{link_to_collection_carb_caps}}

Dab Tools — Having the right tool for the consistency you are working with (shatter vs. badder vs. sauce) makes loading way easier.
{{link_to_collection_dab_tools}}

Torches — If you are using a cheap torch from the hardware store, a proper dab torch heats more evenly and lasts longer.
{{link_to_collection_torches}}

Just some ideas. No rush.

— Oil Slick
        `,
      },
    },

    // Variant C: Customer bought a hand pipe
    handPipeBuyer: {
      email: {
        subject: 'A couple things to go with your new pipe',
        preheader: 'Grinders, screens, and a few upgrades worth checking out.',
        body: `
Hey {{first_name}},

Enjoying the new pipe? Here are a couple things that make the experience even better:

Grinders — If you are still breaking up flower by hand, a decent grinder is a game changer. Even grind means even burn.
{{link_to_collection_grinders}}

Screens — Keeps ash and scooby snacks out of your mouth. Small thing that makes a big difference.
{{link_to_collection_screens}}

Bubblers — If you like the portability of a hand pipe but want smoother hits, a bubbler adds water filtration in a handheld package.
{{link_to_collection_bubblers}}

Cleaning Supplies — A little isopropyl and salt go a long way, but our cleaning kits make it even easier.
{{link_to_collection_cleaning_supplies}}

— Oil Slick
        `,
      },
    },

    // Variant D: Customer bought rolling papers or cones
    rollingBuyer: {
      email: {
        subject: 'Restock your rolling setup?',
        preheader: 'Trays, grinders, and fresh papers when you need them.',
        body: `
Hey {{first_name}},

Papers and cones go fast, so just a heads up — here is what pairs well with your rolling setup:

Rolling Trays — Keeps your workspace clean and makes rolling way easier. We carry a bunch of styles and sizes.
{{link_to_collection_rolling_trays}}

Grinders — Consistent grind makes for a better roll. Period. If you do not have one yet, it is worth the few bucks.
{{link_to_collection_grinders}}

More Papers and Cones — When you are ready to restock, we carry RAW, Vibes, Elements, Zig Zag, and more.
{{link_to_collection_rolling_papers}}

Storage — Doob tubes, stash jars, and containers to keep your pre-rolls fresh.
{{link_to_collection_storage}}

— Oil Slick
        `,
      },
    },

    // Variant E: Generic fallback for any product type
    generic: {
      email: {
        subject: 'Some stuff you might actually want',
        preheader: 'Based on your last order — no spam, just relevant gear.',
        body: `
Hey {{first_name}},

You shopped with us recently and we thought you might want to see a few things that go with what you bought:

{{recommended_products_block}}

All of these ship from the US with the same careful packaging we used on your last order. Free shipping on qualifying orders.

If none of this is your thing, no worries. We will not keep bugging you.

— Oil Slick
        `,
      },
    },
  },

  // ===========================================================================
  // 7. RESTOCK REMINDER
  //    Trigger: 30/60 days after purchase of consumable items
  //    Applies to: Rolling papers, cones, cleaning supplies, screens, torches
  //    Goal: Catch them before they run out
  // ===========================================================================

  restockReminder: {
    email: {
      subject: 'Running low on {{product_title}}?',
      preheader: 'Figured you might be due for a restock.',
      body: `
Hey {{first_name}},

It has been about {{days_since_purchase}} days since you grabbed {{product_title}} and depending on how heavy your rotation is, you might be getting close to running low.

Reorder here: {{product_url}}

Same product, same price, same fast shipping. We keep these stocked so you should not run into any out-of-stock issues.

If you want to try something different this time around, here are a few similar options:

{{related_products_block}}

— Oil Slick
      `,
    },
    sms: {
      message: `Hey {{first_name}}, running low on {{product_title}}? Reorder the same thing here: {{product_url}} — Oil Slick`,
    },
  },

  // ===========================================================================
  // 8. ABANDONED CART RECOVERY (3-part series)
  //    Trigger: Cart created but checkout not completed
  //    Goal: Recover the sale without being annoying
  // ===========================================================================

  abandonedCart: {
    // Part 1: 1 hour after abandonment
    reminder1: {
      email: {
        subject: 'You left something in your cart',
        preheader: 'Your cart is still saved — just a heads up.',
        body: `
Hey {{first_name}},

Looks like you started checking out but did not finish. No worries — your cart is saved and ready whenever you are.

Here is what you left behind:

{{#each cart_items}}
  • {{this.title}} — {{this.price}}
{{/each}}

Pick up where you left off: {{checkout_url}}

If you ran into an issue with the checkout or had a question about something, hit reply and let us know. We are around.

— Oil Slick
        `,
      },
      sms: {
        message: `Hey {{first_name}}, you left some stuff in your cart at Oil Slick. It is still saved — finish checkout here: {{checkout_url}}`,
      },
    },

    // Part 2: 24 hours after abandonment
    reminder2: {
      email: {
        subject: 'Still thinking it over?',
        preheader: 'Your cart is waiting. Here is why people like this stuff.',
        body: `
Hey {{first_name}},

Just one more nudge — your cart at Oil Slick still has:

{{#each cart_items}}
  • {{this.title}} — {{this.price}}
{{/each}}

A few things that might help you decide:

— Every glass piece ships with extra bubble wrap and foam padding. We have not had a breakage complaint in months.
— Free shipping on qualifying orders. Check if yours qualifies at checkout.
— If you are comparing prices, we keep ours competitive. We would rather earn a customer for life than squeeze you on one order.

Finish your order: {{checkout_url}}

If the price is the holdup, reply to this email and we might be able to work something out.

— Oil Slick
        `,
      },
    },

    // Part 3: 72 hours after abandonment (final push with incentive)
    reminder3: {
      email: {
        subject: 'Last call — 10% off to seal the deal',
        preheader: 'We threw in a discount code. Your cart is still waiting.',
        body: `
Hey {{first_name}},

This is the last time we will bug you about this. Your cart still has:

{{#each cart_items}}
  • {{this.title}} — {{this.price}}
{{/each}}

We want you to have this stuff, so here is 10% off your order:

Code: COMEBACK10
Expires: {{expiry_date_7days}}

Use it here: {{checkout_url}}

After this, we will leave you alone about this cart. But the code is good on anything in the store for the next 7 days if you want to shop around.

— Oil Slick
        `,
      },
      sms: {
        message: `Last chance, {{first_name}} — use code COMEBACK10 for 10% off your cart at Oil Slick. Expires in 7 days: {{checkout_url}}`,
      },
    },
  },

  // ===========================================================================
  // 9. ABANDONED BROWSE
  //    Trigger: 24 hours after viewing product(s) without adding to cart
  //    Goal: Soft reminder, low pressure
  // ===========================================================================

  abandonedBrowse: {
    email: {
      subject: 'Still looking at {{browsed_product_title}}?',
      preheader: 'You were checking this out — thought we would follow up.',
      body: `
Hey {{first_name}},

We noticed you were looking at {{browsed_product_title}} yesterday but did not pull the trigger. Totally fine — just wanted to make sure you saw everything you needed to.

Take another look: {{browsed_product_url}}

If you had questions about sizing, joint compatibility, materials, or anything else, reply to this email and we will get you sorted. We actually know this stuff and are happy to help you pick the right piece.

If you were browsing other options too, here are a few similar products:

{{related_products_block}}

— Oil Slick
      `,
    },
  },

  // ===========================================================================
  // 10. WIN-BACK / LAPSED CUSTOMER (3-part series)
  //     Trigger: No purchase in 30 / 60 / 90 days
  //     Goal: Re-engage without desperation
  // ===========================================================================

  winBack: {
    // Part 1: 30 days since last purchase
    gentle: {
      email: {
        subject: 'Been a minute — here is what is new',
        preheader: 'New glass, new accessories, same fast shipping.',
        body: `
Hey {{first_name}},

It has been about a month since your last order and we have gotten some new stuff in since then. Figured you might want to take a look.

What is new:
{{new_products_block}}

Best sellers right now:
{{bestseller_products_block}}

Same deal as always — ships from the US, packed with care, and if anything is not right we make it right.

Browse new arrivals: {{new_arrivals_url}}

— Oil Slick
        `,
      },
    },

    // Part 2: 60 days since last purchase
    nudge: {
      email: {
        subject: 'We miss your orders, {{first_name}}',
        preheader: 'Straight up — we have got stuff you will like.',
        body: `
Hey {{first_name}},

It has been a couple months since you ordered from us. No guilt trip — just wanted to make sure you know we are still here and still stocking good glass at fair prices.

Since your last visit we have added:
— New Made in USA glass pieces from independent blowers
— Expanded our dab accessories with more banger and carb cap options
— Restocked popular items that were sold out

Here is 10% off if something catches your eye:

Code: MISSYOU10
Expires: {{expiry_date_14days}}

Shop now: {{store_url}}

And if you left us because something went wrong with an order, reply to this email. We take that stuff seriously and want to make it right.

— Oil Slick
        `,
      },
    },

    // Part 3: 90 days since last purchase
    lastChance: {
      email: {
        subject: 'One more try before we stop emailing you',
        preheader: '15% off and then we will back off.',
        body: `
Hey {{first_name}},

We do not want to be that store that spams your inbox, so this is our last reach-out for a while.

If you are still into glass and smoking gear, we would love to keep you as a customer. Here is our best offer:

15% off anything in the store:

Code: WELCOME15
Expires: {{expiry_date_14days}}

Shop now: {{store_url}}

If you are not interested anymore, that is completely fine. You can unsubscribe below and we will not take it personally.

But if you DO come back, we think you will notice that we have expanded the catalog quite a bit since you were last around.

Thanks for being a customer in the first place.

— Oil Slick
        `,
      },
      sms: {
        message: `{{first_name}}, it's been a while. Here's 15% off anything at Oil Slick — code WELCOME15. Expires in 14 days: {{store_url}}`,
      },
    },
  },

  // ===========================================================================
  // 11. SUNSET / FINAL WIN-BACK
  //     Trigger: 120+ days inactive, about to be removed from active list
  //     Goal: Clean the list or get a final conversion
  // ===========================================================================

  sunsetFlow: {
    email: {
      subject: 'Should we keep sending you emails?',
      preheader: 'Honest question — we only want to email people who want to hear from us.',
      body: `
Hey {{first_name}},

Quick question — do you still want to hear from us?

We have not seen you around in a while and we do not want to clog your inbox with emails you are not reading. We would rather have a smaller list of people who actually care than blast thousands of people who do not.

If you want to stay on the list:
Click here and you are all set: {{resubscribe_url}}

If you are done:
No need to do anything. We will remove you from our email list in 7 days. You can always come back to oilslickpad.com and sign up again if you change your mind.

No hard feelings either way.

— Oil Slick
      `,
    },
  },

  // ===========================================================================
  // 12. WELCOME SERIES (new subscribers, 3-part)
  //     Trigger: Email signup (NOT tied to a purchase)
  //     Goal: Introduce the brand, build trust, get first purchase
  // ===========================================================================

  welcomeSeries: {
    // Part 1: Immediately after signup
    welcome: {
      email: {
        subject: 'Welcome to Oil Slick — here is what we are about',
        preheader: 'Glass, rigs, pipes, and gear from people who actually smoke.',
        body: `
Hey {{first_name}},

Thanks for signing up. Here is the short version of who we are:

We are an online smokeshop based in the US. We sell glass bongs, dab rigs, hand pipes, bubblers, rolling papers, vape gear, and all the accessories that go with them. Over 700 products from brands and glassblowers we have personally vetted.

A few things that set us apart:
— We pack every glass piece by hand with bubble wrap and foam. Breakage is basically nonexistent.
— We carry a full Made in USA glass collection from independent American glassblowers.
— Our prices are fair. We are not the cheapest and we are not trying to be, but you are getting quality glass at honest prices.
— Real people answer emails. If you have a question or a problem, email kris@oilslickpad.com and you will get an actual answer.

To get you started, here is 10% off your first order:

Code: WELCOME10
Expires: {{expiry_date_30days}}

Browse the shop: {{store_url}}

— The Oil Slick crew
        `,
      },
      sms: {
        message: `Welcome to Oil Slick! Here's 10% off your first order — code WELCOME10. Browse 700+ products: {{store_url}}`,
      },
    },

    // Part 2: 3 days after signup (if no purchase yet)
    bestSellers: {
      email: {
        subject: 'Our most popular stuff right now',
        preheader: 'What everyone else is buying this month.',
        body: `
Hey {{first_name}},

Not sure where to start? Here is what is selling the most right now:

{{bestseller_products_block}}

Most people start with one of these categories:

Bongs — For flower smokers who want smooth, water-filtered hits.
{{link_to_collection_bongs}}

Dab Rigs — Built specifically for concentrates and extracts.
{{link_to_collection_dab_rigs}}

Hand Pipes — Simple, portable, no setup required.
{{link_to_collection_hand_pipes}}

Made in USA Glass — Handcrafted pieces from American glassblowers.
{{link_to_collection_usa_glass}}

Your 10% off code WELCOME10 is still active if you want to use it.

— Oil Slick
        `,
      },
    },

    // Part 3: 7 days after signup (if no purchase yet)
    trustBuilder: {
      email: {
        subject: 'Why people keep coming back to Oil Slick',
        preheader: 'Real reviews from real customers.',
        body: `
Hey {{first_name}},

We are not going to pretend we are the only smokeshop on the internet. There are hundreds. So here is why people choose us and keep coming back:

"Best glass selection online. Ordered a beaker bong and it arrived in perfect condition. Packaging was insane — like three layers of bubble wrap." — Marcus T.

"Fast shipping and the dab rig I got is way thicker than I expected for the price. Already ordered a second one for my buddy." — Jessica R.

"I stock my shop with Oil Slick products. Consistent quality, good margins, and they actually communicate when there are delays." — David M.

We have earned those reviews by doing the basics right: good products, honest prices, careful packaging, and responding when people reach out.

Your 10% off code WELCOME10 expires in {{days_until_expiry}} days.

Use it here: {{store_url}}

After this, we will stop asking and just send you the occasional update when we get new products or run a sale. No spam.

— Oil Slick
        `,
      },
    },
  },

  // ===========================================================================
  // 13. VIP / REPEAT CUSTOMER
  //     Trigger: 3rd purchase or $200+ lifetime spend
  //     Goal: Reward loyalty, make them feel valued (without a points program)
  // ===========================================================================

  vipRecognition: {
    email: {
      subject: 'You are one of our best customers — this is for you',
      preheader: 'Not a marketing gimmick. Genuine thank you.',
      body: `
Hey {{first_name}},

Real talk — you have ordered from us {{order_count}} times now and we wanted to acknowledge that. Most people buy once and move on, but you keep coming back. That means a lot to a small operation like ours.

So here is something just for repeat customers:

15% off your next order, no minimum, no restrictions:

Code: VIP15
Expires: {{expiry_date_60days}}

We also want you to know that if you ever need help picking out a piece, want a recommendation, or need to sort out an issue with an order — you go to the front of the line. Just reply to this email.

Thanks for being a real one.

— Kris and the Oil Slick crew
      `,
    },
    sms: {
      message: `{{first_name}}, you're one of our top customers. Here's an exclusive 15% off — code VIP15 — good for 60 days. Thanks for sticking with us. — Oil Slick`,
    },
  },

  // ===========================================================================
  // 14. BACK IN STOCK NOTIFICATION
  //     Trigger: Product restocked that customer requested notification for
  //     Goal: Convert immediately — these are high-intent
  // ===========================================================================

  backInStock: {
    email: {
      subject: '{{product_title}} is back in stock',
      preheader: 'You asked us to let you know. Here it is.',
      body: `
Hey {{first_name}},

Remember that {{product_title}} you were looking at? It is back in stock.

Grab it here: {{product_url}}

Fair warning — this one sold out last time and we do not know when we will get more after this batch. If you want it, do not wait on it.

— Oil Slick
      `,
    },
    sms: {
      message: `{{first_name}}, {{product_title}} is BACK in stock at Oil Slick. It sold out before — grab it now: {{product_url}}`,
    },
  },

  // ===========================================================================
  // 15. PRICE DROP ALERT
  //     Trigger: Product in wishlist or browse history drops in price
  //     Goal: Convert browsers who were price-sensitive
  // ===========================================================================

  priceDrop: {
    email: {
      subject: 'Price drop on something you were eyeing',
      preheader: '{{product_title}} just got cheaper.',
      body: `
Hey {{first_name}},

Good timing — {{product_title}} just dropped in price.

Was: {{original_price}}
Now: {{current_price}}

Check it out: {{product_url}}

We do not do fake markups or inflated "compare at" prices. When we drop a price, it is a real drop. This could be a limited thing depending on inventory, so if you were on the fence before, now is a good time.

— Oil Slick
      `,
    },
    sms: {
      message: `{{first_name}}, {{product_title}} just dropped from {{original_price}} to {{current_price}}. Real price cut, not a gimmick: {{product_url}} — Oil Slick`,
    },
  },

  // ===========================================================================
  // 16. BIRTHDAY
  //     Trigger: Customer's birthday (if collected)
  //     Goal: Personal touch, drive a purchase with a gift
  // ===========================================================================

  birthday: {
    email: {
      subject: 'Happy birthday, {{first_name}} — this one is on us',
      preheader: 'Birthday discount inside. Treat yourself.',
      body: `
Hey {{first_name}},

Happy birthday. We are not going to write you a long sappy email — just wanted to drop off a gift:

20% off anything in the store:

Code: BDAY20
Expires: {{expiry_date_14days}}

No minimum order. Works on everything including sale items. Go get yourself something nice.

— Oil Slick
      `,
    },
    sms: {
      message: `Happy birthday {{first_name}}! Here's 20% off anything at Oil Slick — code BDAY20. Treat yourself: {{store_url}}`,
    },
  },

  // ===========================================================================
  // 17. REFER A FRIEND NUDGE
  //     Trigger: 30 days after first purchase (satisfied customer window)
  //     Goal: Word-of-mouth growth
  // ===========================================================================

  referral: {
    email: {
      subject: 'Know someone who would dig our stuff?',
      preheader: 'You both get a discount. Pretty simple.',
      body: `
Hey {{first_name}},

If you have got a friend who is into glass or smoking gear, we have got a deal that works for both of you:

Send them your referral link: {{referral_link}}

When they make their first purchase, they get 15% off. And you get 15% off your next order. Everybody wins.

No catch. No limits on how many people you refer. Every time someone uses your link, you get another 15% code.

It is the easiest way to hook up your friends and save yourself some money at the same time.

— Oil Slick
      `,
    },
  },

  // ===========================================================================
  // 18. WHOLESALE / B2B FOLLOW-UP
  //     Trigger: Customer places a large order or is tagged as wholesale
  //     Goal: Build the B2B relationship, introduce wholesale program
  // ===========================================================================

  wholesaleFollowUp: {
    email: {
      subject: 'Thanks for the bulk order — quick note about wholesale pricing',
      preheader: 'If you are buying for a shop, we should talk.',
      body: `
Hey {{first_name}},

We noticed your recent order was on the larger side and wanted to reach out. If you are stocking a retail shop, buying for a lounge, or just like to buy in bulk for any reason — we have wholesale pricing that could save you a good amount on future orders.

What our wholesale customers get:
— Tiered discounts based on order volume
— Priority on new product drops and restocks
— Dedicated support line for order issues
— Net terms available for qualified accounts

If any of this sounds useful, reply to this email or reach out to kris@oilslickpad.com and we will get you set up. No lengthy application or minimum commitments — we keep it simple.

Either way, thanks for the business. We appreciate big orders just as much as small ones.

— Kris
Oil Slick / oilslickpad.com
      `,
    },
  },
};


// =============================================================================
// FLOW CONFIGURATION
// Defines timing, triggers, and conditions for each message
// Designed for Shopify Email + Shopify Flow (fully native, no third-party apps)
// =============================================================================

const flowConfig = {

  orderConfirmation: {
    trigger: 'order_created',
    delay: '0m',
    channels: ['email', 'sms'],
    conditions: [],
  },

  shippingConfirmation: {
    trigger: 'fulfillment_created',
    delay: '0m',
    channels: ['email', 'sms'],
    conditions: [],
  },

  deliveryFollowUp: {
    trigger: 'fulfillment_delivered',
    delay: '2d',
    channels: ['email'],
    conditions: [],
  },

  reviewRequest: {
    trigger: 'fulfillment_delivered',
    delay: '7d',
    channels: ['email', 'sms'],
    conditions: [
      'customer_has_not_reviewed_product',
    ],
  },

  postReviewThankYou: {
    trigger: 'review_submitted',
    delay: '1h',
    channels: ['email'],
    conditions: [],
  },

  crossSell: {
    trigger: 'fulfillment_delivered',
    delay: '14d',
    channels: ['email'],
    conditions: [
      'customer_has_not_purchased_since',
    ],
    variants: {
      bongBuyer: {
        condition: 'product_tags_contain:glass-bong OR product_type:bong',
      },
      dabRigBuyer: {
        condition: 'product_tags_contain:glass-rig OR product_tags_contain:silicone-rig OR product_type:dab-rig',
      },
      handPipeBuyer: {
        condition: 'product_tags_contain:spoon-pipe OR product_type:hand-pipe',
      },
      rollingBuyer: {
        condition: 'product_tags_contain:rolling-paper OR product_type:rolling',
      },
      generic: {
        condition: 'default_fallback',
      },
    },
  },

  restockReminder: {
    trigger: 'order_fulfilled',
    delay: '45d',
    channels: ['email', 'sms'],
    conditions: [
      'product_is_consumable',
      'customer_has_not_repurchased_product',
    ],
    consumableProductTypes: [
      'rolling-paper',
      'rolling-tray',
      'cleaning-supply',
      'screen',
      'torch',
      'lighter',
    ],
  },

  abandonedCart: {
    reminder1: {
      trigger: 'checkout_abandoned',
      delay: '1h',
      channels: ['email', 'sms'],
    },
    reminder2: {
      trigger: 'checkout_abandoned',
      delay: '24h',
      channels: ['email'],
      conditions: ['cart_still_abandoned'],
    },
    reminder3: {
      trigger: 'checkout_abandoned',
      delay: '72h',
      channels: ['email', 'sms'],
      conditions: ['cart_still_abandoned'],
    },
  },

  abandonedBrowse: {
    trigger: 'product_viewed_no_cart',
    delay: '24h',
    channels: ['email'],
    conditions: [
      'customer_identified',
      'no_cart_created_since_browse',
    ],
  },

  winBack: {
    gentle: {
      trigger: 'days_since_last_order',
      delay: '30d',
      channels: ['email'],
    },
    nudge: {
      trigger: 'days_since_last_order',
      delay: '60d',
      channels: ['email'],
      conditions: ['no_purchase_since_gentle'],
    },
    lastChance: {
      trigger: 'days_since_last_order',
      delay: '90d',
      channels: ['email', 'sms'],
      conditions: ['no_purchase_since_nudge'],
    },
  },

  sunsetFlow: {
    trigger: 'days_since_last_order',
    delay: '120d',
    channels: ['email'],
    conditions: [
      'no_email_engagement_30d',
      'no_purchase_since_winback',
    ],
    action_on_no_response: 'remove_from_active_list_after_7d',
  },

  welcomeSeries: {
    welcome: {
      trigger: 'email_subscribed',
      delay: '0m',
      channels: ['email', 'sms'],
      conditions: ['not_existing_customer'],
    },
    bestSellers: {
      trigger: 'email_subscribed',
      delay: '3d',
      channels: ['email'],
      conditions: ['no_purchase_since_signup'],
    },
    trustBuilder: {
      trigger: 'email_subscribed',
      delay: '7d',
      channels: ['email'],
      conditions: ['no_purchase_since_signup'],
    },
  },

  vipRecognition: {
    trigger: 'order_created',
    delay: '1d',
    channels: ['email', 'sms'],
    conditions: [
      'order_count_gte:3 OR lifetime_spend_gte:200',
      'has_not_received_vip_in_90d',
    ],
  },

  backInStock: {
    trigger: 'product_restocked',
    delay: '0m',
    channels: ['email', 'sms'],
    conditions: ['customer_requested_notification'],
  },

  priceDrop: {
    trigger: 'product_price_decreased',
    delay: '1h',
    channels: ['email', 'sms'],
    conditions: [
      'customer_browsed_or_wishlisted_product',
      'price_drop_gte_10_percent',
    ],
  },

  birthday: {
    trigger: 'customer_birthday',
    delay: '0m',
    channels: ['email', 'sms'],
    conditions: ['birthday_data_available'],
  },

  referral: {
    trigger: 'first_order_fulfilled',
    delay: '30d',
    channels: ['email'],
    conditions: ['customer_has_not_been_sent_referral'],
  },

  wholesaleFollowUp: {
    trigger: 'order_created',
    delay: '1d',
    channels: ['email'],
    conditions: [
      'order_total_gte:500 OR customer_tagged:wholesale',
    ],
  },
};


// =============================================================================
// DISCOUNT CODE REFERENCE
// All codes used across messages — manage in Shopify Admin > Discounts
// =============================================================================

const discountCodes = {
  THANKS10: {
    description: 'Post-review thank you',
    discount: '10%',
    usage: 'single_use_per_customer',
    autoGenerate: true,
    validDays: 30,
  },
  COMEBACK10: {
    description: 'Abandoned cart recovery (72h email)',
    discount: '10%',
    usage: 'single_use_per_customer',
    autoGenerate: true,
    validDays: 7,
  },
  WELCOME10: {
    description: 'New subscriber welcome series',
    discount: '10%',
    usage: 'single_use_per_customer',
    autoGenerate: false,
    validDays: 30,
  },
  MISSYOU10: {
    description: 'Win-back 60-day nudge',
    discount: '10%',
    usage: 'single_use_per_customer',
    autoGenerate: true,
    validDays: 14,
  },
  WELCOME15: {
    description: 'Win-back 90-day last chance',
    discount: '15%',
    usage: 'single_use_per_customer',
    autoGenerate: true,
    validDays: 14,
  },
  VIP15: {
    description: 'VIP repeat customer reward',
    discount: '15%',
    usage: 'single_use_per_customer',
    autoGenerate: true,
    validDays: 60,
  },
  BDAY20: {
    description: 'Birthday discount',
    discount: '20%',
    usage: 'single_use_per_customer',
    autoGenerate: true,
    validDays: 14,
    includesSaleItems: true,
  },
};


// =============================================================================
// SMS COMPLIANCE NOTES
// =============================================================================

const smsCompliance = {
  notes: [
    'All SMS messages must include store name (Oil Slick) for identification',
    'All SMS must have opt-out language on first message in a flow: "Reply STOP to unsubscribe"',
    'Keep SMS under 160 characters where possible to avoid splitting',
    'SMS should only be sent to customers who have explicitly opted in',
    'Do not send SMS between 9pm and 9am in the customer timezone',
    'Frequency cap: max 8 SMS per customer per month across all flows',
    'Transactional messages (order confirm, shipping) are exempt from marketing consent but still need general SMS consent',
  ],
};


// =============================================================================
// SHOPIFY INBOX CHAT WIDGET
// Updated greeting message for the Shopify Inbox live chat integration
// =============================================================================

const chatWidgetConfig = {
  blockId: '44704aa2-794f-4c5d-8c8e-039c841158e9',
  greeting_message: 'Hey there — got a question about a product, your order, or anything else? Drop us a message. We usually reply within a few hours during business hours.',
  position: 'bottom-right',
  buttonStyle: 'no_text',
};


export {
  postSalesMessages,
  flowConfig,
  discountCodes,
  smsCompliance,
  chatWidgetConfig,
};
