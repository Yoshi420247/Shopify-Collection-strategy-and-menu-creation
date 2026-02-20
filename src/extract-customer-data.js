#!/usr/bin/env node
/**
 * Comprehensive Customer Data Extraction for Oil Slick Pad
 *
 * Extracts ALL customer data, order history, and abandoned checkouts from Shopify.
 * Builds marketing segments with RFM (Recency, Frequency, Monetary) analysis.
 *
 * Data sources:
 *   - Customers API: email, name, phone, address, order stats, marketing consent
 *   - Orders API: line items, product categories, purchase amounts, dates
 *   - Abandoned Checkouts API: emails + cart contents from incomplete purchases
 *
 * Output:
 *   - data/customer-master-list.csv         (all customers, one row per customer)
 *   - data/customer-master-list.json        (full data with order details)
 *   - data/abandoned-checkouts.csv          (abandoned cart emails + products)
 *   - data/segments/                        (segment-specific CSV files)
 *   - data/extraction-report.json           (summary stats)
 *
 * Usage:
 *   node src/extract-customer-data.js                    # Full extraction
 *   node src/extract-customer-data.js --customers-only   # Customers without order details
 *   node src/extract-customer-data.js --segment-only     # Re-segment from existing JSON
 */

import { config } from './config.js';
import {
  getCustomers,
  getCustomerCount,
  getOrders,
  getOrderCount,
  getAbandonedCheckouts,
  getAbandonedCheckoutCount,
  getProducts,
} from './shopify-api.js';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// ─── CLI FLAGS ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const CUSTOMERS_ONLY = args.includes('--customers-only');
const SEGMENT_ONLY = args.includes('--segment-only');
const MAX_PAGES = args.find(a => a.startsWith('--max-pages='));
const PAGE_LIMIT = MAX_PAGES ? parseInt(MAX_PAGES.split('=')[1]) : Infinity;

// ─── SMOKESHOP PRODUCT IDENTIFICATION ────────────────────────────────────────
// Tags and keywords that identify smokeshop/headshop products
const SMOKESHOP_FAMILIES = new Set(Object.keys(config.taxonomy.families));

const SMOKESHOP_KEYWORDS = [
  'bong', 'water pipe', 'dab rig', 'rig', 'hand pipe', 'spoon pipe',
  'bubbler', 'nectar collector', 'chillum', 'one hitter', 'steamroller',
  'banger', 'carb cap', 'dab tool', 'dabber', 'torch', 'grinder',
  'rolling paper', 'rolling tray', 'vape', 'bowl', 'ash catcher',
  'downstem', 'silicone pipe', 'glass pipe', 'e-rig', 'puffco',
  'lookah', 'g pen', 'g-pen',
];

const SMOKESHOP_VENDOR = 'What You Need';

function isSmokeshopProduct(lineItem) {
  // Check vendor
  if (lineItem.vendor === SMOKESHOP_VENDOR) return true;

  // Check product title against keywords
  const title = (lineItem.title || '').toLowerCase();
  if (SMOKESHOP_KEYWORDS.some(kw => title.includes(kw))) return true;

  // Check product tags if available
  if (lineItem.properties) {
    const tags = lineItem.properties
      .filter(p => p.name === '_tags')
      .map(p => p.value)
      .join(' ')
      .toLowerCase();
    for (const family of SMOKESHOP_FAMILIES) {
      if (tags.includes(`family:${family}`)) return true;
    }
  }

  // Check product type
  const productType = (lineItem.product_type || '').toLowerCase();
  if (SMOKESHOP_KEYWORDS.some(kw => productType.includes(kw))) return true;

  return false;
}

// ─── EXTRACTION: CUSTOMERS ──────────────────────────────────────────────────
async function fetchAllCustomers() {
  console.log('\n━━━ FETCHING CUSTOMERS ━━━');

  let countData;
  try {
    countData = await getCustomerCount();
    console.log(`Total customers in store: ${countData.count}`);
  } catch (e) {
    console.log('Could not fetch customer count, will paginate until exhausted.');
  }

  const allCustomers = [];
  let page = 0;
  let sinceId = 0;
  let hasMore = true;

  while (hasMore && page < PAGE_LIMIT) {
    page++;
    const params = { limit: 250 };
    if (sinceId > 0) params.since_id = sinceId;

    const data = await getCustomers(params);
    const batch = data.customers || [];

    if (batch.length === 0) {
      hasMore = false;
    } else {
      allCustomers.push(...batch);
      sinceId = batch[batch.length - 1].id;
      console.log(`  Page ${page}: fetched ${batch.length} (total: ${allCustomers.length})`);

      if (batch.length < 250) hasMore = false;
    }
  }

  console.log(`✓ Fetched ${allCustomers.length} customers total`);
  return allCustomers;
}

// ─── EXTRACTION: ORDERS ─────────────────────────────────────────────────────
async function fetchAllOrders() {
  console.log('\n━━━ FETCHING ORDERS ━━━');

  let countData;
  try {
    countData = await getOrderCount({ status: 'any' });
    console.log(`Total orders in store: ${countData.count}`);
  } catch (e) {
    console.log('Could not fetch order count, will paginate until exhausted.');
  }

  const allOrders = [];
  let page = 0;
  let sinceId = 0;
  let hasMore = true;

  while (hasMore && page < PAGE_LIMIT) {
    page++;
    const params = {
      limit: 250,
      status: 'any',
      fields: 'id,customer,email,line_items,created_at,total_price,financial_status,fulfillment_status,tags,note,currency,subtotal_price,total_discounts,total_tax,source_name',
    };
    if (sinceId > 0) params.since_id = sinceId;

    const data = await getOrders(params);
    const batch = data.orders || [];

    if (batch.length === 0) {
      hasMore = false;
    } else {
      allOrders.push(...batch);
      sinceId = batch[batch.length - 1].id;
      console.log(`  Page ${page}: fetched ${batch.length} (total: ${allOrders.length})`);

      if (batch.length < 250) hasMore = false;
    }
  }

  console.log(`✓ Fetched ${allOrders.length} orders total`);
  return allOrders;
}

