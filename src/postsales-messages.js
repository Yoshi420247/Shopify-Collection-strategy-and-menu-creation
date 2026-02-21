// =============================================================================
// Post-Sales Messaging System for Oil Slick (oilslickpad.com)
//
// Complete email + SMS automation templates for Shopify Email + Shopify Flow
// All marketing handled natively through Shopify — no third-party tools needed
// Brand voice: casual, knowledgeable, direct — like talking to someone
// who actually works at a smokeshop and gives a damn about your order
//
// Copywriting framework: Drew Sanocki / Chase Dimond / Ezra Firestone
// - Curiosity-gap subject lines + contrasting preheaders
// - P.S. on every email (second most-read element)
// - Open loops between series emails
// - Bucket brigade transitions for scroll momentum
// - Benefit-first product descriptions with specific numbers
// - Short paragraphs, mobile-first scanning
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
      subject: "It's happening — order #{{order_number}} is locked in",
      preheader: "We're already packing it. Here's what comes next.",
      body: `
{{first_name}}, you just made a great call.

Your order is confirmed and we're on it right now.

Here's what you grabbed:

{{#each line_items}}
  • {{this.title}} (x{{this.quantity}}) — {{this.price}}
{{/each}}

Order total: {{total_price}}

Now for the good part.

Most orders ship same-day if placed before 2pm MT. You'll get a tracking number the second it leaves our hands.

Every glass piece gets wrapped in bubble wrap and foam by hand — we've shipped 10,000+ orders since 2012 and breakage complaints are basically zero.

What to expect:
— Shipping: 3-5 business days after it leaves our warehouse.
— Your tracking link: coming via email as soon as we hand it off.
— Questions? Reply to this email. A real person reads these — no bots, no ticket numbers.

Tomorrow we'll send your tracking info so you can follow it live.

— Kris and the Oil Slick crew
kris@oilslickpad.com

P.S. If you want to add anything to your order before we ship, reply in the next 2 hours and we'll try to combine it.
      `,
    },
    sms: {
      message: `Oil Slick: Order #{{order_number}} confirmed! Packing it now. Tracking coming soon. Questions? Reply or email kris@oilslickpad.com`,
    },
  },

  // ===========================================================================
  // 2. SHIPPING CONFIRMATION
  //    Trigger: When fulfillment is created / tracking number added
  //    Goal: Provide tracking, keep excitement going
  // ===========================================================================

  shippingConfirmation: {
    email: {
      subject: "It's on the way (track it live)",
      preheader: 'Your order just left the building. Tracking link inside.',
      body: `
{{first_name}}, your order is officially on the move.

Order #{{order_number}}
Tracking number: {{tracking_number}}
Carrier: {{carrier}}
Track it here: {{tracking_url}}

Estimated delivery: {{estimated_delivery}}

Quick heads up — tracking sometimes takes 12-24 hours to update after we hand off the package. If it says "label created" for a day, don't panic. Totally normal.

Everything is wrapped with care. Bubble wrap, foam inserts, the works.

When your package arrives, check everything before you toss the packaging. If anything got damaged in shipping, snap a couple photos and email kris@oilslickpad.com — we'll make it right. No runaround.

Enjoy the new gear.

— Oil Slick

P.S. We'll check in after delivery to make sure everything landed in one piece.
      `,
    },
    sms: {
      message: `Oil Slick: Order #{{order_number}} shipped! Track it live: {{tracking_url}}`,
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
      preheader: "If not, we'll fix it. No questions asked.",
      body: `
{{first_name}}, quick question.

Your order should have arrived by now. Did everything show up in good shape?

If something got damaged or isn't what you expected — don't stress. Just shoot us an email at kris@oilslickpad.com with a photo and your order number. We'll sort it out fast.

No hoops to jump through. No "submit a ticket and wait 5 days." Just real support from real people.

Most people open the box, see how well we packed it, and are already thinking about their next order. If that's you — that's what we like to hear.

In a few days we'll send a quick link to leave a review. Takes 30 seconds and it helps other people figure out what to buy.

— The Oil Slick crew

P.S. Already putting your new piece to work? Reply and tell us how it hits. We love hearing that stuff.
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
      subject: "30 seconds — how's your {{product_title}}?",
      preheader: 'One quick sentence helps the next person decide.',
      body: `
{{first_name}}, you've had your {{product_title}} for about a week now.

Why we're asking: 74% of our first-time buyers said they read reviews before adding to cart. Your honest take — even one sentence — helps the next person decide if it's worth it.

Leave a review here: {{review_url}}

A few things people usually mention:
— How's the build quality?
— Does it hit the way you expected?
— Would you buy it again?

That's it. Maybe 30 seconds.

If you're NOT happy with it, skip the review and email us instead at kris@oilslickpad.com. We'd rather fix the problem than have you leave a frustrated review.

— Oil Slick

P.S. Everyone who leaves a review gets a thank-you discount code for their next order. Just saying.
      `,
    },
    sms: {
      message: `Hey {{first_name}}, how's the {{product_title}}? A quick review helps a lot — 30 seconds: {{review_url}} — Oil Slick`,
    },
  },

  // ===========================================================================
  // 5. POST-REVIEW THANK YOU
  //    Trigger: After a customer submits a review
  //    Goal: Reinforce the behavior, offer a small incentive for next order
  // ===========================================================================

  postReviewThankYou: {
    email: {
      subject: "Your review is live — here's a thank you",
      preheader: 'We read every single one. Plus: 10% off inside.',
      body: `
{{first_name}}, we just saw your review come through.

Seriously — thank you. We read every single one and they directly shape what we stock and what we drop.

Here's 10% off your next order as a thank you:

Code: THANKS10
Expires: {{expiry_date_30days}}

No minimum. Works on anything in the store. Use it whenever you're ready.

— Oil Slick

P.S. Know someone who'd like our stuff? Forward them this email — the code is one-time use for you, but we'll take care of them too if they reach out.
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
        subject: 'The 4 things every bong owner grabs next',
        preheader: 'One of these will change how your bong hits. Seriously.',
        body: `
{{first_name}}, couple weeks in with the new bong — here's what your setup is probably missing.

These are the 4 things our repeat bong buyers order most:

Ash Catchers — Go 2-3x longer between water changes. Your bong stays clean, your hits stay smooth, and you waste less time on maintenance. Once you use one, you'll wonder why you waited.
{{link_to_collection_ash_catchers}}

Flower Bowls — The stock bowl works, but a thicker aftermarket bowl holds heat better and gives you more control. We carry 10mm, 14mm, and 18mm.
{{link_to_collection_flower_bowls}}

Downstems — A diffused downstem can completely change how your bong hits. More percolation, smoother draws. Worth the $15-20 upgrade if you're still running the stock one.
{{link_to_collection_downstems}}

Cleaning Supplies — Res caps, plugs, and cleaning solutions. A 5-minute clean once a week keeps your glass tasting fresh for months.
{{link_to_collection_cleaning_supplies}}

No pressure. Just figured you should know what's out there.

— Oil Slick

P.S. Most of these are under $25 and they ship free when you add them to a qualifying order.
        `,
      },
    },

    // Variant B: Customer bought a dab rig
    dabRigBuyer: {
      email: {
        subject: '3 upgrades that change everything about your dab setup',
        preheader: 'Your rig is only as good as what you pair with it.',
        body: `
{{first_name}}, got your dab rig dialed in yet?

The rig is just the foundation. These are the pieces that take your sessions from decent to dialed:

Quartz Bangers — If your rig came with a basic banger, upgrading to thicker quartz makes a real difference. Better heat retention means better flavor and more efficient use of your concentrates. A $20 banger upgrade pays for itself in wasted-concentrate savings.
{{link_to_collection_quartz_bangers}}

Carb Caps — Lets you dab at lower temps. Lower temps = better flavor + less waste. Seems optional until you try it — then it's the piece you'll never session without.
{{link_to_collection_carb_caps}}

Dab Tools — The right tool for the consistency you're working with (shatter vs. badder vs. sauce) makes loading 10x easier and wastes less material.
{{link_to_collection_dab_tools}}

Torches — If you're using a cheap hardware store torch, a proper dab torch heats more evenly, lasts longer, and gives you better temp control.
{{link_to_collection_torches}}

Just some ideas. No rush.

— Oil Slick

P.S. Not sure what joint size fits your rig? Reply with a photo and we'll tell you exactly what you need.
        `,
      },
    },

    // Variant C: Customer bought a hand pipe
    handPipeBuyer: {
      email: {
        subject: 'Your pipe is good — these make it better',
        preheader: 'Two small upgrades most pipe smokers wish they knew about sooner.',
        body: `
{{first_name}}, enjoying the new pipe?

A couple things that make the experience noticeably better:

Grinders — If you're still breaking up flower by hand, this is the single biggest upgrade you can make. Even grind = even burn = smoother, more flavorful hits. A $15 grinder changes everything.
{{link_to_collection_grinders}}

Screens — A $2 pack of screens keeps ash and scooby snacks out of your mouth. Tiny investment, huge difference in every session.
{{link_to_collection_screens}}

Bubblers — Love the portability of a hand pipe but want smoother hits? A bubbler adds water filtration in a handheld package. Best of both worlds.
{{link_to_collection_bubblers}}

Cleaning Supplies — A little maintenance goes a long way. Our cleaning kits make it a 3-minute job instead of a 15-minute project.
{{link_to_collection_cleaning_supplies}}

— Oil Slick

P.S. Thinking about upgrading to a bong? Check out our starter bongs under $50 — you might be surprised what you can get.
        `,
      },
    },

    // Variant D: Customer bought rolling papers or cones
    rollingBuyer: {
      email: {
        subject: 'Your rolling setup is missing something',
        preheader: 'The thing that turns messy rolls into perfect ones every time.',
        body: `
{{first_name}}, papers and cones run out fast. Before you need to restock, here's what levels up your rolling game:

Grinders — The difference between messy, uneven rolls and perfect, slow-burning ones. Consistent grind = consistent roll. Period. If you don't have one, a $15 grinder will change your life.
{{link_to_collection_grinders}}

Rolling Trays — Keeps your workspace clean and catches everything. No more losing flower in your lap or between couch cushions. We carry a bunch of styles and sizes.
{{link_to_collection_rolling_trays}}

More Papers and Cones — When you're ready to restock: RAW, Vibes, Elements, Zig Zag, and more. All in stock and ready to ship.
{{link_to_collection_rolling_papers}}

Storage — Doob tubes, stash jars, and containers to keep your pre-rolls fresh for days instead of hours.
{{link_to_collection_storage}}

— Oil Slick

P.S. Rolling not your thing anymore? Check out our hand pipes for zero-prep sessions — grab and go.
        `,
      },
    },

    // Variant E: Generic fallback for any product type
    generic: {
      email: {
        subject: 'Picked these out for you (based on your last order)',
        preheader: 'Not random recommendations — these actually go with what you bought.',
        body: `
{{first_name}}, based on your last order, we pulled a few things you might actually want:

{{recommended_products_block}}

Not random suggestions — it's what other customers who bought similar gear ended up grabbing next.

Everything ships from the US with the same careful packaging we used on your last order. Free shipping on qualifying orders.

If none of this is your thing, no worries. We won't keep bugging you.

— Oil Slick

P.S. Want a personalized recommendation? Reply to this email with what you're looking for and we'll point you in the right direction.
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
      subject: "You're probably running low on {{product_title}}",
      preheader: "Reorder in 30 seconds before you're stuck without it.",
      body: `
{{first_name}}, it's been about {{days_since_purchase}} days since you grabbed {{product_title}}.

If your rotation is anything like ours, you're probably getting close to the bottom.

Running out mid-session is the worst. Don't let it happen.

Reorder the same thing here: {{product_url}}

Same product, same price, ships same-day before 2pm MT.

If you want to switch it up, these are solid alternatives that other customers swear by:

{{related_products_block}}

— Oil Slick

P.S. We keep these stocked year-round, but if you ever need something we're out of, reply and we'll let you know when it's back.
      `,
    },
    sms: {
      message: `Hey {{first_name}}, running low on {{product_title}}? Same-day reorder: {{product_url}} — Oil Slick`,
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
        subject: 'You forgot this (still saving it for you)',
        preheader: "Your cart isn't going anywhere — but stock might.",
        body: `
{{first_name}}, looks like you left before finishing checkout.

No worries — we saved your cart. Here's what's still in it:

{{#each cart_items}}
  • {{this.title}} — {{this.price}}
{{/each}}

Pick up where you left off: {{checkout_url}}

If you ran into a problem at checkout — a weird error, a question about shipping, anything — just reply to this email. We're around and happy to help.

— Oil Slick

P.S. If it was a price thing, keep an eye on your inbox. We might have something for you.
        `,
      },
      sms: {
        message: `Hey {{first_name}}, your Oil Slick cart is saved. Finish checkout here: {{checkout_url}}`,
      },
    },

    // Part 2: 24 hours after abandonment
    reminder2: {
      email: {
        subject: 'Quick question about your cart',
        preheader: 'Did something go wrong at checkout? We can help.',
        body: `
{{first_name}}, still thinking it over?

Your cart at Oil Slick still has:

{{#each cart_items}}
  • {{this.title}} — {{this.price}}
{{/each}}

Why 10,000+ people have ordered from us since 2012:

— Every glass piece ships with bubble wrap and foam. Haven't had a breakage complaint in months.
— Free shipping on qualifying orders. Check if yours qualifies at checkout.
— We keep our prices competitive. We'd rather earn a customer for life than squeeze you on one order.

Finish your order: {{checkout_url}}

If the price is what's holding you back, reply to this email. We might be able to work something out.

— Oil Slick

P.S. Tomorrow's your last chance to grab these at this price before we clear saved carts.
        `,
      },
    },

    // Part 3: 72 hours after abandonment (final push with incentive)
    reminder3: {
      email: {
        subject: 'Alright — 10% off to make it easy',
        preheader: 'Last email about this cart. Plus a discount code.',
        body: `
{{first_name}}, last email about this. We promise.

Your cart still has:

{{#each cart_items}}
  • {{this.title}} — {{this.price}}
{{/each}}

Look — we want you to have this stuff. So here's 10% off:

Code: COMEBACK10
Expires: {{expiry_date_7days}}

Use it here: {{checkout_url}}

After this, we'll leave your cart alone. But the code works on anything in the store for the next 7 days if you want to shop around.

— Oil Slick

P.S. This code is single-use and expires in 7 days. After that, it's gone for good.
        `,
      },
      sms: {
        message: `{{first_name}}, 10% off your Oil Slick cart — code COMEBACK10, 7 days only: {{checkout_url}}`,
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
      subject: 'The {{browsed_product_title}} — still available',
      preheader: 'Had a question about it? We can help.',
      body: `
{{first_name}}, you were checking out {{browsed_product_title}} yesterday.

No sales pitch. Just wanted to make sure you saw everything you needed to make a decision.

Take another look: {{browsed_product_url}}

If you had questions about sizing, joint compatibility, glass thickness, or anything else — reply to this email. We actually know this stuff and can save you from ordering the wrong size.

Comparing options? A few similar products our customers like:

{{related_products_block}}

— Oil Slick

P.S. Not sure what you need? Tell us what you're looking for and we'll give you an honest recommendation — even if it means pointing you to a cheaper option.
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
        subject: '7 new things since your last order',
        preheader: 'Plus free shipping this week on orders over $50.',
        body: `
{{first_name}}, it's been about a month since your last order.

A lot has changed since then. Here's what's new:

{{new_products_block}}

And here's what everyone else is buying right now:
{{bestseller_products_block}}

Same deal as always — ships from the US, packed by hand, and if anything isn't right we make it right.

We're also running free shipping on orders over $50 this week.

Browse new arrivals: {{new_arrivals_url}}

— Oil Slick

P.S. In a few weeks we'll have something special for loyal customers. Stay tuned.
        `,
      },
    },

    // Part 2: 60 days since last purchase
    nudge: {
      email: {
        subject: 'Been a minute, {{first_name}} — 10% to come back',
        preheader: 'We added a bunch of new glass. Come take a look.',
        body: `
{{first_name}}, it's been a couple months. No guilt trip — just wanted to make sure you know we're still here.

Since your last visit we've added:
— New Made in USA glass pieces from independent blowers
— Expanded dab accessories with more banger and carb cap options
— Restocked popular items that were sold out

Here's 10% off if something catches your eye:

Code: MISSYOU10
Expires: {{expiry_date_14days}}

Shop now: {{store_url}}

And if you left because something went wrong with an order — reply to this email. We take that stuff seriously and want to make it right.

— Oil Slick

P.S. If nothing changes in the next 30 days, we'll send you our best offer. Just once. Then we'll back off.
        `,
      },
    },

    // Part 3: 90 days since last purchase
    lastChance: {
      email: {
        subject: "Our best offer — then we'll stop emailing",
        preheader: '15% off everything. One last shot.',
        body: `
{{first_name}}, this is the last time we'll reach out for a while.

We don't want to be that store that spams your inbox. So here's our best offer — better than what we give anyone else:

15% off anything in the store:

Code: WELCOME15
Expires: {{expiry_date_14days}}

Shop now: {{store_url}}

If you're not interested anymore, that's completely fine. Unsubscribe below and no hard feelings.

But if you DO come back, you'll be surprised by how much we've expanded the catalog since you were last around.

Thanks for being a customer in the first place.

— Kris at Oil Slick

P.S. This 15% code works on everything — including new arrivals and sale items. It's the biggest discount we give outside of birthdays.
        `,
      },
      sms: {
        message: `{{first_name}}, 15% off anything at Oil Slick — code WELCOME15, 14 days only: {{store_url}}`,
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
      subject: 'Should we stop emailing you?',
      preheader: "Honest question — click one button and you're set either way.",
      body: `
{{first_name}}, straight up — do you still want to hear from us?

Haven't seen you around in a while. We'd rather have 500 customers who want our emails than 5,000 who don't.

If you want to stay on the list:
Click here and you're all set: {{resubscribe_url}}

If you're done:
No need to do anything. We'll remove you from our email list in 7 days. You can always come back to oilslickpad.com and sign up again if you change your mind.

No hard feelings either way.

— Oil Slick

P.S. If you stay, we promise: no more than 2-3 emails per month. New products, real sales, and the occasional discount just for subscribers. That's it.
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
        subject: "Your 10% off code is inside (plus what to buy first)",
        preheader: "700+ products. Here's where to start.",
        body: `
{{first_name}}, welcome. Here's what you get for signing up:

10% off your first order:

Code: WELCOME10
Expires: {{expiry_date_30days}}

Now — here's what's in it for you.

We carry 700+ products — bongs, dab rigs, hand pipes, bubblers, rolling papers, vape gear, and every accessory you can think of. All vetted by people who actually use this stuff.

3 things that set us apart:

1. Our packaging is borderline obsessive. Bubble wrap, foam, hand-packed. 10,000+ orders shipped since 2012 — breakage is basically zero.

2. We stock a full Made in USA glass collection from independent American glassblowers. Not just Chinese imports with markup.

3. Real people answer emails. If you have a question, email kris@oilslickpad.com and you'll get an actual answer from someone who knows the products.

Browse the shop: {{store_url}}

— Kris and the Oil Slick crew

P.S. In 3 days, we'll send you the products everyone's buying right now. If you're not sure where to start, that email will make it easy.
        `,
      },
      sms: {
        message: `Welcome to Oil Slick! 10% off your first order — code WELCOME10. 700+ products: {{store_url}}`,
      },
    },

    // Part 2: 3 days after signup (if no purchase yet)
    bestSellers: {
      email: {
        subject: 'The 5 things everyone buys first',
        preheader: 'This is where most people start (and why).',
        body: `
{{first_name}}, remember when we said we'd show you what everyone's buying?

Our top sellers right now:

{{bestseller_products_block}}

Not sure which category is right for you? Quick breakdown:

Bongs — For flower smokers who want smooth, water-filtered hits. Our most popular category.
{{link_to_collection_bongs}}

Dab Rigs — Built specifically for concentrates and extracts. Different sizes for different setups.
{{link_to_collection_dab_rigs}}

Hand Pipes — Simple, portable, no water, no setup. Grab and go.
{{link_to_collection_hand_pipes}}

Made in USA Glass — Handcrafted pieces from American glassblowers. Thicker glass, unique designs, built to last.
{{link_to_collection_usa_glass}}

Your 10% off code WELCOME10 is still active. Just saying.

— Oil Slick

P.S. In a few days we'll share some real customer reviews so you can see what people are saying. Spoiler: the packaging gets mentioned a lot.
        `,
      },
    },

    // Part 3: 7 days after signup (if no purchase yet)
    trustBuilder: {
      email: {
        subject: "Don't just take our word for it",
        preheader: "Here's what 3 real customers said after their first order.",
        body: `
{{first_name}}, we know there are hundreds of smokeshops online. So instead of telling you why we're different, we'll let our customers do it:

"Best glass selection online. Ordered a beaker bong and it arrived in perfect condition. Packaging was insane — like three layers of bubble wrap." — Marcus T.

"Fast shipping and the dab rig I got is way thicker than I expected for the price. Already ordered a second one for my buddy." — Jessica R.

"I stock my shop with Oil Slick products. Consistent quality, good margins, and they actually communicate when there are delays." — David M.

We've earned those reviews by doing the basics right. Good products. Honest prices. Careful packaging. And responding when people reach out.

Your 10% off code WELCOME10 expires in {{days_until_expiry}} days.

Use it here: {{store_url}}

After this, we'll dial back the emails. Just the occasional update when we get new products or run a real sale. No spam — we promise.

— Oil Slick

P.S. Still not sure what to get? Reply to this email with your budget and what you're looking for. We'll send you a personal recommendation within 24 hours.
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
      subject: "{{first_name}}, this one's personal",
      preheader: "You've earned something most customers don't get.",
      body: `
{{first_name}}, real talk.

You've ordered from us {{order_count}} times now. Most people buy once and move on — you keep coming back. That means a lot to a small operation like ours.

So here's what you get for being a real one:

15% off your next order — no minimum, no restrictions, no expiration tricks:

Code: VIP15
Good for: {{expiry_date_60days}}

But here's the part that matters more than the discount.

From now on, if you need help picking out a piece, want a recommendation, or need to sort out an issue — you go to the front of the line. Reply to this email and it comes straight to Kris.

Thanks for sticking with us.

— Kris and the Oil Slick crew

P.S. We don't have a formal loyalty program with points and tiers. We just take care of the people who take care of us. This code is our way of doing that.
      `,
    },
    sms: {
      message: `{{first_name}}, you're a VIP. 15% off anything — code VIP15, 60 days. Thanks for sticking with us. — Oil Slick`,
    },
  },

  // ===========================================================================
  // 14. BACK IN STOCK NOTIFICATION
  //     Trigger: Product restocked that customer requested notification for
  //     Goal: Convert immediately — these are high-intent
  // ===========================================================================

  backInStock: {
    email: {
      subject: '{{product_title}} — back in stock (limited)',
      preheader: 'You asked. We restocked. Move fast.',
      body: `
{{first_name}}, remember {{product_title}}?

It's back. And you're one of the first to know.

Grab it here: {{product_url}}

This one sold out last time, and we can't guarantee how long this batch will last. There are {{waitlist_count}} other people on the notification list.

If you want it, don't sit on it.

— Oil Slick

P.S. If it sells out again before you grab it, reply to this email and we'll put you at the top of the next restock list.
      `,
    },
    sms: {
      message: `{{first_name}}, {{product_title}} is BACK at Oil Slick. Sold out before — grab it: {{product_url}}`,
    },
  },

  // ===========================================================================
  // 15. PRICE DROP ALERT
  //     Trigger: Product in wishlist or browse history drops in price
  //     Goal: Convert browsers who were price-sensitive
  // ===========================================================================

  priceDrop: {
    email: {
      subject: 'That {{product_title}} just got cheaper',
      preheader: 'Real price drop — not a fake markup game.',
      body: `
{{first_name}}, good news about something you were looking at.

{{product_title}} just dropped in price:

Was: {{original_price}}
Now: {{current_price}}

Check it out: {{product_url}}

We don't do fake markups or inflated "compare at" prices. When we drop a price, it's a real drop. This could change depending on inventory, so if you were on the fence before, now's the time.

— Oil Slick

P.S. Price drops don't last forever. Once stock at this price is gone, it goes back up.
      `,
    },
    sms: {
      message: `{{first_name}}, {{product_title}} dropped from {{original_price}} to {{current_price}}. Real cut: {{product_url}} — Oil Slick`,
    },
  },

  // ===========================================================================
  // 16. BIRTHDAY
  //     Trigger: Customer's birthday (if collected)
  //     Goal: Personal touch, drive a purchase with a gift
  // ===========================================================================

  birthday: {
    email: {
      subject: 'Happy birthday, {{first_name}} — 20% off anything',
      preheader: 'Your birthday gift from Oil Slick. No strings.',
      body: `
{{first_name}}, happy birthday from all of us at Oil Slick.

No long sappy email. Just a gift:

20% off anything in the store:

Code: BDAY20
Expires: {{expiry_date_14days}}

No minimum order. Works on everything — including sale items and new arrivals. This is the biggest discount we give all year.

You deserve something nice today. Go pick it out.

— Kris and the Oil Slick crew

P.S. Seriously — treat yourself. You have been eyeing something in the shop, we both know it. Today is the day.
      `,
    },
    sms: {
      message: `Happy birthday {{first_name}}! 20% off anything at Oil Slick — code BDAY20. Treat yourself: {{store_url}}`,
    },
  },

  // ===========================================================================
  // 17. REFER A FRIEND NUDGE
  //     Trigger: 30 days after first purchase (satisfied customer window)
  //     Goal: Word-of-mouth growth
  // ===========================================================================

  referral: {
    email: {
      subject: 'Give your friend 15% off (you get 15% too)',
      preheader: 'The easiest way to hook up a friend and save on your next order.',
      body: `
{{first_name}}, got a friend who's into glass or smoking gear?

Here's how this works:

1. Send them your referral link: {{referral_link}}
2. They get 15% off their first order.
3. You get 15% off your next order.

That's it. No catch. No limits on how many people you refer. Every time someone uses your link, you earn another 15% code.

Easiest way to hook up your friends and save yourself money at the same time.

— Oil Slick

P.S. Some of our best customers came from referrals. Your recommendation carries more weight than any ad we could run.
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
      subject: 'Quick question about your recent order',
      preheader: "If you're buying for a shop, we should talk numbers.",
      body: `
{{first_name}}, we noticed your recent order was on the larger side.

Quick question — are you stocking a retail shop, buying for a lounge, or just someone who likes to buy in bulk?

If any of those apply, we've got wholesale pricing that could save you a significant amount on future orders.

What our wholesale customers get:
— Tiered discounts based on order volume (up to 30% off retail)
— Priority on new product drops and restocks
— Dedicated support line for order issues
— Net terms available for qualified accounts

No lengthy application or minimum commitment. We keep it simple because we know how shops actually work.

Reply to this email or reach out to kris@oilslickpad.com and we'll get you set up.

Either way, thanks for the business. We appreciate big orders just as much as small ones.

— Kris
Oil Slick / oilslickpad.com

P.S. Already a shop owner? Ask about our display and sample programs. We help our wholesale partners sell through faster.
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
