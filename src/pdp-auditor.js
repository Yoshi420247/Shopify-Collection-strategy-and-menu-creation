#!/usr/bin/env node
// PDP Quality Auditor & Rewriter
// Uses Claude Sonnet 4.6 to review product descriptions written by Gemini Flash,
// scores them on multiple quality dimensions, and rewrites any that don't meet the bar.
//
// Usage:
//   node src/pdp-auditor.js                          # Dry-run: score all WYN products
//   node src/pdp-auditor.js --execute                # Live: score + rewrite bad PDPs on Shopify
//   node src/pdp-auditor.js --limit 10               # Test on 10 products
//   node src/pdp-auditor.js --threshold 8            # Stricter quality bar (default: 7)
//   node src/pdp-auditor.js --product-ids 123,456    # Audit specific products
//   node src/pdp-auditor.js --vendor "What You Need" # Filter by vendor (default: all)
//   node src/pdp-auditor.js --rewrite-all            # Rewrite every PDP regardless of score

import { createMessage } from './anthropic-client.js';
import { paginateAll, updateProduct, getProduct } from './shopify-api.js';
import { determineProductType } from './pdp-generator.js';
import { config } from './config.js';
import { writeFileSync } from 'fs';

// ── CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const REWRITE_ALL = args.includes('--rewrite-all');
const THRESHOLD = parseInt(args.find(a => a.startsWith('--threshold='))?.split('=')[1] || '7', 10);
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const PRODUCT_IDS = args.find(a => a.startsWith('--product-ids='))?.split('=')[1]?.split(',').map(Number) || [];
const VENDOR_FILTER = args.find(a => a.startsWith('--vendor='))?.split('=')[1] || '';
const CONCURRENCY = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '3', 10);
const MODEL = 'claude-sonnet-4-6-20250514';

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('ANTHROPIC_API_KEY is required');
  process.exit(1);
}

// ── Scoring prompt ────────────────────────────────────────────────────
function buildAuditPrompt(product) {
  const productType = determineProductType(product.title);
  const price = product.variants?.[0]?.price || 'N/A';
  const tags = product.tags || '';
  const imageCount = product.images?.length || 0;

  return `You are a senior e-commerce copywriter and conversion-rate optimization (CRO) expert auditing product detail pages (PDPs) for Oil Slick Pad, a premium online smoke shop.

PRODUCT CONTEXT:
- Title: "${product.title}"
- Type: ${productType}
- Price: $${price}
- Tags: ${tags}
- Images: ${imageCount}
- Vendor: ${product.vendor || 'Unknown'}

CURRENT PDP (body_html):
---
${product.body_html || '[EMPTY - no description]'}
---

TASK: Score this PDP on each dimension (1-10) and decide if it needs a rewrite.

SCORING DIMENSIONS:
1. **Specificity** — Does it describe THIS exact product with concrete details, or could it describe any generic pipe/bong/accessory? Look for: specific measurements, unique design features, material callouts, color descriptions. Generic filler like "stands out in any collection" scores low.
2. **Persuasiveness** — Does it trigger desire to buy? Look for: sensory language, benefit-driven copy, emotional hooks, social proof angles. Flat "this is a pipe, it works" scores low.
3. **SEO Quality** — Natural keyword integration for both traditional search and LLM-based search (ChatGPT Shopping, Perplexity). Structured headings, semantic keywords in context. Keyword stuffing or zero keywords both score low.
4. **Voice & Tone** — Conversational, knowledgeable, slightly edgy (smoke shop vibe). Not corporate, not robotic, not overly enthusiastic. Should sound like a passionate budtender recommending a piece.
5. **Structure** — Proper HTML sections: opening hook → benefits list → best-for → how-to-use → specs table → care/cleaning → FAQ → CTA. Missing sections or wrong HTML score low.
6. **FAQ Quality** — Are the FAQs specific, useful, and answering real buyer questions? Generic filler like "Is this durable? Yes it's durable." scores low. Good FAQs address sizing, compatibility, cleaning specifics, comparisons.
7. **Conversion Copy** — Does it reduce purchase anxiety? Address objections? Include urgency or scarcity? Link to related collections? Have a clear CTA?

SCORING RULES:
- 1-3: Terrible. Template filler, generic, or broken HTML.
- 4-5: Below average. Reads AI-generated, lacks specificity.
- 6: Acceptable but forgettable. Won't hurt conversion but won't help.
- 7: Good. Solid copy that does its job.
- 8-9: Great. Compelling, specific, would genuinely help sell the product.
- 10: Best-in-class. Could be used as a reference PDP for the entire store.

Return ONLY valid JSON in this exact format (no markdown fences, no extra text):
{
  "scores": {
    "specificity": <1-10>,
    "persuasiveness": <1-10>,
    "seo_quality": <1-10>,
    "voice_and_tone": <1-10>,
    "structure": <1-10>,
    "faq_quality": <1-10>,
    "conversion_copy": <1-10>,
    "overall": <1-10>
  },
  "verdict": "<pass|rewrite>",
  "issues": ["<issue 1>", "<issue 2>", ...],
  "strengths": ["<strength 1>", ...]
}

The "overall" score is NOT an average — it's your holistic judgment. A PDP with great structure but completely generic copy should still score low overall.
Set verdict to "rewrite" if overall < ${THRESHOLD}, or "pass" if overall >= ${THRESHOLD}.
If the body_html is empty or only a few words, verdict must be "rewrite" with overall = 1.`;
}

