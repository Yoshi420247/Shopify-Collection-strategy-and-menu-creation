// AI-powered Product Detail Page (PDP) generator
// Generates SEO-optimized, LLM-search-friendly product descriptions
// Uses Gemini Flash for fast, low-cost description generation
import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';

// ── Product classification ──────────────────────────────────────────
export function determineProductType(name) {
  const n = name.toLowerCase();
  if (/water\s*pipe|bong/.test(n)) return 'Water Pipes';
  if (/hand\s*pipe|glass\s*pipe|spoon\s*pipe/.test(n)) return 'Hand Pipes';
  if (/bubbler/.test(n)) return 'Bubblers';
  if (/nectar\s*collector/.test(n)) return 'Nectar Collectors';
  if (/dab\s*(rig|tool)/.test(n)) return 'Dab Tools / Dabbers';
  if (/battery|vape\s*pen/.test(n)) return 'Batteries & Devices';
  if (/bowl|slide/.test(n)) return 'Bowls & Slides';
  if (/grinder/.test(n)) return 'Grinders';
  if (/ashtray/.test(n)) return 'Ashtrays';
  if (/jar|container/.test(n)) return 'Storage Jars';
  if (/clip|holder/.test(n)) return 'Accessories';
  if (/chillum|one\s*hitter/.test(n)) return 'One Hitters & Chillums';
  if (/steamroller/.test(n)) return 'Steamrollers';
  if (/rig/.test(n)) return 'Dab Rigs';
  if (/pipe/.test(n)) return 'Hand Pipes';
  if (/rolling|paper|cone/.test(n)) return 'Rolling Accessories';
  if (/torch|lighter/.test(n)) return 'Lighters & Torches';
  if (/scale/.test(n)) return 'Scales';
  if (/screen/.test(n)) return 'Screens';
  if (/clean/.test(n)) return 'Cleaning Supplies';
  return 'Smoke Shop Products';
}

// ── Tag generation using config taxonomy ─────────────────────────────
export function generateTags(product) {
  const name = product.name.toLowerCase();
  const desc = (product.description || '').toLowerCase();
  const combined = `${name} ${desc}`;
  const tags = [];

  // Vendor tag
  tags.push('vendor:What You Need');
  if (product.sku) tags.push(`sku:${product.sku}`);

  // Material tags
  const materials = ['glass', 'silicone', 'pvc', 'plastic', 'metal', 'ceramic', 'wood', 'acrylic'];
  for (const mat of materials) {
    if (combined.includes(mat)) tags.push(`material:${mat}`);
  }

  // Product family + pillar + use tags from taxonomy
  const familyRules = [
    { pattern: /water\s*pipe|bong/, family: 'glass-bong', pillar: 'smokeshop-device', use: 'flower-smoking' },
    { pattern: /bubbler/, family: 'bubbler', pillar: 'smokeshop-device', use: 'flower-smoking' },
    { pattern: /hand\s*pipe|glass\s*pipe|spoon/, family: 'spoon-pipe', pillar: 'smokeshop-device', use: 'flower-smoking' },
    { pattern: /chillum|one\s*hitter/, family: 'chillum-onehitter', pillar: 'smokeshop-device', use: 'flower-smoking' },
    { pattern: /steamroller/, family: 'steamroller', pillar: 'smokeshop-device', use: 'flower-smoking' },
    { pattern: /dab\s*rig|oil\s*rig/, family: 'glass-rig', pillar: 'smokeshop-device', use: 'dabbing' },
    { pattern: /silicone\s*rig/, family: 'silicone-rig', pillar: 'smokeshop-device', use: 'dabbing' },
    { pattern: /nectar\s*collector/, family: 'nectar-collector', pillar: 'smokeshop-device', use: 'dabbing' },
    { pattern: /banger/, family: 'banger', pillar: 'accessory', use: 'dabbing' },
    { pattern: /carb\s*cap/, family: 'carb-cap', pillar: 'accessory', use: 'dabbing' },
    { pattern: /dab\s*tool|dabber/, family: 'dab-tool', pillar: 'accessory', use: 'dabbing' },
    { pattern: /torch/, family: 'torch', pillar: 'accessory', use: 'dabbing' },
    { pattern: /bowl|slide/, family: 'flower-bowl', pillar: 'accessory', use: 'flower-smoking' },
    { pattern: /ash\s*catcher/, family: 'ash-catcher', pillar: 'accessory', use: 'flower-smoking' },
    { pattern: /downstem/, family: 'downstem', pillar: 'accessory', use: 'flower-smoking' },
    { pattern: /ashtray/, family: 'ashtray', pillar: 'accessory', use: 'flower-smoking' },
    { pattern: /grinder/, family: 'grinder', pillar: 'accessory', use: 'preparation' },
    { pattern: /scale/, family: 'scale', pillar: 'accessory', use: 'preparation' },
    { pattern: /battery|vape\s*pen/, family: 'vape-battery', pillar: 'smokeshop-device', use: 'vaping' },
    { pattern: /cartridge/, family: 'vape-cartridge', pillar: 'accessory', use: 'vaping' },
    { pattern: /rolling\s*paper/, family: 'rolling-paper', pillar: 'accessory', use: 'rolling' },
    { pattern: /rolling\s*tray/, family: 'rolling-tray', pillar: 'accessory', use: 'rolling' },
    { pattern: /jar|container|stash/, family: 'storage-accessory', pillar: 'accessory', use: 'storage' },
    { pattern: /clip|holder|roach/, family: 'clip', pillar: 'accessory', use: 'flower-smoking' },
    { pattern: /lighter/, family: 'lighter', pillar: 'accessory', use: 'flower-smoking' },
    { pattern: /screen/, family: 'screen', pillar: 'accessory', use: 'flower-smoking' },
    { pattern: /clean/, family: 'cleaning-supply', pillar: 'accessory', use: null },
  ];

  let matched = false;
  for (const rule of familyRules) {
    if (rule.pattern.test(name)) {
      tags.push(`pillar:${rule.pillar}`, `family:${rule.family}`);
      if (rule.use) tags.push(`use:${rule.use}`);
      matched = true;
      break;
    }
  }

  // Fallback for unclassified pipes
  if (!matched && /pipe/.test(name)) {
    tags.push('pillar:smokeshop-device', 'family:spoon-pipe', 'use:flower-smoking');
  }

  // WC category tags if available
  if (product.categories) {
    for (const cat of product.categories) {
      tags.push(`wc-category:${cat.toLowerCase().replace(/\s+/g, '-')}`);
    }
  }

  return [...new Set(tags)].join(', ');
}

