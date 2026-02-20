// ============================================================================
// Recovery Analytics Module
// Generates comprehensive reports on abandoned cart recovery performance,
// tracks KPIs, identifies trends, and provides actionable recommendations.
// ============================================================================

export class RecoveryAnalytics {
  constructor(config) {
    this.config = config;
  }

  /**
   * Generates a full analytics report from abandoned checkout data.
   */
  async generateReport(checkouts, engine) {
    const report = {
      generatedAt: new Date().toISOString(),
      periodDays: 7,
      totalCheckouts: checkouts.length,
      totalAbandonedValue: 0,
      avgCartValue: 0,
      medianCartValue: 0,
      categoryBreakdown: {},
      segmentDistribution: {},
      valueTierDistribution: {},
      timeDistribution: {},
      abandonmentReasons: {},
      recommendations: [],
    };

    const cartValues = [];

    // Analyze each checkout
    for (const checkout of checkouts) {
      const value = parseFloat(checkout.total_price || 0);
      report.totalAbandonedValue += value;
      cartValues.push(value);

      // Category analysis
      const category = await this.classifyCheckoutCategory(checkout, engine);
      if (!report.categoryBreakdown[category]) {
        report.categoryBreakdown[category] = { count: 0, totalValue: 0, avgValue: 0 };
      }
      report.categoryBreakdown[category].count++;
      report.categoryBreakdown[category].totalValue += value;

      // Segment analysis
      const segment = await engine.segmentCustomer(checkout);
      const segName = segment.name;
      report.segmentDistribution[segName] = (report.segmentDistribution[segName] || 0) + 1;

      // Value tier analysis
      const tier = engine.analyzer.getCartValueTier(value);
      const tierName = tier.name;
      report.valueTierDistribution[tierName] = (report.valueTierDistribution[tierName] || 0) + 1;

      // Time distribution (hour of day)
      const hour = new Date(checkout.created_at).getHours();
      const hourBucket = `${hour.toString().padStart(2, '0')}:00`;
      report.timeDistribution[hourBucket] = (report.timeDistribution[hourBucket] || 0) + 1;
    }

    // Calculate averages
    report.avgCartValue = checkouts.length > 0
      ? report.totalAbandonedValue / checkouts.length
      : 0;

    // Calculate median
    cartValues.sort((a, b) => a - b);
    const mid = Math.floor(cartValues.length / 2);
    report.medianCartValue = cartValues.length > 0
      ? (cartValues.length % 2 !== 0
        ? cartValues[mid]
        : (cartValues[mid - 1] + cartValues[mid]) / 2)
      : 0;

    // Calculate category averages
    for (const cat of Object.values(report.categoryBreakdown)) {
      cat.avgValue = cat.count > 0 ? cat.totalValue / cat.count : 0;
    }

    // Generate recommendations
    report.recommendations = this.generateRecommendations(report);

    return report;
  }

  /**
   * Classifies a checkout into a product category for analytics.
   */
  async classifyCheckoutCategory(checkout, engine) {
    const lineItems = checkout.line_items || [];
    if (lineItems.length === 0) return 'empty';

    let oilSlickValue = 0;
    let smokeshopValue = 0;

    for (const item of lineItems) {
      const category = await engine.classifyProduct(item);
      const value = parseFloat(item.price) * item.quantity;

      if (category === 'oilSlick') oilSlickValue += value;
      else if (category === 'smokeshop') smokeshopValue += value;
    }

    if (oilSlickValue > 0 && smokeshopValue > 0) return 'mixed';
    if (oilSlickValue > smokeshopValue) return 'oilSlick';
    if (smokeshopValue > 0) return 'smokeshop';
    return 'unknown';
  }