// ─── EXTRACTION: ABANDONED CHECKOUTS ────────────────────────────────────────
async function fetchAllAbandonedCheckouts() {
  console.log('\n━━━ FETCHING ABANDONED CHECKOUTS ━━━');

  let countData;
  try {
    countData = await getAbandonedCheckoutCount();
    console.log(`Total abandoned checkouts: ${countData.count}`);
  } catch (e) {
    console.log('Could not fetch checkout count (may need read_checkouts scope).');
  }

  const allCheckouts = [];
  let page = 0;
  let sinceId = 0;
  let hasMore = true;

  while (hasMore && page < PAGE_LIMIT) {
    page++;
    const params = { limit: 250 };
    if (sinceId > 0) params.since_id = sinceId;

    try {
      const data = await getAbandonedCheckouts(params);
      const batch = data.checkouts || [];

      if (batch.length === 0) {
        hasMore = false;
      } else {
        allCheckouts.push(...batch);
        sinceId = batch[batch.length - 1].id;
        console.log(`  Page ${page}: fetched ${batch.length} (total: ${allCheckouts.length})`);

        if (batch.length < 250) hasMore = false;
      }
    } catch (e) {
      console.log(`  ⚠ Abandoned checkouts fetch failed: ${e.message}`);
      console.log('  This may require the read_checkouts scope on your API token.');
      hasMore = false;
    }
  }

  console.log(`✓ Fetched ${allCheckouts.length} abandoned checkouts total`);
  return allCheckouts;
}

// ─── EXTRACTION: PRODUCT CATALOG (for tag matching) ─────────────────────────
async function fetchProductCatalog() {
  console.log('\n━━━ FETCHING PRODUCT CATALOG ━━━');

  const allProducts = [];
  let page = 0;
  let sinceId = 0;
  let hasMore = true;

  while (hasMore && page < PAGE_LIMIT) {
    page++;
    const params = {
      limit: 250,
      fields: 'id,title,vendor,product_type,tags',
    };
    if (sinceId > 0) params.since_id = sinceId;

    const data = await getProducts(params);
    const batch = data.products || [];

    if (batch.length === 0) {
      hasMore = false;
    } else {
      allProducts.push(...batch);
      sinceId = batch[batch.length - 1].id;
      console.log(`  Page ${page}: fetched ${batch.length} (total: ${allProducts.length})`);

      if (batch.length < 250) hasMore = false;
    }
  }

  // Build product lookup by ID
  const productMap = {};
  for (const p of allProducts) {
    productMap[p.id] = {
      title: p.title,
      vendor: p.vendor,
      product_type: p.product_type,
      tags: p.tags,
      is_smokeshop: p.vendor === SMOKESHOP_VENDOR ||
        SMOKESHOP_KEYWORDS.some(kw => (p.title || '').toLowerCase().includes(kw)) ||
        (p.tags || '').split(',').some(t => {
          const tag = t.trim().toLowerCase();
          return SMOKESHOP_FAMILIES.has(tag.replace('family:', ''));
        }),
    };
  }

  console.log(`✓ Fetched ${allProducts.length} products, ${Object.values(productMap).filter(p => p.is_smokeshop).length} are smokeshop items`);
  return productMap;
}

