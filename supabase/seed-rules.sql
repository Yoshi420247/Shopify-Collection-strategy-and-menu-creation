-- ============================================================
-- SEED DATA: Classification Rules
-- Migrated from config.js taxonomy
-- Run AFTER schema.sql
-- ============================================================

-- ============================================================
-- FAMILY CLASSIFICATION RULES (by product title keywords)
-- These auto-tag products with the correct family: tag
-- ============================================================

-- Priority 10: Wholesale detection (runs first, prevents further classification)
INSERT INTO classification_rules (rule_name, description, priority, conditions, apply_tags, remove_tags) VALUES
('Wholesale - Display Packs', 'Detect wholesale display/multi-pack products', 10,
 '{"title_matches_any": ["display", "\\\\b\\\\d+\\\\s*-?\\\\s*(pack|pk)\\\\b", "\\\\b\\\\d+\\\\s*-?\\\\s*ct\\\\b", "\\\\b\\\\d+pc\\\\b", "\\\\b\\\\d+\\\\s*pcs\\\\b"], "title_quantity_gte": 6}',
 '{"Wholesale Quantity"}', '{}');

-- Priority 20: Flower Smoking Devices
INSERT INTO classification_rules (rule_name, description, priority, conditions, apply_tags) VALUES
('Bongs & Water Pipes', 'Classify bongs and water pipes', 20,
 '{"title_contains_any": ["bong", "water pipe", "beaker", "straight tube", "recycler", "incycler"], "title_not_contains": ["silicone", "bowl", "downstem", "ash catcher"]}',
 '{"family:glass-bong", "pillar:smokeshop-device", "use:flower-smoking"}'),

('Bubblers', 'Classify bubblers', 20,
 '{"title_contains_any": ["bubbler", "bubbler pipe"], "title_not_contains": ["silicone"]}',
 '{"family:bubbler", "pillar:smokeshop-device", "use:flower-smoking"}'),

('Hand Pipes / Spoons', 'Classify hand pipes and spoon pipes', 20,
 '{"title_contains_any": ["spoon", "hand pipe", "sherlock", "gandalf"], "title_not_contains": ["silicone", "bowl"]}',
 '{"family:spoon-pipe", "pillar:smokeshop-device", "use:flower-smoking"}'),

('One Hitters & Chillums', 'Classify one hitters and chillums', 20,
 '{"title_contains_any": ["chillum", "one hitter", "one-hitter", "bat pipe", "taster"]}',
 '{"family:chillum-onehitter", "pillar:smokeshop-device", "use:flower-smoking"}'),

('Steamrollers', 'Classify steamrollers', 20,
 '{"title_contains_any": ["steamroller", "steam roller"]}',
 '{"family:steamroller", "pillar:smokeshop-device", "use:flower-smoking"}');

-- Priority 20: Dabbing Devices
INSERT INTO classification_rules (rule_name, description, priority, conditions, apply_tags) VALUES
('Dab Rigs', 'Classify dab rigs', 20,
 '{"title_contains_any": ["dab rig", "oil rig", "mini rig", "recycler rig", "rig"], "title_not_contains": ["silicone", "banger", "nail", "tool", "torch", "nectar", "bowl", "cap"]}',
 '{"family:glass-rig", "pillar:smokeshop-device", "use:dabbing"}'),

('Nectar Collectors', 'Classify nectar collectors/straws', 20,
 '{"title_contains_any": ["nectar collector", "nectar straw", "honey straw", "dab straw"]}',
 '{"family:nectar-collector", "pillar:smokeshop-device", "use:dabbing"}');

-- Priority 30: Accessories - Dabbing
INSERT INTO classification_rules (rule_name, description, priority, conditions, apply_tags) VALUES
('Quartz Bangers', 'Classify quartz bangers (NOT rigs with banger in name)', 30,
 '{"title_contains_any": ["banger", "quartz nail"], "title_not_contains": ["rig", "hanger", "display", "roach", "clip", "set", "insert", "blender", "gavel", "tassel"]}',
 '{"family:banger", "pillar:accessory", "use:dabbing"}'),

('Carb Caps', 'Classify carb caps', 30,
 '{"title_contains_any": ["carb cap", "spinner cap", "bubble cap", "directional cap"]}',
 '{"family:carb-cap", "pillar:accessory", "use:dabbing"}'),

('Dab Tools', 'Classify dab tools and dabbers', 30,
 '{"title_contains_any": ["dab tool", "dabber", "dab pick", "wax tool", "scoop tool"]}',
 '{"family:dab-tool", "pillar:accessory", "use:dabbing"}'),

('Torches', 'Classify torches and lighters', 30,
 '{"title_contains_any": ["torch"], "title_not_contains": ["display"]}',
 '{"family:torch", "pillar:accessory", "use:dabbing"}');

-- Priority 30: Accessories - Flower
INSERT INTO classification_rules (rule_name, description, priority, conditions, apply_tags) VALUES
('Flower Bowls', 'Classify flower bowls / slides', 30,
 '{"title_contains_any": ["bowl", "slide", "flower bowl"], "title_not_contains": ["rig", "bong", "pipe", "bubbler", "jar", "silicone"]}',
 '{"family:flower-bowl", "pillar:accessory", "use:flower-smoking"}'),

('Ash Catchers', 'Classify ash catchers', 30,
 '{"title_contains_any": ["ash catcher", "ashcatcher"]}',
 '{"family:ash-catcher", "pillar:accessory", "use:flower-smoking"}'),

