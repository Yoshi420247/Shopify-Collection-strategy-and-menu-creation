/**
 * Supabase Client
 *
 * Central client for all Supabase operations.
 * Uses the service role key for full access.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  console.error('See .env.example for required values.');
  process.exit(1);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false }
});

// ============================================================
// AUDIT LOG HELPERS
// ============================================================

export async function logAudit(action, targetType, targetId, targetTitle, details = {}, triggeredBy = 'manual', previousState = null) {
  const { error } = await supabase.from('audit_log').insert({
    action,
    target_type: targetType,
    target_id: String(targetId),
    target_title: targetTitle,
    details,
    triggered_by: triggeredBy,
    previous_state: previousState
  });

  if (error) {
    console.error('Audit log error:', error.message);
  }
}

// ============================================================
// CLASSIFICATION RULES
// ============================================================

export async function getActiveRules() {
  const { data, error } = await supabase
    .from('classification_rules')
    .select('*')
    .eq('active', true)
    .order('priority', { ascending: true });

  if (error) throw new Error(`Failed to fetch rules: ${error.message}`);
  return data;
}

// ============================================================
// PRODUCT SYNC
// ============================================================

export async function upsertProduct(product) {
  const tags = (product.tags || '').split(',').map(t => t.trim()).filter(t => t);
  const prices = (product.variants || []).map(v => parseFloat(v.price)).filter(p => !isNaN(p));

  const { error } = await supabase.from('product_sync').upsert({
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
    shopify_updated_at: product.updated_at
  }, { onConflict: 'shopify_id' });

  if (error) throw new Error(`Failed to upsert product ${product.id}: ${error.message}`);
}

export async function getProduct(shopifyId) {
  const { data, error } = await supabase
    .from('product_sync')
    .select('*')
    .eq('shopify_id', shopifyId)
    .single();

  if (error) return null;
  return data;
}

export async function markClassified(shopifyId, ruleIds, status = 'auto-tagged') {
  const { error } = await supabase
    .from('product_sync')
    .update({
      classification_status: status,
      last_classified_at: new Date().toISOString(),
      classification_rules_applied: ruleIds
    })
    .eq('shopify_id', shopifyId);

  if (error) throw new Error(`Failed to mark classified ${shopifyId}: ${error.message}`);
}

// ============================================================
// COLLECTION DEFINITIONS
// ============================================================

export async function getCollectionDefinitions() {
  const { data, error } = await supabase
    .from('collection_definitions')
    .select('*')
    .eq('active', true)
    .order('menu_location')
    .order('menu_position');

  if (error) throw new Error(`Failed to fetch collections: ${error.message}`);
  return data;
}

// ============================================================
// HEALTH CHECKS
// ============================================================

export async function logHealthCheck(checkType, status, details) {
  const { error } = await supabase.from('health_checks').insert({
    check_type: checkType,
    status,
    details
  });

  if (error) {
    console.error('Health check log error:', error.message);
  }
}

export default supabase;
