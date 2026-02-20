// ============================================================================
// A/B Test Manager
// Manages experiment allocation, variant selection, and result tracking
// for abandoned cart recovery optimization.
//
// Uses deterministic hashing so the same checkout always gets the same
// variant (no re-randomization on re-runs).
// ============================================================================

import crypto from 'crypto';

export class ABTestManager {
  constructor(config) {
    this.config = config;
    this.results = new Map(); // testId → { variantId → { impressions, clicks, conversions, revenue } }
  }

  /**
   * Selects A/B test variants for a given checkout.
   * Uses consistent hashing so the same checkout always gets the same variants.
   *
   * @param {string|number} checkoutId - Unique checkout identifier
   * @returns {Object} Map of element → selected variant
   */
  selectVariants(checkoutId) {
    const { abTesting } = this.config;
    if (!abTesting?.enabled) return {};

    const variants = {};

    for (const test of abTesting.tests) {
      if (!test.active) continue;

      const variantIndex = this.hashToIndex(checkoutId, test.id, test.variants.length);
      const selectedVariant = test.variants[variantIndex];

      variants[test.element] = {
        testId: test.id,
        testName: test.name,
        variantId: selectedVariant.id,
        ...selectedVariant,
      };
    }

    return variants;
  }

  /**
   * Deterministic hash function that maps a checkout to a variant index.
   * Ensures consistent allocation across runs.
   */
  hashToIndex(checkoutId, testId, numVariants) {
    const hash = crypto
      .createHash('md5')
      .update(`${checkoutId}-${testId}`)
      .digest('hex');

    // Convert first 8 hex chars to integer, mod by variant count
    const num = parseInt(hash.substring(0, 8), 16);
    return num % numVariants;
  }

  /**
   * Records an event (impression, click, conversion) for a test variant.
   */
  recordEvent(testId, variantId, eventType, value = 0) {
    if (!this.results.has(testId)) {
      this.results.set(testId, new Map());
    }

    const testResults = this.results.get(testId);
    if (!testResults.has(variantId)) {
      testResults.set(variantId, {
        impressions: 0,
        opens: 0,
        clicks: 0,
        conversions: 0,
        revenue: 0,
      });
    }

    const variantData = testResults.get(variantId);

    switch (eventType) {
      case 'impression':
      case 'send':
        variantData.impressions++;
        break;
      case 'open':
        variantData.opens++;
        break;
      case 'click':
        variantData.clicks++;
        break;
      case 'conversion':
        variantData.conversions++;
        variantData.revenue += value;
        break;
    }
  }

  /**
   * Evaluates all active tests and determines winners.
   * Uses chi-squared test for proportions.
   */
  evaluateTests() {
    const evaluations = [];
    const { abTesting } = this.config;

    for (const test of abTesting.tests) {
      if (!test.active) continue;

      const testResults = this.results.get(test.id);
      if (!testResults) {
        evaluations.push({
          testId: test.id,
          testName: test.name,
          status: 'insufficient_data',
          message: 'No data collected yet',
        });
        continue;
      }

      const variantResults = [];
      let totalImpressions = 0;

      for (const variant of test.variants) {
        const data = testResults.get(variant.id) || {
          impressions: 0, opens: 0, clicks: 0, conversions: 0, revenue: 0,
        };
        totalImpressions += data.impressions;

        // Calculate rates based on primary metric
        let rate;
        switch (test.primaryMetric) {
          case 'open_rate':
            rate = data.impressions > 0 ? data.opens / data.impressions : 0;
            break;
          case 'click_rate':
            rate = data.impressions > 0 ? data.clicks / data.impressions : 0;
            break;
          case 'conversion_rate':
            rate = data.impressions > 0 ? data.conversions / data.impressions : 0;
            break;
          case 'revenue_per_recipient':
            rate = data.impressions > 0 ? data.revenue / data.impressions : 0;
            break;
          default:
            rate = 0;
        }

        variantResults.push({
          variantId: variant.id,
          impressions: data.impressions,
          rate,
          ...data,
        });
      }

      // Check minimum sample size
      const minSample = abTesting.minimumSampleSize;
      const allMeetMinimum = variantResults.every(v => v.impressions >= minSample);

      if (!allMeetMinimum) {
        evaluations.push({
          testId: test.id,
          testName: test.name,
          status: 'collecting_data',
          totalImpressions,
          requiredPerVariant: minSample,
          variants: variantResults,
          message: `Need ${minSample} impressions per variant. Current: ${variantResults.map(v => v.impressions).join(', ')}`,
        });
        continue;
      }

      // Find the best variant
      const sorted = [...variantResults].sort((a, b) => b.rate - a.rate);
      const winner = sorted[0];
      const runnerUp = sorted[1];

      // Calculate statistical significance (simplified z-test for proportions)
      const significance = this.calculateSignificance(winner, runnerUp);

      evaluations.push({
        testId: test.id,
        testName: test.name,
        primaryMetric: test.primaryMetric,
        status: significance >= abTesting.confidenceLevel ? 'winner_found' : 'no_clear_winner',
        significance,
        requiredSignificance: abTesting.confidenceLevel,
        winner: significance >= abTesting.confidenceLevel ? winner.variantId : null,
        variants: sorted.map(v => ({
          variantId: v.variantId,
          impressions: v.impressions,
          rate: (v.rate * 100).toFixed(2) + '%',
          lift: winner === v ? 'baseline' : `${(((v.rate - winner.rate) / winner.rate) * 100).toFixed(1)}%`,
        })),
        recommendation: significance >= abTesting.confidenceLevel
          ? `Implement "${winner.variantId}" as the default — ${(significance * 100).toFixed(1)}% confidence`
          : `Continue testing — only ${(significance * 100).toFixed(1)}% confidence (need ${(abTesting.confidenceLevel * 100).toFixed(0)}%)`,
      });
    }

    return evaluations;
  }

  /**
   * Simplified z-test for two proportions.
   * Returns confidence level (0-1).
   */
  calculateSignificance(variantA, variantB) {
    if (variantA.impressions === 0 || variantB.impressions === 0) return 0;

    const pA = variantA.rate;
    const pB = variantB.rate;
    const nA = variantA.impressions;
    const nB = variantB.impressions;

    // Pooled proportion
    const pPooled = (pA * nA + pB * nB) / (nA + nB);
    if (pPooled === 0 || pPooled === 1) return 0;

    // Standard error
    const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / nA + 1 / nB));
    if (se === 0) return 0;

    // Z-score
    const z = Math.abs(pA - pB) / se;

    // Convert z-score to confidence (approximate using standard normal CDF)
    return this.normalCDF(z);
  }

  /**
   * Approximation of the standard normal CDF.
   */
  normalCDF(z) {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Generates a summary report of all A/B tests.
   */
  generateReport() {
    const evaluations = this.evaluateTests();

    console.log('\n📊 A/B TEST REPORT');
    console.log('══════════════════\n');

    for (const evaluation of evaluations) {
      console.log(`Test: ${evaluation.testName} (${evaluation.testId})`);
      console.log(`Status: ${evaluation.status}`);

      if (evaluation.variants) {
        for (const v of evaluation.variants) {
          const marker = v.variantId === evaluation.winner ? ' ← WINNER' : '';
          console.log(`  ${v.variantId}: ${v.rate} (n=${v.impressions})${marker}`);
        }
      }

      if (evaluation.recommendation) {
        console.log(`Recommendation: ${evaluation.recommendation}`);
      }

      console.log('');
    }

    return evaluations;
  }
}

export default ABTestManager;