// ── Rewrite prompt ────────────────────────────────────────────────────
function buildRewritePrompt(product, auditResult) {
  const productType = determineProductType(product.title);
  const price = product.variants?.[0]?.price || 'N/A';
  const tags = product.tags || '';

  return `You are the best e-commerce copywriter in the smoke shop industry. You write PDPs that convert browsers into buyers.

You just audited this product's description and found it lacking. Now rewrite it properly.

PRODUCT:
- Title: "${product.title}"
- Type: ${productType}
- Price: $${price}
- Tags: ${tags}
- Vendor: ${product.vendor || 'Unknown'}
- Images: ${product.images?.length || 0}

AUDIT FINDINGS:
- Overall score: ${auditResult.scores.overall}/10
- Issues found: ${auditResult.issues.join('; ')}
- Strengths to keep: ${auditResult.strengths.join('; ')}

PREVIOUS PDP (the one you're replacing):
---
${product.body_html || '[was empty]'}
---

WRITE A NEW PDP following these rules:

1. **600-800 words** of compelling, specific product copy
2. **Use this EXACT HTML structure** (no markdown, no code fences — output clean HTML only):

<p>[Opening hook — 2-3 punchy sentences about what makes THIS SPECIFIC product special. Reference the actual design, colors, or features visible in a ${productType.toLowerCase()}. Make the reader picture holding it.]</p>

<h2>Why you'll reach for this one</h2>
<ul>
<li><strong>[Specific benefit]</strong> — [Concrete explanation tied to this product, not generic filler]</li>
[4-5 bullet points total — each one should be unique and specific]
</ul>

<h2>Best for</h2>
<p>[Who specifically should buy this — mention experience level, use case, lifestyle. Be vivid, not vague. 2-3 sentences.]</p>

<h2>How to use it</h2>
<p>[Practical usage tips specific to this product type. If it's a bong, talk about water level. If it's a pipe, talk about packing. 2-3 sentences.]</p>

<h2>Specs</h2>
<table>
<tr><th>Type</th><td>${productType}</td></tr>
<tr><th>Vendor</th><td>What You Need</td></tr>
[Add material, dimensions, joint size, or other specs you can infer from the title and tags. If you're not sure about a spec, omit it — never fabricate measurements.]
</table>

<h2>Care & cleaning</h2>
<p>[Specific maintenance instructions for this product type. Mention isopropyl alcohol and salt for glass, warm water rinse frequency, what NOT to do. 2-3 sentences.]</p>

<h2>FAQ</h2>
<ul>
<li><strong>[Specific buyer question about THIS product]?</strong>
<p>[Detailed, helpful answer — not "Yes, it's great."]</p></li>
[3-5 FAQs that a real buyer would actually ask. Think: compatibility, sizing, cleaning frequency, material safety, comparison to alternatives.]
</ul>

<p>Explore more ${productType.toLowerCase()} and other pieces in our <a href="https://oilslickpad.com/collections/smoke-shop-products">full collection</a>.</p>

WRITING RULES:
- Sound like a knowledgeable budtender, not a corporate copywriter
- Be specific — if the title says "7 inch" or "blue" or "silicone", use those details
- Include semantic keywords naturally for SEO and LLM search (ChatGPT Shopping, Perplexity, Google SGE)
- NO health claims, NO trademarked character names, NO pricing in the description
- NO markdown — output clean, valid HTML only
- NO code fences — just the raw HTML
- Every sentence should earn its place — if it could describe any product, cut it`;
}

