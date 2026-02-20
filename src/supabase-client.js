// ============================================================================
// Supabase Persistence Layer
// Stores recovery session history, discount codes issued, and A/B test results
// across engine runs. Enables discount rate-limiting enforcement and
// long-running experiment tracking.
//
// Expects env vars: SUPABASE_URL, SUPABASE_SERVICE_KEY
//
// On first run, auto-creates required tables if they don't exist.
// ============================================================================

import { execSync } from 'child_process';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ACCESS_TOKEN;

function supabaseEnabled() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

/**
 * Makes a REST request to Supabase PostgREST API.
 */
function supabaseRequest(path, method = 'GET', body = null, extraHeaders = {}) {
  if (!supabaseEnabled()) return null;

  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  let curlCmd = `curl -s --max-time 15 -X ${method} "${url}" `;
  curlCmd += `-H "apikey: ${SUPABASE_KEY}" `;
  curlCmd += `-H "Authorization: Bearer ${SUPABASE_KEY}" `;
  curlCmd += `-H "Content-Type: application/json" `;
  curlCmd += `-H "Prefer: return=representation" `;

  for (const [key, val] of Object.entries(extraHeaders)) {
    curlCmd += `-H "${key}: ${val}" `;
  }

  if (body) {
    const escaped = JSON.stringify(body).replace(/'/g, "'\\''");
    curlCmd += `-d '${escaped}'`;
  }

  try {
    const result = execSync(curlCmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    if (!result || result.trim() === '') return null;
    return JSON.parse(result);
  } catch (error) {
    console.error(`  Supabase error (${method} ${path}): ${error.message}`);
    return null;
  }
}

/**
 * Creates tables via Supabase SQL endpoint (RPC).
 */
async function ensureTables() {
  if (!supabaseEnabled()) return;

  const sql = `
    CREATE TABLE IF NOT EXISTS cart_recovery_sessions (
      id SERIAL PRIMARY KEY,
      checkout_id BIGINT NOT NULL,
      customer_email TEXT,
      customer_id BIGINT,
      cart_value NUMERIC(10,2),
      cart_category TEXT,
      customer_segment TEXT,
      sequence_position INTEGER,
      email_id TEXT,
      discount_code TEXT,
      discount_percent NUMERIC(5,2),
      status TEXT DEFAULT 'sent',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cart_discount_codes (
      id SERIAL PRIMARY KEY,
      customer_email TEXT NOT NULL,
      customer_id BIGINT,
      discount_code TEXT NOT NULL,
      discount_percent NUMERIC(5,2),
      cart_category TEXT,
      redeemed BOOLEAN DEFAULT FALSE,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cart_ab_test_results (
      id SERIAL PRIMARY KEY,
      test_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      checkout_id BIGINT,
      value NUMERIC(10,2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_recovery_checkout ON cart_recovery_sessions(checkout_id);
    CREATE INDEX IF NOT EXISTS idx_recovery_email ON cart_recovery_sessions(customer_email);
    CREATE INDEX IF NOT EXISTS idx_discount_email ON cart_discount_codes(customer_email);
    CREATE INDEX IF NOT EXISTS idx_ab_test ON cart_ab_test_results(test_id, variant_id);
  `;

  // Use Supabase SQL RPC
  const url = `${SUPABASE_URL}/rest/v1/rpc/exec_sql`;
  let curlCmd = `curl -s --max-time 30 -X POST "${url}" `;
  curlCmd += `-H "apikey: ${SUPABASE_KEY}" `;
  curlCmd += `-H "Authorization: Bearer ${SUPABASE_KEY}" `;
  curlCmd += `-H "Content-Type: application/json" `;
  const escaped = JSON.stringify({ query: sql }).replace(/'/g, "'\\''");
  curlCmd += `-d '${escaped}'`;

  try {
    execSync(curlCmd, { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 });
    console.log('  Supabase tables verified.');
  } catch {
    // Tables may already exist or RPC may not be set up — that's fine.
    // The REST endpoints will work if tables exist.
    console.log('  Supabase: tables assumed to exist (create manually if needed).');
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export const supabase = {

  enabled: supabaseEnabled(),

  /**
   * Initialize — verify connection and create tables if needed.
   */
  async init() {
    if (!supabaseEnabled()) {
      console.log('  Supabase: not configured (set SUPABASE_URL + SUPABASE_SERVICE_KEY to enable persistence)');
      return false;
    }
    console.log('  Supabase: connected to', SUPABASE_URL);
    await ensureTables();
    return true;
  },

  // ────────────────────────────────────────────────────────────────────────
  // RECOVERY SESSIONS
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Records a recovery action (email sent, discount created, etc.)
   */
  logRecoverySession(data) {
    return supabaseRequest('cart_recovery_sessions', 'POST', {
      checkout_id: data.checkoutId,
      customer_email: data.email,
      customer_id: data.customerId,
      cart_value: data.cartValue,
      cart_category: data.cartCategory,
      customer_segment: data.customerSegment,
      sequence_position: data.sequencePosition,
      email_id: data.emailId,
      discount_code: data.discountCode,
      discount_percent: data.discountPercent,
      status: data.status || 'sent',
    });
  },

  /**
   * Checks if a recovery email has already been sent for this checkout at this sequence position.
   * Prevents duplicate sends across engine runs.
   */
  hasAlreadySent(checkoutId, emailId) {
    const result = supabaseRequest(
      `cart_recovery_sessions?checkout_id=eq.${checkoutId}&email_id=eq.${emailId}&select=id`,
      'GET'
    );
    return Array.isArray(result) && result.length > 0;
  },

  /**
   * Gets all recovery sessions for a specific checkout.
   */
  getSessionsForCheckout(checkoutId) {
    const raw = supabaseRequest(
      `cart_recovery_sessions?checkout_id=eq.${checkoutId}&order=created_at.asc`,
      'GET'
    );
    return Array.isArray(raw) ? raw : [];
  },

  // ────────────────────────────────────────────────────────────────────────
  // DISCOUNT RATE LIMITING
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Records a discount code issued to a customer.
   */
  logDiscountCode(data) {
    return supabaseRequest('cart_discount_codes', 'POST', {
      customer_email: data.email,
      customer_id: data.customerId,
      discount_code: data.code,
      discount_percent: data.discountPercent,
      cart_category: data.cartCategory,
      expires_at: data.expiresAt,
    });
  },

  /**
   * Checks if a customer is eligible for a new discount code
   * based on rate limits (max 2/month, 4/quarter, 30-day cooldown after redemption).
   */
  checkDiscountEligibility(email, rateLimits) {
    if (!email || !supabaseEnabled()) return true;

    // Count codes issued in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const rawMonth = supabaseRequest(
      `cart_discount_codes?customer_email=eq.${encodeURIComponent(email)}&created_at=gte.${thirtyDaysAgo}&select=id`,
      'GET'
    );
    const monthCodes = Array.isArray(rawMonth) ? rawMonth : [];

    if (monthCodes.length >= (rateLimits?.maxDiscountCodesPerMonth || 2)) {
      return false;
    }

    // Count codes issued in last 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const rawQuarter = supabaseRequest(
      `cart_discount_codes?customer_email=eq.${encodeURIComponent(email)}&created_at=gte.${ninetyDaysAgo}&select=id`,
      'GET'
    );
    const quarterCodes = Array.isArray(rawQuarter) ? rawQuarter : [];

    if (quarterCodes.length >= (rateLimits?.maxDiscountCodesPerQuarter || 4)) {
      return false;
    }

    // Check for recent redemption (cooldown)
    const cooldownDays = rateLimits?.cooldownAfterRedemption || 30;
    const cooldownDate = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000).toISOString();
    const rawRedeemed = supabaseRequest(
      `cart_discount_codes?customer_email=eq.${encodeURIComponent(email)}&redeemed=eq.true&created_at=gte.${cooldownDate}&select=id`,
      'GET'
    );
    const redeemed = Array.isArray(rawRedeemed) ? rawRedeemed : [];

    if (redeemed.length > 0) {
      return false;
    }

    return true;
  },

  // ────────────────────────────────────────────────────────────────────────
  // A/B TEST PERSISTENCE
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Records an A/B test event.
   */
  logABTestEvent(testId, variantId, eventType, checkoutId = null, value = 0) {
    return supabaseRequest('cart_ab_test_results', 'POST', {
      test_id: testId,
      variant_id: variantId,
      event_type: eventType,
      checkout_id: checkoutId,
      value,
    });
  },

  /**
   * Fetches aggregated A/B test results for all tests.
   * Returns { testId: { variantId: { impressions, opens, clicks, conversions, revenue } } }
   */
  getABTestResults() {
    const raw = supabaseRequest(
      'cart_ab_test_results?select=test_id,variant_id,event_type,value',
      'GET'
    );
    const results = Array.isArray(raw) ? raw : [];

    const aggregated = {};

    for (const row of results) {
      if (!aggregated[row.test_id]) aggregated[row.test_id] = {};
      if (!aggregated[row.test_id][row.variant_id]) {
        aggregated[row.test_id][row.variant_id] = {
          impressions: 0, opens: 0, clicks: 0, conversions: 0, revenue: 0,
        };
      }

      const v = aggregated[row.test_id][row.variant_id];
      switch (row.event_type) {
        case 'impression':
        case 'send':
          v.impressions++;
          break;
        case 'open':
          v.opens++;
          break;
        case 'click':
          v.clicks++;
          break;
        case 'conversion':
          v.conversions++;
          v.revenue += parseFloat(row.value || 0);
          break;
      }
    }

    return aggregated;
  },

  // ────────────────────────────────────────────────────────────────────────
  // ANALYTICS QUERIES
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Gets recovery session stats for a time period.
   */
  getRecoveryStats(days = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const raw = supabaseRequest(
      `cart_recovery_sessions?created_at=gte.${since}&order=created_at.desc`,
      'GET'
    );
    return Array.isArray(raw) ? raw : [];
  },

  /**
   * Gets discount code usage stats.
   */
  getDiscountStats(days = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const raw = supabaseRequest(
      `cart_discount_codes?created_at=gte.${since}&order=created_at.desc`,
      'GET'
    );
    return Array.isArray(raw) ? raw : [];
  },
};

export default supabase;