  /**
   * Generates actionable recommendations based on the analytics data.
   */
  generateRecommendations(report) {
    const recommendations = [];

    // ── High-value carts need white-glove treatment ──
    const whaleCount = report.valueTierDistribution['Whale Cart'] || 0;
    if (whaleCount > 0) {
      recommendations.push(
        `${whaleCount} whale cart(s) ($500+) abandoned this week. Consider personal phone outreach for these high-value opportunities.`
      );
    }

    // ── New visitor trust issues ──
    const newVisitorCount = report.segmentDistribution['New Visitor'] || 0;
    const totalCheckouts = report.totalCheckouts;
    if (newVisitorCount / totalCheckouts > 0.5) {
      recommendations.push(
        `${((newVisitorCount / totalCheckouts) * 100).toFixed(0)}% of abandonments are from new visitors. Invest in trust signals: reviews, security badges, and a visible return policy.`
      );
    }

    // ── Category-specific insights ──
    const oilSlick = report.categoryBreakdown.oilSlick;
    const smokeshop = report.categoryBreakdown.smokeshop;

    if (oilSlick && smokeshop) {
      if (oilSlick.avgValue > smokeshop.avgValue * 1.5) {
        recommendations.push(
          `Oil Slick carts average $${oilSlick.avgValue.toFixed(0)} vs $${smokeshop.avgValue.toFixed(0)} for smokeshop. Consider offering bulk/wholesale pricing tiers to convert high-value Oil Slick carts.`
        );
      }
    }

    // ── Time-based patterns ──
    const sortedHours = Object.entries(report.timeDistribution).sort((a, b) => b[1] - a[1]);
    if (sortedHours.length >= 3) {
      const peakHours = sortedHours.slice(0, 3).map(([h]) => h);
      recommendations.push(
        `Peak abandonment hours: ${peakHours.join(', ')}. Schedule recovery emails to avoid these windows (send reminders 1hr after peak ends).`
      );
    }

    // ── Cart value optimization ──
    if (report.medianCartValue < 50) {
      recommendations.push(
        `Median abandoned cart value is $${report.medianCartValue.toFixed(0)}. Consider bundling strategies to increase AOV above the free shipping threshold.`
      );
    }

    // ── Micro cart strategy ──
    const microCount = report.valueTierDistribution['Micro Cart'] || 0;
    if (microCount / totalCheckouts > 0.3) {
      recommendations.push(
        `${((microCount / totalCheckouts) * 100).toFixed(0)}% of abandoned carts are under $25. Reduce recovery effort for these (2 emails max, no discounts) to protect margins.`
      );
    }

    // ── Total opportunity sizing ──
    const recoveryTarget = 0.15; // 15% industry benchmark
    const estimatedRecovery = report.totalAbandonedValue * recoveryTarget;
    recommendations.push(
      `Total abandoned value: $${report.totalAbandonedValue.toFixed(0)}. At a 15% recovery rate, you could recapture ~$${estimatedRecovery.toFixed(0)} per week.`
    );

    return recommendations;
  }

  /**
   * Calculates estimated revenue impact of the recovery workflow.
   */
  calculateRevenueImpact(report) {
    const { emailSequence } = this.config;

    // Calculate expected recovery per email in sequence
    const emailImpact = emailSequence.map((email, index) => {
      const reachRate = Math.pow(0.85, index); // 15% drop-off per email
      const reached = report.totalCheckouts * reachRate;
      const converted = reached * email.expectedMetrics.conversionRate;
      const revenue = converted * report.avgCartValue;

      return {
        emailName: email.name,
        emailIndex: index + 1,
        estimatedReach: Math.round(reached),
        estimatedConversions: Math.round(converted),
        estimatedRevenue: Math.round(revenue),
      };
    });

    const totalRevenue = emailImpact.reduce((sum, e) => sum + e.estimatedRevenue, 0);
    const totalConversions = emailImpact.reduce((sum, e) => sum + e.estimatedConversions, 0);

    return {
      emailImpact,
      totalEstimatedRevenue: totalRevenue,
      totalEstimatedConversions: totalConversions,
      estimatedRecoveryRate: report.totalCheckouts > 0
        ? totalConversions / report.totalCheckouts
        : 0,
      weeklyProjection: totalRevenue,
      monthlyProjection: totalRevenue * 4.3,
      annualProjection: totalRevenue * 52,
    };
  }

