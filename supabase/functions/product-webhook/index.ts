/**
 * Supabase Edge Function: Product Webhook Handler
 *
 * Receives Shopify product webhooks (create/update/delete)
 * and triggers auto-classification.
 *
 * Deploy:
 *   supabase functions deploy product-webhook
 *
 * Register webhook in Shopify:
 *   POST /admin/api/2024-01/webhooks.json
 *   {
 *     "webhook": {
 *       "topic": "products/create",
 *       "address": "https://iezzvdftbcboychqlaav.supabase.co/functions/v1/product-webhook",
 *       "format": "json"
 *     }
 *   }
 *   (Repeat for products/update and products/delete)
 *
 * Set these secrets:
 *   supabase secrets set SHOPIFY_WEBHOOK_SECRET=your_secret
 *   supabase secrets set SHOPIFY_STORE_URL=oil-slick-pad.myshopify.com
 *   supabase secrets set SHOPIFY_ACCESS_TOKEN=shpat_xxx
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.208.0/node/crypto.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SHOPIFY_WEBHOOK_SECRET = Deno.env.get('SHOPIFY_WEBHOOK_SECRET') || '';
const SHOPIFY_STORE_URL = Deno.env.get('SHOPIFY_STORE_URL') || '';
const SHOPIFY_ACCESS_TOKEN = Deno.env.get('SHOPIFY_ACCESS_TOKEN') || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ============================================================
// HMAC VERIFICATION
// ============================================================

function verifyWebhook(body: string, hmacHeader: string): boolean {
  if (!SHOPIFY_WEBHOOK_SECRET) return true; // Skip if not configured
  const hash = createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('base64');
  return hash === hmacHeader;
}

// ============================================================
// PRODUCT SYNC
// ============================================================

async function syncProduct(product: any) {
  const tags = (product.tags || '')
    .split(',')
    .map((t: string) => t.trim())
    .filter((t: string) => t);

  const prices = (product.variants || [])
    .map((v: any) => parseFloat(v.price))
    .filter((p: number) => !isNaN(p));

  const { error } = await supabase.from('product_sync').upsert(
    {
      shopify_id: product.id,
      title: product.title,
      vendor: product.vendor,
      product_type: product.product_type,
      tags,
      handle: product.handle,
      status: product.status,
      price_min: prices.length > 0 ? Math.min(...prices) : null,
      price_max: prices.length > 0 ? Math.max(...prices) : null,
      synced_at: new Date().toISOString(),
      shopify_updated_at: product.updated_at,
    },
    { onConflict: 'shopify_id' }
  );

  if (error) throw new Error(`Sync failed: ${error.message}`);
}

// ============================================================
// CLASSIFICATION ENGINE (lightweight version for Edge Function)
// ============================================================

function matchesConditions(product: any, conditions: any): boolean {
  const title = product.title || '';
  const titleLower = title.toLowerCase();
  const tags: string[] = (product.tags || '')
    .split(',')
    .map((t: string) => t.trim())
    .filter((t: string) => t);
  const vendor = product.vendor || '';

  if (conditions.title_contains_any) {
    if (!conditions.title_contains_any.some((kw: string) => titleLower.includes(kw.toLowerCase()))) return false;
  }
  if (conditions.title_contains) {
    if (!conditions.title_contains.every((kw: string) => titleLower.includes(kw.toLowerCase()))) return false;
  }
  if (conditions.title_not_contains) {
    if (conditions.title_not_contains.some((kw: string) => titleLower.includes(kw.toLowerCase()))) return false;
  }
  if (conditions.title_matches_any) {
    if (!conditions.title_matches_any.some((p: string) => {
      try { return new RegExp(p, 'i').test(title); } catch { return false; }
    })) return false;
  }
  if (conditions.tags_include) {
    if (!conditions.tags_include.every((tag: string) => tags.includes(tag))) return false;
  }
  if (conditions.tags_exclude) {
    if (conditions.tags_exclude.some((tag: string) => tags.includes(tag))) return false;
  }
  if (conditions.vendor_equals && vendor !== conditions.vendor_equals) return false;
  if (conditions.vendor_not_equals && vendor === conditions.vendor_not_equals) return false;

  return true;
}

async function classifyProduct(product: any): Promise<any> {
  // Get active rules
  const { data: rules, error } = await supabase
    .from('classification_rules')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: true });

  if (error || !rules) {
    throw new Error(`Failed to load rules: ${error?.message}`);
  }

  const currentTags: string[] = (product.tags || '')
    .split(',')
    .map((t: string) => t.trim())
    .filter((t: string) => t);

  const matchedRules = rules.filter((rule: any) => matchesConditions(product, rule.conditions));

  if (matchedRules.length === 0) {
    return { changed: false, matchedRules: [] };
  }

  // Compute tag changes
  const tagsToAdd = new Set<string>();
  const tagsToRemove = new Set<string>();

  for (const rule of matchedRules) {
    for (const tag of rule.apply_tags || []) {
      if (!currentTags.includes(tag)) tagsToAdd.add(tag);
    }
    for (const tag of rule.remove_tags || []) {
      if (currentTags.includes(tag)) tagsToRemove.add(tag);
    }
  }

  if (tagsToAdd.size === 0 && tagsToRemove.size === 0) {
    return { changed: false, matchedRules, alreadyCorrect: true };
  }

  // Build new tags
  const newTags = [
    ...currentTags.filter((t: string) => !tagsToRemove.has(t)),
    ...tagsToAdd,
  ];

  // Update Shopify product
  const shopifyUrl = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/products/${product.id}.json`;
  const res = await fetch(shopifyUrl, {
    method: 'PUT',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ product: { tags: newTags.join(', ') } }),
  });

  if (!res.ok) {
    throw new Error(`Shopify update failed: ${res.status} ${await res.text()}`);
  }

  // Update product in Supabase
  await supabase
    .from('product_sync')
    .update({
      tags: newTags,
      classification_status: 'auto-tagged',
      last_classified_at: new Date().toISOString(),
      classification_rules_applied: matchedRules.map((r: any) => r.id),
    })
    .eq('shopify_id', product.id);

  // Audit log
  await supabase.from('audit_log').insert({
    action: 'product_classified',
    target_type: 'product',
    target_id: String(product.id),
    target_title: product.title,
    details: {
      tags_added: [...tagsToAdd],
      tags_removed: [...tagsToRemove],
      rules_matched: matchedRules.map((r: any) => r.rule_name),
      trigger: 'webhook',
    },
    triggered_by: 'webhook',
    previous_state: { tags: currentTags },
  });

  return {
    changed: true,
    tagsAdded: [...tagsToAdd],
    tagsRemoved: [...tagsToRemove],
    rulesMatched: matchedRules.map((r: any) => r.rule_name),
  };
}

// ============================================================
// EDGE FUNCTION HANDLER
// ============================================================

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const body = await req.text();

  // Verify HMAC
  const hmac = req.headers.get('X-Shopify-Hmac-Sha256') || '';
  if (!verifyWebhook(body, hmac)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const topic = req.headers.get('X-Shopify-Topic') || 'unknown';
  let product: any;

  try {
    product = JSON.parse(body);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Log the webhook
  const { data: webhookLog } = await supabase.from('webhook_log').insert({
    topic,
    shopify_id: product.id,
    payload: product,
    processed: false,
  }).select('id').single();

  try {
    let result: any = {};

    if (topic === 'products/delete') {
      // Mark product as deleted in sync table
      await supabase
        .from('product_sync')
        .update({ status: 'archived' })
        .eq('shopify_id', product.id);

      result = { action: 'archived' };
    } else {
      // Sync product data
      await syncProduct(product);

      // Run classification
      result = await classifyProduct(product);
    }

    // Mark webhook as processed
    if (webhookLog?.id) {
      await supabase
        .from('webhook_log')
        .update({ processed: true, result })
        .eq('id', webhookLog.id);
    }

    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';

    // Log failure
    if (webhookLog?.id) {
      await supabase
        .from('webhook_log')
        .update({ processed: true, result: { error: errorMsg } })
        .eq('id', webhookLog.id);
    }

    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
