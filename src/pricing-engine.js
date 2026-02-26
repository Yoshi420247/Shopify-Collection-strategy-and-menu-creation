// Pricing engine for wholesaler → Shopify product pricing
// 1. Calculates Shopify unit cost from WYN wholesale price using tiered multipliers
// 2. Researches competitor prices + recommends retail price via Gemini Flash w/ Google Search grounding
// 3. Single AI call: searches the web, analyzes competitors, and recommends pricing
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

// ── Grounded price research + AI recommendation (single Gemini Flash call) ──
// Uses Google Search grounding so Gemini searches the web for competitor prices
// and recommends optimal retail pricing — all in one fast, cheap API call.
async function groundedPriceAnalysis(productName, productType, cost) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.log('    GOOGLE_API_KEY not set — skipping grounded price research');
    return null;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ googleSearch: {} }],
  });

  const prompt = `You are a retail pricing analyst for an online smoke shop.

Product: "${productName}"
Category: ${productType || 'Smoke Shop Products'}
My cost: $${cost.toFixed(2)}

Search the web for current retail prices of this product (or very similar products) at online smoke shops, head shops, and vape retailers. Look for real prices people are charging.

Then determine the optimal retail price. Consider:
1. Competitor prices you found: price competitively within the market range
2. Minimum acceptable margin: 40% above cost ($${(cost * 1.4).toFixed(2)})
3. Use psychological pricing: .99 endings for under $50, .95 or round for $50+
4. Smoke shop products typically have 50-150% markup over cost

Return ONLY a JSON object (no markdown fences):
{
  "recommended_price": number,
  "price_floor": number,
  "price_ceiling": number,
  "confidence": "high"|"medium"|"low",
  "reasoning": "brief explanation including competitor prices found",
  "competitor_prices": [{"price": number, "source": "store name or url"}]
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonStr = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(jsonStr);

    // Extract competitor data for downstream logging
    const competitorData = (parsed.competitor_prices || []).map(p => ({
      price: p.price,
      source: p.source || '',
      title: p.source || '',
    }));

    return { aiResult: parsed, competitorData };
  } catch (err) {
    console.log(`    Grounded price analysis failed: ${err.message || 'unknown error'}`);
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

  // Step 1: Grounded AI analysis — searches web + recommends price in one call
  const grounded = await groundedPriceAnalysis(productName, productType, cost);

  if (grounded?.aiResult?.recommended_price > cost) {
    // Ensure minimum margin of 40%
    const minPrice = cost * 1.4;
    const finalPrice = Math.max(grounded.aiResult.recommended_price, minPrice);

    return {
      cost,
      retailPrice: Math.round(finalPrice * 100) / 100,
      competitorData: grounded.competitorData,
      source: 'ai_grounded_search',
      aiAnalysis: grounded.aiResult,
    };
  }

  // Step 2: Fallback to formula
  const formulaPrice = formulaRetailPrice(cost);
  return {
    cost,
    retailPrice: formulaPrice,
    competitorData: grounded?.competitorData || [],
    source: 'formula',
  };
}

export default { calculateCost, determinePrice };