// ── Extract specs from WC product data ──────────────────────────────
function extractSpecs(product) {
  const specs = {};
  const name = product.name;

  // Extract height/size from name
  const sizeMatch = name.match(/(\d+(?:\.\d+)?)\s*["″'']|(\d+(?:\.\d+)?)\s*(?:inch|in\b)/i);
  if (sizeMatch) specs.height = `${sizeMatch[1] || sizeMatch[2]} inches`;

  // Extract from attributes
  if (product.attributes) {
    for (const attr of product.attributes) {
      specs[attr.name.toLowerCase()] = attr.options.join(', ');
    }
  }

  // Weight
  if (product.weight) specs.weight = product.weight;

  // Dimensions
  if (product.dimensions) {
    const { length, width, height } = product.dimensions;
    if (length || width || height) {
      specs.dimensions = [length, width, height].filter(Boolean).join(' × ');
    }
  }

  return specs;
}

// ── AI PDP generation ───────────────────────────────────────────────
export async function generatePDP(product, retailPrice) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.log('    GOOGLE_API_KEY not set — using template PDP');
    return generateTemplatePDP(product, retailPrice);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const productType = determineProductType(product.name);
  const specs = extractSpecs(product);
  const specsText = Object.entries(specs).map(([k, v]) => `${k}: ${v}`).join('\n');

  const prompt = `You are an expert e-commerce copywriter for a smoke shop called Oil Slick Pad.
Write a product description (PDP) for this product in clean, valid HTML.

PRODUCT: "${product.name}"
TYPE: ${productType}
SKU: ${product.sku || 'N/A'}
PRICE: $${retailPrice}
${specsText ? `SPECS:\n${specsText}` : ''}
${product.description ? `WHOLESALER DESCRIPTION:\n${product.description.replace(/<[^>]*>/g, ' ').substring(0, 500)}` : ''}

REQUIREMENTS:
1. Write 600-800 words of compelling, SEO-optimized product copy
2. Use this EXACT HTML structure:

<p>[Opening hook — 2-3 sentences about what makes this product special]</p>

<h2>Why you'll reach for this one</h2>
<ul>
<li><strong>[Benefit title]</strong> — [Explanation]</li>
[4-5 bullet points]
</ul>

<h2>Best for</h2>
<p>[Who this product is perfect for — 2-3 sentences]</p>

<h2>How to use it</h2>
<p>[Simple usage instructions — 2-3 sentences]</p>

<h2>Specs</h2>
<table>
<tr><th>Reference SKU</th><td>${product.sku || 'N/A'}</td></tr>
<tr><th>Vendor</th><td>What You Need</td></tr>
<tr><th>Type</th><td>${productType}</td></tr>
[Add any other specs: materials, dimensions, weight]
</table>

<h2>Care & cleaning</h2>
<p>[Cleaning and maintenance instructions]</p>

<h2>FAQ</h2>
<ul>
<li><strong>[Question]?</strong>
<p>[Answer]</p></li>
[3-5 FAQs]
</ul>

<p>[Closing CTA with link to <a href="https://oilslickpad.com/collections/smoke-shop-products">smoke shop products</a>]</p>

RULES:
- DO NOT mention trademarks, licensed characters, or copyrighted names
- DO NOT include pricing in the description
- DO NOT make health claims
- DO write naturally, conversationally — not robotic or keyword-stuffed
- DO include semantic keywords naturally for SEO and LLM search discoverability
- DO use structured data-friendly headings
- Output clean HTML only — no markdown, no code fences`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    // Strip any accidental markdown fences
    const html = text.replace(/^```html?\n?/, '').replace(/\n?```$/, '');
    return html;
  } catch (err) {
    console.log(`    AI PDP generation failed: ${err.message} — using template`);
    return generateTemplatePDP(product, retailPrice);
  }
}