// ─── DATA PROCESSING ────────────────────────────────────────────────────────
function processData(customers, orders, abandonedCheckouts, productMap) {
  console.log('\n━━━ PROCESSING DATA ━━━');

  const now = new Date();

  // Build order lookup by customer ID and email
  const ordersByCustomerId = {};
  const ordersByEmail = {};

  for (const order of orders) {
    const customerId = order.customer?.id;
    const email = (order.email || order.customer?.email || '').toLowerCase().trim();

    if (customerId) {
      if (!ordersByCustomerId[customerId]) ordersByCustomerId[customerId] = [];
      ordersByCustomerId[customerId].push(order);
    }

    if (email) {
      if (!ordersByEmail[email]) ordersByEmail[email] = [];
      ordersByEmail[email].push(order);
    }
  }

  // Process each customer
  const customerRecords = [];

  for (const customer of customers) {
    const email = (customer.email || '').toLowerCase().trim();
    if (!email) continue; // Skip customers without email

    // Get this customer's orders
    const custOrders = ordersByCustomerId[customer.id] || ordersByEmail[email] || [];

    // Analyze order history
    let totalSpent = parseFloat(customer.total_spent) || 0;
    let orderCount = customer.orders_count || custOrders.length;
    let lastOrderDate = null;
    let firstOrderDate = null;
    const productsPurchased = new Set();
    const categoriesPurchased = new Set();
    const vendorsPurchased = new Set();
    let smokeshopOrderCount = 0;
    let smokeshopSpend = 0;
    const smokeshopProductsBought = new Set();
    const allLineItems = [];

    for (const order of custOrders) {
      const orderDate = new Date(order.created_at);
      if (!lastOrderDate || orderDate > lastOrderDate) lastOrderDate = orderDate;
      if (!firstOrderDate || orderDate < firstOrderDate) firstOrderDate = orderDate;

      let orderHasSmokeshop = false;

      for (const item of (order.line_items || [])) {
        const productId = item.product_id;
        const productInfo = productMap[productId] || {};

        productsPurchased.add(item.title);
        if (item.vendor) vendorsPurchased.add(item.vendor);
        if (productInfo.product_type) categoriesPurchased.add(productInfo.product_type);

        const isSmokeshop = productInfo.is_smokeshop || isSmokeshopProduct(item);

        if (isSmokeshop) {
          orderHasSmokeshop = true;
          smokeshopProductsBought.add(item.title);
          smokeshopSpend += parseFloat(item.price) * (item.quantity || 1);
        }

        allLineItems.push({
          product_id: productId,
          title: item.title,
          variant_title: item.variant_title,
          vendor: item.vendor,
          product_type: productInfo.product_type || '',
          price: item.price,
          quantity: item.quantity,
          is_smokeshop: isSmokeshop,
          order_date: order.created_at,
        });
      }

      if (orderHasSmokeshop) smokeshopOrderCount++;
    }

    // RFM Analysis
    const daysSinceLastOrder = lastOrderDate
      ? Math.floor((now - lastOrderDate) / (1000 * 60 * 60 * 24))
      : null;
    const daysSinceFirstOrder = firstOrderDate
      ? Math.floor((now - firstOrderDate) / (1000 * 60 * 60 * 24))
      : null;
    const avgOrderValue = orderCount > 0 ? (totalSpent / orderCount) : 0;

    // Recency score (1-5, 5=most recent)
    let recencyScore = 0;
    if (daysSinceLastOrder !== null) {
      if (daysSinceLastOrder <= 30) recencyScore = 5;
      else if (daysSinceLastOrder <= 90) recencyScore = 4;
      else if (daysSinceLastOrder <= 180) recencyScore = 3;
      else if (daysSinceLastOrder <= 365) recencyScore = 2;
      else recencyScore = 1;
    }

    // Frequency score (1-5)
    let frequencyScore = 0;
    if (orderCount >= 10) frequencyScore = 5;
    else if (orderCount >= 5) frequencyScore = 4;
    else if (orderCount >= 3) frequencyScore = 3;
    else if (orderCount >= 2) frequencyScore = 2;
    else if (orderCount >= 1) frequencyScore = 1;

    // Monetary score (1-5)
    let monetaryScore = 0;
    if (totalSpent >= 500) monetaryScore = 5;
    else if (totalSpent >= 200) monetaryScore = 4;
    else if (totalSpent >= 100) monetaryScore = 3;
    else if (totalSpent >= 50) monetaryScore = 2;
    else if (totalSpent > 0) monetaryScore = 1;

    const rfmScore = recencyScore + frequencyScore + monetaryScore;

    // Customer segment labels
    const segments = [];
    if (orderCount > 0) segments.push('purchaser');
    if (orderCount === 0) segments.push('registered_no_purchase');
    if (orderCount >= 3) segments.push('repeat_buyer');
    if (orderCount === 1) segments.push('one_time_buyer');
    if (rfmScore >= 12) segments.push('vip');
    if (totalSpent >= 200) segments.push('high_value');
    if (daysSinceLastOrder !== null && daysSinceLastOrder <= 30) segments.push('recent_30d');
    if (daysSinceLastOrder !== null && daysSinceLastOrder <= 60) segments.push('recent_60d');
    if (daysSinceLastOrder !== null && daysSinceLastOrder <= 90) segments.push('recent_90d');
    if (daysSinceLastOrder !== null && daysSinceLastOrder > 180) segments.push('lapsed_6mo');
    if (daysSinceLastOrder !== null && daysSinceLastOrder > 365) segments.push('lapsed_1yr');
    if (smokeshopOrderCount > 0) segments.push('smokeshop_buyer');
    if (smokeshopProductsBought.size > 0) segments.push('smokeshop_interest');

    // Marketing consent
    const marketingConsent = customer.email_marketing_consent?.state || customer.marketing_opt_in_level || 'unknown';
    const smsConsent = customer.sms_marketing_consent?.state || 'unknown';

    // Default address
    const addr = customer.default_address || {};

    customerRecords.push({
      // Identity
      shopify_customer_id: customer.id,
      email,
      first_name: customer.first_name || '',
      last_name: customer.last_name || '',
      phone: customer.phone || addr.phone || '',

      // Address
      address1: addr.address1 || '',
      address2: addr.address2 || '',
      city: addr.city || '',
      province: addr.province || '',
      province_code: addr.province_code || '',
      zip: addr.zip || '',
      country: addr.country || '',
      country_code: addr.country_code || '',

      // Order stats
      order_count: orderCount,
      total_spent: totalSpent.toFixed(2),
      avg_order_value: avgOrderValue.toFixed(2),
      first_order_date: firstOrderDate ? firstOrderDate.toISOString().split('T')[0] : '',
      last_order_date: lastOrderDate ? lastOrderDate.toISOString().split('T')[0] : '',
      days_since_last_order: daysSinceLastOrder !== null ? daysSinceLastOrder : '',
      customer_lifetime_days: daysSinceFirstOrder !== null ? daysSinceFirstOrder : '',

      // RFM
      recency_score: recencyScore,
      frequency_score: frequencyScore,
      monetary_score: monetaryScore,
      rfm_total: rfmScore,

      // Smokeshop specific
      smokeshop_order_count: smokeshopOrderCount,
      smokeshop_spend: smokeshopSpend.toFixed(2),
      smokeshop_products: [...smokeshopProductsBought].join(' | '),
      bought_smokeshop: smokeshopOrderCount > 0 ? 'yes' : 'no',

      // Products & categories
      products_purchased: [...productsPurchased].join(' | '),
      categories_purchased: [...categoriesPurchased].join(' | '),
      vendors_purchased: [...vendorsPurchased].join(' | '),
      unique_products_count: productsPurchased.size,

      // Consent & status
      marketing_consent: marketingConsent,
      sms_consent: smsConsent,
      accepts_marketing: customer.accepts_marketing ? 'yes' : 'no',
      account_state: customer.state || '',
      customer_tags: customer.tags || '',
      customer_note: customer.note || '',

      // Dates
      customer_created: customer.created_at ? new Date(customer.created_at).toISOString().split('T')[0] : '',
      customer_updated: customer.updated_at ? new Date(customer.updated_at).toISOString().split('T')[0] : '',

      // Segments
      segments: segments.join(', '),

      // Source
      source: custOrders.length > 0 ? (custOrders[0].source_name || '') : '',

      // Full line items (JSON only, not CSV)
      _line_items: allLineItems,
    });
  }

  console.log(`✓ Processed ${customerRecords.length} customer account records`);

  // ─── Second pass: capture guest checkout emails from orders ─────────
  // Customers who checked out as guests don't appear in /customers.json.
  // We scan all orders for emails not already in the customer set.
  const knownEmails = new Set(customerRecords.map(c => c.email));
  const guestOrdersByEmail = {};

  for (const order of orders) {
    const email = (order.email || order.customer?.email || '').toLowerCase().trim();
    if (!email || knownEmails.has(email)) continue;
    if (!guestOrdersByEmail[email]) guestOrdersByEmail[email] = [];
    guestOrdersByEmail[email].push(order);
  }

  const guestEmails = Object.keys(guestOrdersByEmail);
  console.log(`  Found ${guestEmails.length} additional guest checkout emails not in customer accounts`);

  for (const email of guestEmails) {
    const guestOrders = guestOrdersByEmail[email];

    let totalSpent = 0;
    let lastOrderDate = null;
    let firstOrderDate = null;
    const productsPurchased = new Set();
    const categoriesPurchased = new Set();
    const vendorsPurchased = new Set();
    let smokeshopOrderCount = 0;
    let smokeshopSpend = 0;
    const smokeshopProductsBought = new Set();
    const allLineItems = [];

    // Pull name/address from the most recent order's customer or shipping info
    const latestOrder = guestOrders.reduce((a, b) =>
      new Date(a.created_at) > new Date(b.created_at) ? a : b
    );
    const guestCustomer = latestOrder.customer || {};
    const guestAddr = guestCustomer.default_address || {};

    for (const order of guestOrders) {
      const orderDate = new Date(order.created_at);
      if (!lastOrderDate || orderDate > lastOrderDate) lastOrderDate = orderDate;
      if (!firstOrderDate || orderDate < firstOrderDate) firstOrderDate = orderDate;
      totalSpent += parseFloat(order.total_price) || 0;

      let orderHasSmokeshop = false;

      for (const item of (order.line_items || [])) {
        const productId = item.product_id;
        const productInfo = productMap[productId] || {};

        productsPurchased.add(item.title);
        if (item.vendor) vendorsPurchased.add(item.vendor);
        if (productInfo.product_type) categoriesPurchased.add(productInfo.product_type);

        const isSmokeshop = productInfo.is_smokeshop || isSmokeshopProduct(item);

        if (isSmokeshop) {
          orderHasSmokeshop = true;
          smokeshopProductsBought.add(item.title);
          smokeshopSpend += parseFloat(item.price) * (item.quantity || 1);
        }

        allLineItems.push({
          product_id: productId,
          title: item.title,
          variant_title: item.variant_title,
          vendor: item.vendor,
          product_type: productInfo.product_type || '',
          price: item.price,
          quantity: item.quantity,
          is_smokeshop: isSmokeshop,
          order_date: order.created_at,
        });
      }

      if (orderHasSmokeshop) smokeshopOrderCount++;
    }

    const orderCount = guestOrders.length;
    const daysSinceLastOrder = lastOrderDate
      ? Math.floor((now - lastOrderDate) / (1000 * 60 * 60 * 24))
      : null;
    const daysSinceFirstOrder = firstOrderDate
      ? Math.floor((now - firstOrderDate) / (1000 * 60 * 60 * 24))
      : null;
    const avgOrderValue = orderCount > 0 ? (totalSpent / orderCount) : 0;

    let recencyScore = 0;
    if (daysSinceLastOrder !== null) {
      if (daysSinceLastOrder <= 30) recencyScore = 5;
      else if (daysSinceLastOrder <= 90) recencyScore = 4;
      else if (daysSinceLastOrder <= 180) recencyScore = 3;
      else if (daysSinceLastOrder <= 365) recencyScore = 2;
      else recencyScore = 1;
    }

    let frequencyScore = 0;
    if (orderCount >= 10) frequencyScore = 5;
    else if (orderCount >= 5) frequencyScore = 4;
    else if (orderCount >= 3) frequencyScore = 3;
    else if (orderCount >= 2) frequencyScore = 2;
    else if (orderCount >= 1) frequencyScore = 1;

    let monetaryScore = 0;
    if (totalSpent >= 500) monetaryScore = 5;
    else if (totalSpent >= 200) monetaryScore = 4;
    else if (totalSpent >= 100) monetaryScore = 3;
    else if (totalSpent >= 50) monetaryScore = 2;
    else if (totalSpent > 0) monetaryScore = 1;

    const rfmScore = recencyScore + frequencyScore + monetaryScore;

    const segments = ['guest_checkout'];
    if (orderCount > 0) segments.push('purchaser');
    if (orderCount >= 3) segments.push('repeat_buyer');
    if (orderCount === 1) segments.push('one_time_buyer');
    if (rfmScore >= 12) segments.push('vip');
    if (totalSpent >= 200) segments.push('high_value');
    if (daysSinceLastOrder !== null && daysSinceLastOrder <= 30) segments.push('recent_30d');
    if (daysSinceLastOrder !== null && daysSinceLastOrder <= 60) segments.push('recent_60d');
    if (daysSinceLastOrder !== null && daysSinceLastOrder <= 90) segments.push('recent_90d');
    if (daysSinceLastOrder !== null && daysSinceLastOrder > 180) segments.push('lapsed_6mo');
    if (daysSinceLastOrder !== null && daysSinceLastOrder > 365) segments.push('lapsed_1yr');
    if (smokeshopOrderCount > 0) segments.push('smokeshop_buyer');
    if (smokeshopProductsBought.size > 0) segments.push('smokeshop_interest');

    customerRecords.push({
      shopify_customer_id: guestCustomer.id || '',
      email,
      first_name: guestCustomer.first_name || '',
      last_name: guestCustomer.last_name || '',
      phone: guestCustomer.phone || guestAddr.phone || '',

      address1: guestAddr.address1 || '',
      address2: guestAddr.address2 || '',
      city: guestAddr.city || '',
      province: guestAddr.province || '',
      province_code: guestAddr.province_code || '',
      zip: guestAddr.zip || '',
      country: guestAddr.country || '',
      country_code: guestAddr.country_code || '',

      order_count: orderCount,
      total_spent: totalSpent.toFixed(2),
      avg_order_value: avgOrderValue.toFixed(2),
      first_order_date: firstOrderDate ? firstOrderDate.toISOString().split('T')[0] : '',
      last_order_date: lastOrderDate ? lastOrderDate.toISOString().split('T')[0] : '',
      days_since_last_order: daysSinceLastOrder !== null ? daysSinceLastOrder : '',
      customer_lifetime_days: daysSinceFirstOrder !== null ? daysSinceFirstOrder : '',

      recency_score: recencyScore,
      frequency_score: frequencyScore,
      monetary_score: monetaryScore,
      rfm_total: rfmScore,

      smokeshop_order_count: smokeshopOrderCount,
      smokeshop_spend: smokeshopSpend.toFixed(2),
      smokeshop_products: [...smokeshopProductsBought].join(' | '),
      bought_smokeshop: smokeshopOrderCount > 0 ? 'yes' : 'no',

      products_purchased: [...productsPurchased].join(' | '),
      categories_purchased: [...categoriesPurchased].join(' | '),
      vendors_purchased: [...vendorsPurchased].join(' | '),
      unique_products_count: productsPurchased.size,

      marketing_consent: 'unknown',
      sms_consent: 'unknown',
      accepts_marketing: 'no',
      account_state: 'guest',
      customer_tags: '',
      customer_note: '',

      customer_created: '',
      customer_updated: '',

      segments: segments.join(', '),
      source: guestOrders[0]?.source_name || 'guest_checkout',
      _line_items: allLineItems,
    });
  }

  console.log(`✓ Total records: ${customerRecords.length} (${customerRecords.length - guestEmails.length} accounts + ${guestEmails.length} guest checkouts)`);

  // ─── Process abandoned checkouts ──────────────────────────────────────
  const abandonedRecords = [];
  const seenAbandonedEmails = new Set();

  for (const checkout of abandonedCheckouts) {
    const email = (checkout.email || '').toLowerCase().trim();
    if (!email) continue;

    const lineItems = checkout.line_items || [];
    const hasSmokeshop = lineItems.some(item => {
      const productInfo = productMap[item.product_id] || {};
      return productInfo.is_smokeshop || isSmokeshopProduct(item);
    });

    const smokeshopItems = lineItems
      .filter(item => {
        const productInfo = productMap[item.product_id] || {};
        return productInfo.is_smokeshop || isSmokeshopProduct(item);
      })
      .map(item => item.title);

    const cartValue = lineItems.reduce((sum, item) =>
      sum + (parseFloat(item.price) * (item.quantity || 1)), 0);

    // Check if this person is also a customer
    const isExistingCustomer = customerRecords.some(c => c.email === email);

    abandonedRecords.push({
      email,
      first_name: checkout.billing_address?.first_name || checkout.shipping_address?.first_name || '',
      last_name: checkout.billing_address?.last_name || checkout.shipping_address?.last_name || '',
      phone: checkout.phone || checkout.billing_address?.phone || '',
      city: checkout.billing_address?.city || checkout.shipping_address?.city || '',
      province: checkout.billing_address?.province || checkout.shipping_address?.province || '',
      country: checkout.billing_address?.country || checkout.shipping_address?.country || '',
      zip: checkout.billing_address?.zip || checkout.shipping_address?.zip || '',
      abandoned_date: checkout.created_at ? new Date(checkout.created_at).toISOString().split('T')[0] : '',
      cart_value: cartValue.toFixed(2),
      item_count: lineItems.length,
      items_in_cart: lineItems.map(i => i.title).join(' | '),
      has_smokeshop_items: hasSmokeshop ? 'yes' : 'no',
      smokeshop_items: smokeshopItems.join(' | '),
      is_existing_customer: isExistingCustomer ? 'yes' : 'no',
      abandoned_checkout_url: checkout.abandoned_checkout_url || '',
      recovery_status: checkout.closed_at ? 'recovered' : 'abandoned',
    });

    if (!checkout.closed_at) {
      seenAbandonedEmails.add(email);
    }
  }

  console.log(`✓ Processed ${abandonedRecords.length} abandoned checkout records`);
  console.log(`  - ${seenAbandonedEmails.size} unique emails with open abandoned carts`);

  // ─── Identify abandoned-only emails (never completed a purchase) ──────
  const customerEmails = new Set(customerRecords.map(c => c.email));
  const abandonedOnlyEmails = [...seenAbandonedEmails].filter(e => !customerEmails.has(e));
  console.log(`  - ${abandonedOnlyEmails.length} emails found ONLY in abandoned carts (never purchased)`);

  return { customerRecords, abandonedRecords, abandonedOnlyEmails };
}