  /**
   * Compares current period performance against benchmarks.
   */
  benchmarkComparison(actualMetrics) {
    const benchmarks = this.config.analytics.kpis;
    const comparisons = [];

    for (const kpi of benchmarks) {
      if (kpi.target === null) continue;

      const actual = actualMetrics[kpi.id];
      if (actual === undefined) continue;

      const performance = actual / kpi.target;
      let status;
      if (performance >= 1.0) status = 'above_target';
      else if (performance >= 0.8) status = 'near_target';
      else status = 'below_target';

      comparisons.push({
        kpi: kpi.name,
        target: kpi.target,
        actual,
        performance: `${(performance * 100).toFixed(0)}%`,
        status,
        gap: actual - kpi.target,
      });
    }

    return comparisons;
  }

  /**
   * Prints a formatted analytics dashboard to console.
   */
  printDashboard(report, revenueImpact) {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║      ABANDONED CART RECOVERY — ANALYTICS DASHBOARD         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    console.log('📊 OVERVIEW');
    console.log('───────────');
    console.log(`  Abandoned checkouts:     ${report.totalCheckouts}`);
    console.log(`  Total abandoned value:   $${report.totalAbandonedValue.toFixed(2)}`);
    console.log(`  Average cart value:      $${report.avgCartValue.toFixed(2)}`);
    console.log(`  Median cart value:       $${report.medianCartValue.toFixed(2)}`);
    console.log('');

    console.log('💰 REVENUE IMPACT ESTIMATE');
    console.log('──────────────────────────');
    if (revenueImpact) {
      for (const email of revenueImpact.emailImpact) {
        console.log(`  Email #${email.emailIndex} (${email.emailName}): ~$${email.estimatedRevenue} from ~${email.estimatedConversions} conversions`);
      }
      console.log(`  ──────────────────`);
      console.log(`  Weekly projection:   $${revenueImpact.weeklyProjection.toLocaleString()}`);
      console.log(`  Monthly projection:  $${revenueImpact.monthlyProjection.toLocaleString()}`);
      console.log(`  Annual projection:   $${revenueImpact.annualProjection.toLocaleString()}`);
    }
    console.log('');

    console.log('🏷️  CATEGORY BREAKDOWN');
    console.log('──────────────────────');
    for (const [cat, data] of Object.entries(report.categoryBreakdown)) {
      const pct = ((data.count / report.totalCheckouts) * 100).toFixed(0);
      console.log(`  ${cat}: ${data.count} carts (${pct}%) — $${data.totalValue.toFixed(0)} total, $${data.avgValue.toFixed(0)} avg`);
    }
    console.log('');

    console.log('👤 CUSTOMER SEGMENTS');
    console.log('────────────────────');
    for (const [seg, count] of Object.entries(report.segmentDistribution)) {
      const pct = ((count / report.totalCheckouts) * 100).toFixed(0);
      console.log(`  ${seg}: ${count} (${pct}%)`);
    }
    console.log('');

    console.log('💵 CART VALUE DISTRIBUTION');
    console.log('─────────────────────────');
    for (const [tier, count] of Object.entries(report.valueTierDistribution)) {
      const pct = ((count / report.totalCheckouts) * 100).toFixed(0);
      const bar = '█'.repeat(Math.round(pct / 3));
      console.log(`  ${tier.padEnd(12)} ${bar} ${count} (${pct}%)`);
    }
    console.log('');

    console.log('🎯 RECOMMENDATIONS');
    console.log('──────────────────');
    for (const rec of report.recommendations) {
      console.log(`  • ${rec}`);
    }
    console.log('');
  }
}

export default RecoveryAnalytics;