('Downstems', 'Classify downstems', 30,
 '{"title_contains_any": ["downstem", "down stem"]}',
 '{"family:downstem", "pillar:accessory", "use:flower-smoking"}'),

('Ashtrays', 'Classify ashtrays', 30,
 '{"title_contains_any": ["ashtray", "ash tray"]}',
 '{"family:ashtray", "pillar:accessory", "use:flower-smoking"}');

-- Priority 30: Rolling & Papers
INSERT INTO classification_rules (rule_name, description, priority, conditions, apply_tags) VALUES
('Rolling Papers & Cones', 'Classify rolling papers, cones, wraps', 30,
 '{"title_contains_any": ["paper", "cone", "wrap", "blunt", "booklet"], "title_not_contains": ["parchment", "fep", "ptfe", "release"]}',
 '{"family:rolling-paper", "pillar:accessory", "use:rolling"}'),

('Rolling Trays', 'Classify rolling trays', 30,
 '{"title_contains_any": ["tray", "rolling tray"]}',
 '{"family:rolling-tray", "pillar:accessory", "use:rolling"}');

-- Priority 30: Grinders
INSERT INTO classification_rules (rule_name, description, priority, conditions, apply_tags) VALUES
('Grinders', 'Classify grinders', 30,
 '{"title_contains_any": ["grinder"], "title_not_contains": ["display"]}',
 '{"family:grinder", "pillar:accessory", "use:preparation"}');

-- Priority 40: Character/Novelty Pipes (broad pattern matching)
INSERT INTO classification_rules (rule_name, description, priority, conditions, apply_tags) VALUES
('Character Pipes', 'Classify novelty/character pipes by common character keywords', 40,
 '{"title_contains_any": ["alien", "astronaut", "batman", "bear", "bee", "buddha", "bull", "bunny", "cactus", "cat", "chicken", "clown", "cow", "dinosaur", "dog", "dolphin", "dragon", "duck", "elephant", "fairy", "flamingo", "frog", "ghost", "gnome", "gorilla", "grim reaper", "hippo", "knight", "lion", "mermaid", "monkey", "monster", "mushroom", "narwhal", "octopus", "owl", "panda", "penguin", "phoenix", "pig", "pirate", "pumpkin", "rabbit", "robot", "santa", "shark", "skeleton", "skull", "sloth", "snake", "snowman", "spider", "squid", "tiger", "turtle", "unicorn", "viking", "witch", "wizard", "wolf", "yeti", "zombie", "donut", "taco", "pizza", "pineapple", "ice cream", "cupcake", "avocado"]}',
 '{"family:character-pipe"}');

-- ============================================================
-- BRAND CLASSIFICATION RULES
-- Priority 50: Applied after family tags
-- ============================================================

INSERT INTO classification_rules (rule_name, description, priority, conditions, apply_tags) VALUES
('Brand: Maven', 'Tag Maven branded products', 50,
 '{"title_contains_any": ["maven"]}',
 '{"brand:maven"}'),

('Brand: Zig Zag', 'Tag Zig Zag branded products', 50,
 '{"title_contains_any": ["zig zag", "zig-zag"]}',
 '{"brand:zig-zag"}'),

('Brand: Vibes', 'Tag Vibes branded products', 50,
 '{"title_contains_any": ["vibes"]}',
 '{"brand:vibes"}'),

('Brand: Cookies', 'Tag Cookies branded products', 50,
 '{"title_contains_any": ["cookies"]}',
 '{"brand:cookies"}'),

('Brand: Puffco', 'Tag Puffco branded products', 50,
 '{"title_contains_any": ["puffco"]}',
 '{"brand:puffco"}'),

('Brand: Lookah', 'Tag Lookah branded products', 50,
 '{"title_contains_any": ["lookah"]}',
 '{"brand:lookah"}'),

('Brand: G Pen', 'Tag G Pen branded products', 50,
 '{"title_contains_any": ["g pen", "g-pen", "gpen"]}',
 '{"brand:g-pen"}'),

('Brand: Monark', 'Tag Monark branded products', 50,
 '{"title_contains_any": ["monark"]}',
 '{"brand:monark"}'),

('Brand: Scorch', 'Tag Scorch branded products', 50,
 '{"title_contains_any": ["scorch"]}',
 '{"brand:scorch"}'),

('Brand: Elements', 'Tag Elements branded products', 50,
 '{"title_contains_any": ["elements"]}',
 '{"brand:elements"}');

-- ============================================================
-- MATERIAL CLASSIFICATION RULES
-- Priority 60: Applied after family and brand
-- ============================================================

INSERT INTO classification_rules (rule_name, description, priority, conditions, apply_tags) VALUES
('Material: Silicone', 'Tag silicone products', 60,
 '{"title_contains_any": ["silicone"]}',
 '{"material:silicone"}'),

('Material: Quartz', 'Tag quartz products', 60,
 '{"title_contains_any": ["quartz"]}',
 '{"material:quartz"}'),

('Material: Titanium', 'Tag titanium products', 60,
 '{"title_contains_any": ["titanium"]}',
 '{"material:titanium"}'),

('Material: Ceramic', 'Tag ceramic products', 60,
 '{"title_contains_any": ["ceramic"]}',
 '{"material:ceramic"}'),

('Material: Glass', 'Tag glass products (when glass is in title)', 60,
 '{"title_contains_any": ["glass"], "title_not_contains": ["silicone"]}',
 '{"material:glass"}');
