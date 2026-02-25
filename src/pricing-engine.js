// Pricing engine for wholesaler → Shopify product pricing
// 1. Calculates Shopify unit cost from WYN wholesale price using tiered multipliers
// 2. Researches competitor retail prices via Brave Search + AI analysis
// 3. Recommends optimal retail price considering market, margins, and psychology
import { GoogleGenerativeAI } from '@google/generative-ai';

// ── Tiered cost multiplier: WYN price → Shopify unit cost ────────────
const COST_TIERS = [
  { min: 0.50, max: 4.00,   multiplier: 2.5 },
  { min: 4.01, max: 20.00,  multiplier: 2.0 },
  { min: 20.01, max: 40.00, multiplier: 1.8 },
  { min: 40.01, max: 100.00, multiplier: 1.6 },
  { min: 100.01, max: 200.00, multiplier: 1.5 },
  { min: 200.01, max: Infinity, multiplier: 1.4 },
];

export function calculateCost(wynPrice) {
  const price = parseFloat(wynPrice);
  if (!price || price <= 0) return 0;

  for (const tier of COST_TIERS) {
    if (price >= tier.min && price <= tier.max) {
      return Math.round(price * tier.multiplier * 100) / 100;
    }
  }
  // Fallback: lowest multiplier
  return Math.round(price * 1.4 * 100) / 100;
}

// ── Competitor price research via Brave Search ───────────────────────
async function searchCompetitorPrices(productName, productType) {
  const braveApiKey = process.env.BRAVE_API_KEY;
  if (!braveApiKey) {
    console.log('    BRAVE_API_KEY not set — skipping competitor research');
    return [];
  }

  // Build search queries focused on retail pricing
  const queries = [
    `${productName} price buy online`,
    `${productName} ${productType || ''} smoke shop price`,
  ];

  const allPrices = [];

  for (const query of queries) {
    try {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', query);
      url.searchParams.set('count', '10');

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': braveApiKey,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) continue;

      const data = await response.json();
      const results = data.web?.results || [];

      // Extract prices from snippets and titles
      for (const result of results) {
        const text = `${result.title || ''} ${result.description || ''}`;
        const priceMatches = text.match(/\$(\d+(?:\.\d{2})?)/g);
        if (priceMatches) {
          for (const match of priceMatches) {
            const price = parseFloat(match.replace('$', ''));
            if (price >= 1 && price <= 500) {
              allPrices.push({
                price,
                source: result.url || '',
                title: result.title || '',
              });
            }
          }
        }
      }
    } catch {
      // Search failed — not critical
    }

    await new Promise(r => setTimeout(r, 300));
  }

  return allPrices;
}

// ── AI-powered retail price recommendation ──────────────────────────
async function aiPriceAnalysis(productName, productType, cost, competitorPrices) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const competitorText = competitorPrices.length > 0
    ? `Competitor prices found:\n${competitorPrices.map(p => `  $${p.price} — ${p.title}`).join('\n')}`
    : 'No competitor prices found.';

  const prompt = `You are a retail pricing analyst for an online smoke shop.

Product: "${productName}"
Category: ${productType || 'Smoke Shop Products'}
My cost: $${cost.toFixed(2)}

${competitorText}

Determine the optimal retail price. Consider:
1. If competitors found: price competitively within the market range
2. Minimum acceptable margin: 40% above cost
3. Use psychological pricing: .99 endings for under $50, .95 or round for $50+
4. Smoke shop products typically have 50-150% markup over cost

Return ONLY a JSON object:
{
  "recommended_price": number,
  "price_floor": number,
  "price_ceiling": number,
  "confidence": "high"|"medium"|"low",
  "reasoning": "brief explanation"
}

Return valid JSON only, no markdown fences.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonStr = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

// ── Fallback: formula-based retail pricing ───────────────────────────
function formulaRetailPrice(cost) {
  // Standard smoke shop markup: cost under $10 gets higher markup
  let price;
  if (cost <= 5) {
    price = cost * 3.0;
  } else if (cost <= 15) {
    price = cost * 2.5;
  } else if (cost <= 40) {
    price = cost * 2.0;
  } else if (cost <= 100) {
    price = cost * 1.8;
  } else {
    price = cost * 1.6;
  }

  // Apply psychological pricing
  if (price < 10) {
    price = Math.ceil(price) - 0.01;
  } else if (price < 50) {
    price = Math.ceil(price / 5) * 5 - 0.01;
  } else if (price < 100) {
    price = Math.ceil(price / 10) * 10 - 0.05;
  } else {
    price = Math.ceil(price / 10) * 10;
  }

  return Math.round(price * 100) / 100;
}

// ── Main pricing function ────────────────────────────────────────────
// Returns: { cost, retailPrice, competitorData, source }
export async function determinePrice(productName, wynPrice, productType) {
  const cost = calculateCost(wynPrice);

  if (cost <= 0) {
    return {
      cost: 0,
      retailPrice: 0,
      competitorData: [],
      source: 'no_cost',
    };
  }

  // Step 1: Search for competitor prices
  const competitorPrices = await searchCompetitorPrices(productName, productType);

  // Step 2: Try AI-powered price analysis
  const aiResult = await aiPriceAnalysis(productName, productType, cost, competitorPrices);

  if (aiResult && aiResult.recommended_price > cost) {
    // Ensure minimum margin of 40%
    const minPrice = cost * 1.4;
    const finalPrice = Math.max(aiResult.recommended_price, minPrice);

    return {
      cost,
      retailPrice: Math.round(finalPrice * 100) / 100,
      competitorData: competitorPrices,
      source: 'ai_analysis',
      aiAnalysis: aiResult,
    };
  }

  // Step 3: Fallback to formula
  const formulaPrice = formulaRetailPrice(cost);
  return {
    cost,
    retailPrice: formulaPrice,
    competitorData: competitorPrices,
    source: 'formula',
  };
}

export default { calculateCost, determinePrice };
