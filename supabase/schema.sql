-- ============================================================
-- Oil Slick Shopify Store - Supabase Schema
-- Run this in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/iezzvdftbcboychqlaav/sql
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. CLASSIFICATION RULES
--    The brain of the auto-tagger. Each rule defines
--    conditions to match products and tags to apply/remove.
-- ============================================================
CREATE TABLE classification_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_name TEXT NOT NULL,
  description TEXT,
  priority INT NOT NULL DEFAULT 100,  -- Lower = runs first

  -- Conditions (ALL must match for rule to fire)
  conditions JSONB NOT NULL DEFAULT '{}',
  -- Example:
  -- {
  --   "title_contains": ["banger"],
  --   "title_not_contains": ["rig", "hanger", "display"],
  --   "tags_include": ["pillar:accessory"],
  --   "tags_exclude": ["Wholesale Quantity"],
  --   "vendor_equals": "What You Need"
  -- }

  -- Actions
  apply_tags TEXT[] NOT NULL DEFAULT '{}',
  remove_tags TEXT[] NOT NULL DEFAULT '{}',

  -- Metadata
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rules_active ON classification_rules(active, priority);

-- ============================================================
-- 2. COLLECTION DEFINITIONS
--    Source of truth for what collections should look like.
--    Health monitor compares Shopify state against this.
-- ============================================================
CREATE TABLE collection_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shopify_id BIGINT UNIQUE,
  title TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,

  -- Expected rules
  rules JSONB NOT NULL DEFAULT '[]',
  disjunctive BOOLEAN NOT NULL DEFAULT false,
  sort_order TEXT NOT NULL DEFAULT 'price-asc',

  -- Menu placement
  menu_location TEXT,  -- e.g. "extraction-packaging", "smoke-vape", "accessories", "brands"
  menu_position INT,   -- ordering within the menu

  -- Health thresholds
  min_expected_products INT DEFAULT 0,
  max_expected_products INT DEFAULT 10000,

  -- Metadata
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collections_handle ON collection_definitions(handle);
CREATE INDEX idx_collections_menu ON collection_definitions(menu_location);

-- ============================================================
-- 3. PRODUCT SYNC
--    Lightweight mirror of Shopify products for quick lookups,
--    classification tracking, and change detection.
-- ============================================================
CREATE TABLE product_sync (
  shopify_id BIGINT PRIMARY KEY,
  title TEXT NOT NULL,
  vendor TEXT,
  product_type TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  handle TEXT,
  status TEXT DEFAULT 'active',
  price_min NUMERIC(10,2),
  price_max NUMERIC(10,2),

  -- Classification tracking
  classification_status TEXT NOT NULL DEFAULT 'unclassified',
    -- 'unclassified' | 'auto-tagged' | 'manually-tagged' | 'needs-review'
  last_classified_at TIMESTAMPTZ,
  classification_rules_applied UUID[] DEFAULT '{}',

  -- Sync metadata
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  shopify_updated_at TIMESTAMPTZ
);

CREATE INDEX idx_products_vendor ON product_sync(vendor);
CREATE INDEX idx_products_status ON product_sync(classification_status);
CREATE INDEX idx_products_tags ON product_sync USING GIN(tags);

-- ============================================================
-- 4. AUDIT LOG
--    Records every change made by the system.
--    Enables rollback and debugging.
-- ============================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action TEXT NOT NULL,
    -- 'tags_added', 'tags_removed', 'product_classified',
    -- 'collection_updated', 'collection_created', 'collection_deleted',
    -- 'menu_updated', 'health_check_passed', 'health_check_failed'
  target_type TEXT NOT NULL,  -- 'product', 'collection', 'menu', 'system'
  target_id TEXT,             -- Shopify ID or handle
  target_title TEXT,

  -- Change details
  details JSONB NOT NULL DEFAULT '{}',
  -- Example for tag change:
  -- { "added": ["family:banger"], "removed": ["family:glass-rig"], "rule_id": "..." }

  -- Previous state (for rollback)
  previous_state JSONB,

  -- Source
  triggered_by TEXT NOT NULL DEFAULT 'manual',
    -- 'manual', 'auto-tagger', 'health-monitor', 'webhook', 'sync'

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_target ON audit_log(target_type, target_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- ============================================================
-- 5. HEALTH CHECK RESULTS
--    Stores results of periodic health checks.
-- ============================================================
CREATE TABLE health_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  check_type TEXT NOT NULL,  -- 'collection_rules', 'product_counts', 'tag_consistency'
  status TEXT NOT NULL,      -- 'pass', 'warn', 'fail'
  details JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_health_created ON health_checks(created_at DESC);
CREATE INDEX idx_health_status ON health_checks(status);

-- ============================================================
-- 6. WEBHOOK LOG
--    Tracks incoming Shopify webhooks.
-- ============================================================
CREATE TABLE webhook_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  topic TEXT NOT NULL,        -- 'products/create', 'products/update', etc.
  shopify_id BIGINT,
  payload JSONB,
  processed BOOLEAN NOT NULL DEFAULT false,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_processed ON webhook_log(processed, created_at);

-- ============================================================
-- 7. AUTO-UPDATED TIMESTAMPS
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_classification_rules_timestamp
  BEFORE UPDATE ON classification_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_collection_definitions_timestamp
  BEFORE UPDATE ON collection_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 8. ROW LEVEL SECURITY (basic - open for service role)
-- ============================================================
ALTER TABLE classification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_sync ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_log ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access" ON classification_rules FOR ALL USING (true);
CREATE POLICY "Service role full access" ON collection_definitions FOR ALL USING (true);
CREATE POLICY "Service role full access" ON product_sync FOR ALL USING (true);
CREATE POLICY "Service role full access" ON audit_log FOR ALL USING (true);
CREATE POLICY "Service role full access" ON health_checks FOR ALL USING (true);
CREATE POLICY "Service role full access" ON webhook_log FOR ALL USING (true);

-- ============================================================
-- 9. USEFUL VIEWS
-- ============================================================

-- Products that need review
CREATE VIEW products_needing_review AS
SELECT shopify_id, title, vendor, tags, classification_status, synced_at
FROM product_sync
WHERE classification_status IN ('unclassified', 'needs-review')
ORDER BY synced_at DESC;

-- Recent audit activity
CREATE VIEW recent_activity AS
SELECT action, target_type, target_title, details, triggered_by, created_at
FROM audit_log
ORDER BY created_at DESC
LIMIT 100;

-- Collection health summary
CREATE VIEW collection_health AS
SELECT
  cd.title,
  cd.handle,
  cd.menu_location,
  cd.min_expected_products,
  cd.max_expected_products,
  cd.active,
  (SELECT COUNT(*) FROM product_sync ps
   WHERE ps.tags && cd.rules::text[]
  ) AS estimated_products
FROM collection_definitions cd
WHERE cd.active = true
ORDER BY cd.menu_location, cd.menu_position;