// ── AI calls ──────────────────────────────────────────────────────────
async function auditPDP(product) {
  const prompt = buildAuditPrompt(product);

  const response = await createMessage(API_KEY, {
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0]?.text?.trim();
  try {
    // Strip any accidental markdown fences
    const cleaned = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`  Failed to parse audit response for "${product.title}": ${err.message}`);
    console.error(`  Raw response: ${text?.substring(0, 200)}`);
    // Return a fail-safe result that triggers rewrite
    return {
      scores: { specificity: 1, persuasiveness: 1, seo_quality: 1, voice_and_tone: 1, structure: 1, faq_quality: 1, conversion_copy: 1, overall: 1 },
      verdict: 'rewrite',
      issues: ['Audit response could not be parsed — defaulting to rewrite'],
      strengths: [],
    };
  }
}

async function rewritePDP(product, auditResult) {
  const prompt = buildRewritePrompt(product, auditResult);

  const response = await createMessage(API_KEY, {
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  let html = response.content[0]?.text?.trim();
  // Strip any accidental markdown fences
  html = html.replace(/^```html?\n?/, '').replace(/\n?```$/, '');
  return html;
}

// ── Fetch products ────────────────────────────────────────────────────
async function fetchProducts() {
  if (PRODUCT_IDS.length > 0) {
    console.log(`Fetching ${PRODUCT_IDS.length} specific products...`);
    const products = [];
    for (const id of PRODUCT_IDS) {
      const data = await getProduct(id);
      if (data.product) products.push(data.product);
    }
    return products;
  }

  const params = { limit: 250, status: 'active' };
  if (VENDOR_FILTER) params.vendor = VENDOR_FILTER;

  console.log(`Fetching all active products${VENDOR_FILTER ? ` from vendor "${VENDOR_FILTER}"` : ''}...`);
  const products = await paginateAll('products.json', 'products', params);
  console.log(`  Found ${products.length} products`);

  if (LIMIT > 0) {
    console.log(`  Limiting to first ${LIMIT} products`);
    return products.slice(0, LIMIT);
  }

  return products;
}

// ── Process products with concurrency ─────────────────────────────────
async function processProduct(product, index, total) {
  const prefix = `[${index + 1}/${total}]`;
  console.log(`\n${prefix} Auditing: "${product.title}" (ID: ${product.id})`);

  // Step 1: Score the PDP
  const audit = await auditPDP(product);
  const score = audit.scores.overall;
  const verdict = REWRITE_ALL ? 'rewrite' : audit.verdict;

  const scoreBar = '█'.repeat(score) + '░'.repeat(10 - score);
  console.log(`${prefix}   Score: ${scoreBar} ${score}/10 → ${verdict.toUpperCase()}`);

  if (audit.issues.length > 0) {
    console.log(`${prefix}   Issues: ${audit.issues.join(', ')}`);
  }

  const result = {
    product_id: product.id,
    title: product.title,
    handle: product.handle,
    vendor: product.vendor,
    scores: audit.scores,
    verdict,
    issues: audit.issues,
    strengths: audit.strengths,
    rewritten: false,
    new_html: null,
  };

  // Step 2: Rewrite if needed
  if (verdict === 'rewrite') {
    console.log(`${prefix}   Rewriting with Claude Sonnet 4.6...`);
    const newHtml = await rewritePDP(product, audit);
    result.rewritten = true;
    result.new_html = newHtml;

    if (EXECUTE) {
      console.log(`${prefix}   Updating product on Shopify...`);
      await updateProduct(product.id, { body_html: newHtml });
      console.log(`${prefix}   ✓ Updated on Shopify`);
    } else {
      console.log(`${prefix}   [DRY RUN] Would update on Shopify`);
    }
  }

  return result;
}

async function processInBatches(products) {
  const results = [];

  for (let i = 0; i < products.length; i += CONCURRENCY) {
    const batch = products.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((product, j) => processProduct(product, i + j, products.length))
    );
    results.push(...batchResults);
  }

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  PDP Quality Auditor — Claude Sonnet 4.6');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Mode:        ${EXECUTE ? 'LIVE (will update Shopify)' : 'DRY RUN (read-only)'}`);
  console.log(`  Threshold:   ${THRESHOLD}/10`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Model:       ${MODEL}`);
  if (REWRITE_ALL) console.log('  Rewrite all: YES (ignoring scores)');
  if (VENDOR_FILTER) console.log(`  Vendor:      ${VENDOR_FILTER}`);
  if (LIMIT > 0) console.log(`  Limit:       ${LIMIT}`);
  if (PRODUCT_IDS.length > 0) console.log(`  Product IDs: ${PRODUCT_IDS.join(', ')}`);
  console.log('══════════════════════════════════════════════════════════\n');

  const products = await fetchProducts();
  if (products.length === 0) {
    console.log('No products found. Nothing to audit.');
    return;
  }

  const startTime = Date.now();
  const results = await processInBatches(products);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── Summary ──────────────────────────────────────────────────────
  const passed = results.filter(r => r.verdict === 'pass');
  const rewrites = results.filter(r => r.verdict === 'rewrite');
  const rewritten = results.filter(r => r.rewritten);

  const avgScore = (results.reduce((sum, r) => sum + r.scores.overall, 0) / results.length).toFixed(1);

  const scoreDist = {};
  for (const r of results) {
    const s = r.scores.overall;
    scoreDist[s] = (scoreDist[s] || 0) + 1;
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  AUDIT REPORT');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Products audited:  ${results.length}`);
  console.log(`  Average score:     ${avgScore}/10`);
  console.log(`  Passed (>=${THRESHOLD}):      ${passed.length}`);
  console.log(`  Need rewrite (<${THRESHOLD}): ${rewrites.length}`);
  console.log(`  Actually rewritten: ${rewritten.length}`);
  console.log(`  Time elapsed:      ${elapsed}s`);
  console.log('');
  console.log('  Score distribution:');
  for (let s = 10; s >= 1; s--) {
    if (scoreDist[s]) {
      const bar = '█'.repeat(scoreDist[s]);
      console.log(`    ${s}/10: ${bar} (${scoreDist[s]})`);
    }
  }

  // Most common issues
  const issueCounts = {};
  for (const r of results) {
    for (const issue of r.issues) {
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
    }
  }
  const topIssues = Object.entries(issueCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (topIssues.length > 0) {
    console.log('');
    console.log('  Top issues:');
    for (const [issue, count] of topIssues) {
      console.log(`    ${count}x — ${issue}`);
    }
  }

  // Worst products
  const worst = [...results].sort((a, b) => a.scores.overall - b.scores.overall).slice(0, 5);
  console.log('');
  console.log('  Lowest scoring products:');
  for (const r of worst) {
    console.log(`    ${r.scores.overall}/10 — "${r.title}" (${r.product_id})`);
  }

  console.log('══════════════════════════════════════════════════════════');

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    config: { threshold: THRESHOLD, execute: EXECUTE, rewrite_all: REWRITE_ALL, model: MODEL, vendor_filter: VENDOR_FILTER },
    summary: {
      total: results.length,
      average_score: parseFloat(avgScore),
      passed: passed.length,
      need_rewrite: rewrites.length,
      actually_rewritten: rewritten.length,
      elapsed_seconds: parseFloat(elapsed),
      score_distribution: scoreDist,
      top_issues: topIssues.map(([issue, count]) => ({ issue, count })),
    },
    // Don't include full HTML in report to keep file size manageable
    results: results.map(r => ({
      product_id: r.product_id,
      title: r.title,
      handle: r.handle,
      vendor: r.vendor,
      scores: r.scores,
      verdict: r.verdict,
      issues: r.issues,
      strengths: r.strengths,
      rewritten: r.rewritten,
    })),
  };

  writeFileSync('pdp-audit-report.json', JSON.stringify(report, null, 2));
  console.log('\nReport saved to pdp-audit-report.json');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