// ── Template fallback PDP ───────────────────────────────────────────
function generateTemplatePDP(product, retailPrice) {
  const productType = determineProductType(product.name);
  const specs = extractSpecs(product);

  const specsRows = [
    `<tr><th>Reference SKU</th><td>${product.sku || 'N/A'}</td></tr>`,
    `<tr><th>Vendor</th><td>What You Need</td></tr>`,
    `<tr><th>Type</th><td>${productType}</td></tr>`,
  ];
  if (specs.height) specsRows.push(`<tr><th>Size</th><td>${specs.height}</td></tr>`);
  if (specs.weight) specsRows.push(`<tr><th>Weight</th><td>${specs.weight}</td></tr>`);
  if (specs.dimensions) specsRows.push(`<tr><th>Dimensions</th><td>${specs.dimensions}</td></tr>`);

  return `<p>The ${product.name} brings character and function together in one piece. Designed to stand out in any collection while delivering smooth, reliable performance every session.</p>

<h2>Why you'll reach for this one</h2>
<ul>
<li><strong>Conversation starter</strong> — The distinctive design catches eyes and sparks interest from anyone who sees your setup.</li>
<li><strong>Solid construction</strong> — Built for durability that holds up to regular use without feeling flimsy or cheap.</li>
<li><strong>Easy to handle</strong> — The shape and size make it comfortable to grip and use, whether you're at home or on the go.</li>
<li><strong>Smooth function</strong> — Designed for clean airflow and consistent performance from start to finish.</li>
<li><strong>Gift-worthy</strong> — Looking for something unique for a friend who has everything? This piece delivers both function and personality.</li>
</ul>

<h2>Best for</h2>
<p>This ${productType.toLowerCase()} is perfect for collectors who appreciate unique designs and anyone who wants their setup to reflect their personality. Great as a daily driver or a statement piece.</p>

<h2>How to use it</h2>
<p>Simple setup and straightforward use. The design provides smooth performance without any complicated preparation. After use, give it a quick clean to keep it fresh for next time.</p>

<h2>Specs</h2>
<table>
${specsRows.join('\n')}
</table>

<h2>Care & cleaning</h2>
<p>Let the piece cool completely after use. Rinse with warm water after each session. For deeper cleans, use isopropyl alcohol and coarse salt, shake gently, then rinse thoroughly. Regular cleaning keeps performance optimal.</p>

<h2>FAQ</h2>
<ul>
<li><strong>What's the Reference SKU for?</strong>
<p>The Reference SKU (${product.sku || 'N/A'}) helps with reorders and customer service. If you ever need a replacement or want to reorder, this code makes it easy.</p></li>
<li><strong>Is this piece durable?</strong>
<p>Yes, it's built for regular use. Handle with normal care and avoid extreme temperature changes.</p></li>
<li><strong>How do I know what accessories fit?</strong>
<p>Check our <a href="https://oilslickpad.com/collections/accessories">accessories collection</a> for compatible options.</p></li>
</ul>

<p>Looking for more unique pieces? Browse our full <a href="https://oilslickpad.com/collections/smoke-shop-products">smoke shop products</a> to find the perfect match for your style.</p>`;
}

export default { determineProductType, generateTags, generatePDP };
