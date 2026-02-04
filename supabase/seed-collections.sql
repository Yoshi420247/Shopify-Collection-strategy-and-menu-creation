-- ============================================================
-- SEED DATA: Collection Definitions (Source of Truth)
-- Migrated from config.js + current Shopify state
-- Run AFTER schema.sql
-- ============================================================

-- ============================================================
-- EXTRACTION & PACKAGING COLLECTIONS
-- ============================================================
INSERT INTO collection_definitions (title, handle, rules, disjunctive, sort_order, menu_location, menu_position, min_expected_products) VALUES
('Extraction & Packaging', 'extraction-packaging', '[{"column":"tag","relation":"equals","condition":"pillar:packaging"}]', true, 'price-asc', 'extraction-packaging', 0, 20),
('Silicone Pads & Mats', 'silicone-pads', '[{"column":"tag","relation":"equals","condition":"Silicone Pad"},{"column":"tag","relation":"equals","condition":"dabpad"},{"column":"tag","relation":"equals","condition":"Dab Pads"}]', true, 'price-asc', 'extraction-packaging', 1, 1),
('FEP Sheets & Rolls', 'fep-sheets', '[{"column":"tag","relation":"equals","condition":"material:fep"}]', false, 'price-asc', 'extraction-packaging', 2, 1),
('PTFE Sheets & Rolls', 'ptfe-sheets', '[{"column":"tag","relation":"equals","condition":"material:ptfe"}]', false, 'price-asc', 'extraction-packaging', 3, 1),
('Parchment Paper', 'parchment-paper', '[{"column":"tag","relation":"equals","condition":"paper"},{"column":"title","relation":"contains","condition":"parchment"}]', true, 'price-asc', 'extraction-packaging', 4, 1),
('Glass Jars', 'glass-jars', '[{"column":"tag","relation":"equals","condition":"category:glass-jar"},{"column":"tag","relation":"equals","condition":"category:jar"},{"column":"type","relation":"equals","condition":"Glass Jar"}]', true, 'price-asc', 'extraction-packaging', 5, 1),
('Concentrate Containers', 'concentrate-containers', '[{"column":"tag","relation":"equals","condition":"category:concentrate-container"},{"column":"tag","relation":"equals","condition":"category:container"},{"column":"tag","relation":"equals","condition":"use:storage"}]', true, 'price-asc', 'extraction-packaging', 6, 1),
('Storage & Containers', 'storage-containers', '[{"column":"tag","relation":"equals","condition":"use:storage"}]', false, 'price-asc', 'extraction-packaging', 7, 1),
('Rosin Extraction Materials', 'rosin-extraction', '[{"column":"tag","relation":"equals","condition":"family:extraction-supply"}]', false, 'price-asc', 'extraction-packaging', 8, 1),
('Custom Packaging and Branded Services', 'custom-packaging-options', '[{"column":"title","relation":"contains","condition":"custom"},{"column":"tag","relation":"equals","condition":"custom"}]', true, 'price-asc', 'extraction-packaging', 9, 1);