// ─── SEGMENTATION ───────────────────────────────────────────────────────────
function buildSegments(customerRecords, abandonedRecords) {
  console.log('\n━━━ BUILDING MARKETING SEGMENTS ━━━');

  const segments = {};

  // Helper to create segment
  function addSegment(name, description, filterFn, records = customerRecords) {
    const filtered = records.filter(filterFn);
    segments[name] = { description, count: filtered.length, records: filtered };
    console.log(`  ${name}: ${filtered.length} contacts - ${description}`);
    return filtered;
  }

  // ─── MASTER SEGMENTS ──────────────────────────────────────────────────
  addSegment('all_customers', 'Every customer with an email', () => true);

  addSegment('all_purchasers', 'Everyone who completed at least one order',
    c => c.order_count > 0);

  addSegment('registered_no_purchase', 'Created an account but never ordered',
    c => c.order_count === 0);

  // ─── SMOKESHOP SEGMENTS (your priority) ───────────────────────────────
  addSegment('smokeshop_buyers', 'Bought any smokeshop product (bongs, pipes, rigs, etc.)',
    c => c.bought_smokeshop === 'yes');

  addSegment('smokeshop_high_value', 'Spent $100+ on smokeshop products',
    c => parseFloat(c.smokeshop_spend) >= 100);

  addSegment('smokeshop_repeat', 'Bought smokeshop products on 2+ orders',
    c => c.smokeshop_order_count >= 2);

  addSegment('smokeshop_abandoned', 'Abandoned cart contained smokeshop products',
    c => c.has_smokeshop_items === 'yes', abandonedRecords);

  // ─── RFM SEGMENTS ─────────────────────────────────────────────────────
  addSegment('vip_customers', 'Top-tier: high recency + frequency + monetary (RFM 12+)',
    c => c.rfm_total >= 12);

  addSegment('high_value', 'Spent $200+ total',
    c => parseFloat(c.total_spent) >= 200);

  addSegment('champions', 'Recent + frequent + high spend (R5 F4+ M4+)',
    c => c.recency_score >= 5 && c.frequency_score >= 4 && c.monetary_score >= 4);

  addSegment('loyal_customers', '3+ orders placed',
    c => c.order_count >= 3);

  addSegment('at_risk', 'Previously active but lapsed 6+ months',
    c => c.segments.includes('lapsed_6mo') && c.order_count >= 2);

  addSegment('lost_customers', 'No order in 12+ months',
    c => c.segments.includes('lapsed_1yr'));

  // ─── RECENCY SEGMENTS ─────────────────────────────────────────────────
  addSegment('recent_30d', 'Ordered within last 30 days',
    c => c.segments.includes('recent_30d'));

  addSegment('recent_90d', 'Ordered within last 90 days',
    c => c.segments.includes('recent_90d'));

  // ─── PURCHASE BEHAVIOR ────────────────────────────────────────────────
  addSegment('one_time_buyers', 'Made exactly one purchase',
    c => c.order_count === 1);

  addSegment('repeat_buyers', 'Made 2+ purchases',
    c => c.order_count >= 2);

  addSegment('high_aov', 'Average order value $75+',
    c => parseFloat(c.avg_order_value) >= 75);

  // ─── MARKETING CONSENT ────────────────────────────────────────────────
  addSegment('marketing_opted_in', 'Explicitly opted in to marketing emails',
    c => c.accepts_marketing === 'yes' || c.marketing_consent === 'subscribed');

  addSegment('marketing_not_opted_in', 'Not opted in (transactional contacts only)',
    c => c.accepts_marketing !== 'yes' && c.marketing_consent !== 'subscribed');

  // ─── ABANDONED CART SEGMENTS ──────────────────────────────────────────
  addSegment('all_abandoned', 'All abandoned checkouts with emails',
    c => true, abandonedRecords);

  addSegment('abandoned_not_recovered', 'Abandoned and never recovered',
    c => c.recovery_status === 'abandoned', abandonedRecords);

  addSegment('abandoned_new_leads', 'Abandoned cart but never became a customer',
    c => c.is_existing_customer === 'no' && c.recovery_status === 'abandoned', abandonedRecords);

  addSegment('abandoned_smokeshop_new', 'Had smokeshop items in cart, never purchased, not recovered',
    c => c.has_smokeshop_items === 'yes' && c.is_existing_customer === 'no' && c.recovery_status === 'abandoned', abandonedRecords);

  return segments;
}

// ─── CSV EXPORT ─────────────────────────────────────────────────────────────
function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function recordsToCsv(records, excludeFields = ['_line_items']) {
  if (records.length === 0) return '';

  const fields = Object.keys(records[0]).filter(f => !excludeFields.includes(f));
  const header = fields.map(escapeCsvField).join(',');
  const rows = records.map(r =>
    fields.map(f => escapeCsvField(r[f])).join(',')
  );

  return [header, ...rows].join('\n');
}

// ─── MAIN ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   OIL SLICK PAD - CUSTOMER DATA EXTRACTION                 ║');
  console.log('║   Complete Marketing Dataset Builder                        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Store: ${config.shopify.storeUrl}`);
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Mode: ${SEGMENT_ONLY ? 'Re-segment from existing data' : CUSTOMERS_ONLY ? 'Customers only' : 'Full extraction'}`);

  const dataDir = join(PROJECT_ROOT, 'data');
  const segmentsDir = join(dataDir, 'segments');
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(segmentsDir, { recursive: true });

  let customerRecords, abandonedRecords, abandonedOnlyEmails;

  if (SEGMENT_ONLY) {
    // Load from existing JSON
    const existing = JSON.parse(readFileSync(join(dataDir, 'customer-master-list.json'), 'utf8'));
    customerRecords = existing.customers;
    const existingAbandoned = JSON.parse(readFileSync(join(dataDir, 'abandoned-checkouts.json'), 'utf8'));
    abandonedRecords = existingAbandoned.checkouts;
    abandonedOnlyEmails = existingAbandoned.abandoned_only_emails || [];
    console.log(`Loaded ${customerRecords.length} customers and ${abandonedRecords.length} abandoned checkouts from disk`);
  } else {
    // Fetch product catalog for smokeshop identification
    const productMap = await fetchProductCatalog();

    // Fetch all customers
    const customers = await fetchAllCustomers();

    // Fetch all orders (unless customers-only mode)
    const orders = CUSTOMERS_ONLY ? [] : await fetchAllOrders();

    // Fetch all abandoned checkouts
    const abandonedCheckouts = CUSTOMERS_ONLY ? [] : await fetchAllAbandonedCheckouts();

    // Process and enrich data
    const processed = processData(customers, orders, abandonedCheckouts, productMap);
    customerRecords = processed.customerRecords;
    abandonedRecords = processed.abandonedRecords;
    abandonedOnlyEmails = processed.abandonedOnlyEmails;
  }

  // Build segments
  const segments = buildSegments(customerRecords, abandonedRecords);

  // ─── WRITE OUTPUT FILES ─────────────────────────────────────────────
  console.log('\n━━━ WRITING OUTPUT FILES ━━━');

  // 1. Master customer CSV
  const customerCsv = recordsToCsv(customerRecords);
  writeFileSync(join(dataDir, 'customer-master-list.csv'), customerCsv);
  console.log(`  ✓ data/customer-master-list.csv (${customerRecords.length} rows)`);

  // 2. Master customer JSON (includes line items)
  const customerJson = {
    extracted_at: new Date().toISOString(),
    store: config.shopify.storeUrl,
    total_customers: customerRecords.length,
    customers: customerRecords,
  };
  writeFileSync(join(dataDir, 'customer-master-list.json'), JSON.stringify(customerJson, null, 2));
  console.log(`  ✓ data/customer-master-list.json`);

  // 3. Abandoned checkouts CSV
  const abandonedCsv = recordsToCsv(abandonedRecords);
  writeFileSync(join(dataDir, 'abandoned-checkouts.csv'), abandonedCsv);
  console.log(`  ✓ data/abandoned-checkouts.csv (${abandonedRecords.length} rows)`);

  // 4. Abandoned checkouts JSON
  const abandonedJson = {
    extracted_at: new Date().toISOString(),
    store: config.shopify.storeUrl,
    total_abandoned: abandonedRecords.length,
    abandoned_only_emails: abandonedOnlyEmails,
    checkouts: abandonedRecords,
  };
  writeFileSync(join(dataDir, 'abandoned-checkouts.json'), JSON.stringify(abandonedJson, null, 2));
  console.log(`  ✓ data/abandoned-checkouts.json`);

  // 5. Segment CSV files
  for (const [name, segment] of Object.entries(segments)) {
    if (segment.records.length > 0) {
      const csv = recordsToCsv(segment.records);
      writeFileSync(join(segmentsDir, `${name}.csv`), csv);
    }
  }
  console.log(`  ✓ data/segments/ (${Object.keys(segments).length} segment files)`);

  // 6. Combined master email list (deduped: customers + abandoned-only)
  const allEmails = new Set();
  const masterEmailList = [];

  for (const c of customerRecords) {
    if (!allEmails.has(c.email)) {
      allEmails.add(c.email);
      masterEmailList.push({
        email: c.email,
        first_name: c.first_name,
        last_name: c.last_name,
        phone: c.phone,
        city: c.city,
        province: c.province,
        country: c.country,
        zip: c.zip,
        source: 'customer',
        total_spent: c.total_spent,
        order_count: c.order_count,
        bought_smokeshop: c.bought_smokeshop,
        marketing_consent: c.marketing_consent,
        accepts_marketing: c.accepts_marketing,
        segments: c.segments,
      });
    }
  }

  for (const a of abandonedRecords) {
    if (!allEmails.has(a.email)) {
      allEmails.add(a.email);
      masterEmailList.push({
        email: a.email,
        first_name: a.first_name,
        last_name: a.last_name,
        phone: a.phone,
        city: a.city,
        province: a.province,
        country: a.country,
        zip: a.zip,
        source: 'abandoned_checkout',
        total_spent: '0.00',
        order_count: 0,
        bought_smokeshop: 'no',
        marketing_consent: 'unknown',
        accepts_marketing: 'no',
        segments: a.has_smokeshop_items === 'yes' ? 'abandoned_smokeshop' : 'abandoned_cart',
      });
    }
  }

  const masterEmailCsv = recordsToCsv(masterEmailList);
  writeFileSync(join(dataDir, 'master-email-list.csv'), masterEmailCsv);
  console.log(`  ✓ data/master-email-list.csv (${masterEmailList.length} unique emails)`);

  // 7. Extraction report
  const report = {
    extracted_at: new Date().toISOString(),
    store: config.shopify.storeUrl,
    summary: {
      total_unique_emails: masterEmailList.length,
      total_customers: customerRecords.length,
      total_abandoned_checkouts: abandonedRecords.length,
      abandoned_only_emails: abandonedOnlyEmails.length,
      customers_with_orders: customerRecords.filter(c => c.order_count > 0).length,
      customers_without_orders: customerRecords.filter(c => c.order_count === 0).length,
      smokeshop_buyers: customerRecords.filter(c => c.bought_smokeshop === 'yes').length,
      smokeshop_abandoned: abandonedRecords.filter(a => a.has_smokeshop_items === 'yes').length,
      marketing_opted_in: customerRecords.filter(c => c.accepts_marketing === 'yes').length,
      marketing_not_opted_in: customerRecords.filter(c => c.accepts_marketing !== 'yes').length,
    },
    segments: Object.fromEntries(
      Object.entries(segments).map(([name, seg]) => [name, { description: seg.description, count: seg.count }])
    ),
    rfm_distribution: {
      score_0: customerRecords.filter(c => c.rfm_total === 0).length,
      score_1_3: customerRecords.filter(c => c.rfm_total >= 1 && c.rfm_total <= 3).length,
      score_4_6: customerRecords.filter(c => c.rfm_total >= 4 && c.rfm_total <= 6).length,
      score_7_9: customerRecords.filter(c => c.rfm_total >= 7 && c.rfm_total <= 9).length,
      score_10_12: customerRecords.filter(c => c.rfm_total >= 10 && c.rfm_total <= 12).length,
      score_13_15: customerRecords.filter(c => c.rfm_total >= 13 && c.rfm_total <= 15).length,
    },
    top_smokeshop_products: (() => {
      const freq = {};
      customerRecords.forEach(c => {
        if (c.smokeshop_products) {
          c.smokeshop_products.split(' | ').forEach(p => {
            if (p) freq[p] = (freq[p] || 0) + 1;
          });
        }
      });
      return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([product, count]) => ({ product, buyers: count }));
    })(),
    compliance_notes: {
      can_spam: 'CAN-SPAM allows emailing customers with transactional relationship. Must include unsubscribe link and physical mailing address in all commercial emails.',
      opted_in_count: customerRecords.filter(c => c.accepts_marketing === 'yes').length,
      not_opted_in_count: customerRecords.filter(c => c.accepts_marketing !== 'yes').length,
      recommendation: 'Use opted-in contacts for promotional campaigns. Use transactional contacts for win-back/re-engagement flows with opt-in request. Shopify Email will enforce consent rules automatically.',
    },
    output_files: [
      'data/customer-master-list.csv - All customers with full data',
      'data/customer-master-list.json - All customers with order line items',
      'data/abandoned-checkouts.csv - All abandoned checkout records',
      'data/abandoned-checkouts.json - Abandoned checkouts with detail',
      'data/master-email-list.csv - Deduped master list (customers + abandoned-only)',
      'data/segments/*.csv - Individual segment files for targeted campaigns',
    ],
  };

  writeFileSync(join(dataDir, 'extraction-report.json'), JSON.stringify(report, null, 2));
  console.log(`  ✓ data/extraction-report.json`);

  // ─── PRINT SUMMARY ───────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║   EXTRACTION COMPLETE                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`\n  Total unique emails:       ${report.summary.total_unique_emails}`);
  console.log(`  Customer accounts:         ${report.summary.total_customers}`);
  console.log(`    ├─ With orders:          ${report.summary.customers_with_orders}`);
  console.log(`    └─ No orders:            ${report.summary.customers_without_orders}`);
  console.log(`  Abandoned checkouts:       ${report.summary.total_abandoned_checkouts}`);
  console.log(`    └─ New leads (no acct):  ${report.summary.abandoned_only_emails}`);
  console.log(`  Smokeshop buyers:          ${report.summary.smokeshop_buyers}`);
  console.log(`  Smokeshop abandoned:       ${report.summary.smokeshop_abandoned}`);
  console.log(`  Marketing opted in:        ${report.summary.marketing_opted_in}`);
  console.log(`  Not opted in:              ${report.summary.marketing_not_opted_in}`);

  console.log('\n  Key segments for smokeshop launch campaign:');
  const keySeg = ['smokeshop_buyers', 'smokeshop_high_value', 'smokeshop_repeat',
    'smokeshop_abandoned', 'abandoned_smokeshop_new', 'vip_customers', 'at_risk'];
  for (const name of keySeg) {
    if (segments[name]) {
      console.log(`    ${name.padEnd(30)} ${segments[name].count} contacts`);
    }
  }

  console.log('\n  Output directory: data/');
  console.log('  All files ready for import into Shopify, Klaviyo, or any marketing platform.');
  console.log('');
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err.message);
  console.error(err.stack);
  process.exit(1);
});