-- ============================================================
-- SMOKE & VAPE COLLECTIONS
-- ============================================================
INSERT INTO collection_definitions (title, handle, rules, disjunctive, sort_order, menu_location, menu_position, min_expected_products) VALUES
('Smoke & Vape', 'smoke-and-vape', '[{"column":"tag","relation":"equals","condition":"pillar:smokeshop-device"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'smoke-vape', 0, 500),
('Bongs & Water Pipes', 'bongs-water-pipes', '[{"column":"tag","relation":"equals","condition":"family:glass-bong"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'smoke-vape', 1, 50),
('Dab Rigs', 'dab-rigs', '[{"column":"tag","relation":"equals","condition":"family:glass-rig"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'smoke-vape', 2, 50),
('Hand Pipes', 'hand-pipes', '[{"column":"tag","relation":"equals","condition":"family:spoon-pipe"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'smoke-vape', 3, 50),
('Bubblers', 'bubblers', '[{"column":"tag","relation":"equals","condition":"family:bubbler"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'smoke-vape', 4, 10),
('Nectar Collectors', 'nectar-collectors', '[{"column":"tag","relation":"equals","condition":"family:nectar-collector"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'smoke-vape', 5, 10),
('One Hitters & Chillums', 'one-hitters-chillums', '[{"column":"tag","relation":"equals","condition":"family:chillum-onehitter"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'smoke-vape', 6, 5),
('Steamrollers', 'steamrollers', '[{"column":"tag","relation":"equals","condition":"family:steamroller"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'smoke-vape', 7, 1),
('Silicone Pipes', 'silicone-pipes', '[{"column":"tag","relation":"equals","condition":"material:silicone"},{"column":"tag","relation":"equals","condition":"pillar:smokeshop-device"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'smoke-vape', 8, 20),
('Novelty & Character Pipes', 'novelty-character-pipes', '[{"column":"tag","relation":"equals","condition":"family:character-pipe"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'smoke-vape', 9, 50);

-- ============================================================
-- ACCESSORY COLLECTIONS
-- ============================================================
INSERT INTO collection_definitions (title, handle, rules, disjunctive, sort_order, menu_location, menu_position, min_expected_products) VALUES
('Accessories', 'accessories', '[{"column":"tag","relation":"equals","condition":"pillar:accessory"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'accessories', 0, 100),
('Quartz Bangers', 'quartz-bangers', '[{"column":"tag","relation":"equals","condition":"family:banger"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'accessories', 1, 5),
('Carb Caps', 'carb-caps', '[{"column":"tag","relation":"equals","condition":"family:carb-cap"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'accessories', 2, 5),
('Dab Tools', 'dab-tools', '[{"column":"tag","relation":"equals","condition":"family:dab-tool"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'accessories', 3, 5),
('Torches', 'torches', '[{"column":"tag","relation":"equals","condition":"family:torch"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'accessories', 4, 3),
('Flower Bowls', 'flower-bowls', '[{"column":"tag","relation":"equals","condition":"family:flower-bowl"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'accessories', 5, 5),
('Ash Catchers', 'ash-catchers', '[{"column":"tag","relation":"equals","condition":"family:ash-catcher"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'accessories', 6, 1),
('Grinders', 'grinders', '[{"column":"tag","relation":"equals","condition":"family:grinder"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'accessories', 7, 3),
('Rolling Papers & Cones', 'rolling-papers-cones', '[{"column":"tag","relation":"equals","condition":"family:rolling-paper"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'accessories', 8, 20),
('Downstems', 'downstems', '[{"column":"tag","relation":"equals","condition":"family:downstem"},{"column":"tag","relation":"not_equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'accessories', 9, 1);

-- ============================================================
-- BRAND COLLECTIONS
-- ============================================================
INSERT INTO collection_definitions (title, handle, rules, disjunctive, sort_order, menu_location, menu_position, min_expected_products) VALUES
('Zig Zag', 'zig-zag', '[{"column":"tag","relation":"equals","condition":"brand:zig-zag"}]', true, 'price-asc', 'brands', 1, 1),
('Vibes', 'vibes', '[{"column":"tag","relation":"equals","condition":"brand:vibes"}]', true, 'price-asc', 'brands', 2, 1),
('Cookies', 'cookies', '[{"column":"tag","relation":"equals","condition":"brand:cookies"}]', true, 'price-asc', 'brands', 3, 1),
('Maven', 'maven', '[{"column":"tag","relation":"equals","condition":"brand:maven"}]', true, 'price-asc', 'brands', 4, 1),
('Puffco', 'puffco', '[{"column":"tag","relation":"equals","condition":"brand:puffco"}]', true, 'price-asc', 'brands', 5, 1),
('Lookah', 'lookah', '[{"column":"tag","relation":"equals","condition":"brand:lookah"}]', true, 'price-asc', 'brands', 6, 1),
('Monark', 'monark', '[{"column":"tag","relation":"equals","condition":"brand:monark"}]', true, 'price-asc', 'brands', 7, 1),
('Made in USA', 'made-in-usa', '[{"column":"tag","relation":"equals","condition":"style:made-in-usa"}]', false, 'price-asc', 'brands', 8, 1);

-- ============================================================
-- SPECIAL COLLECTIONS
-- ============================================================
INSERT INTO collection_definitions (title, handle, rules, disjunctive, sort_order, menu_location, menu_position, min_expected_products) VALUES
('Wholesale', 'wholesale', '[{"column":"tag","relation":"equals","condition":"Wholesale Quantity"}]', false, 'price-asc', 'main', 99, 30),
('Clearance', 'clearance', '[{"column":"tag","relation":"equals","condition":"clearance"}]', false, 'price-asc', 'main', 98, 1);
