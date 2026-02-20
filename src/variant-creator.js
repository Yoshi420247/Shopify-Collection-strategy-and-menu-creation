// Shopify variant creator - applies AI variant analysis to create/update product variants
import {
  updateProduct,
  createProductVariant,
  getLocations,
  setInventoryLevel,
} from './shopify-api.js';

// ── SKU abbreviation mappings ──────────────────────────────────────────────

const COLOR_CODES = {
  'red': 'RED', 'blue': 'BLU', 'green': 'GRN', 'purple': 'PUR',
  'pink': 'PNK', 'black': 'BLK', 'white': 'WHT', 'clear': 'CLR',
  'amber': 'AMB', 'rainbow': 'RBW', 'orange': 'ORG', 'yellow': 'YLW',
  'teal': 'TEL', 'gold': 'GLD', 'silver': 'SLV', 'smoke': 'SMK',
  'gray': 'GRY', 'grey': 'GRY', 'multi-color': 'MUL', 'brown': 'BRN',
  'aqua': 'AQU', 'coral': 'CRL', 'navy': 'NVY', 'lime': 'LME',
  'turquoise': 'TRQ', 'maroon': 'MRN', 'lavender': 'LAV', 'mint': 'MNT',
  'rose': 'RSE', 'cream': 'CRM', 'olive': 'OLV', 'cyan': 'CYN',
  'magenta': 'MAG', 'charcoal': 'CHR', 'ivory': 'IVR', 'peach': 'PCH',
  'smoke gray': 'SMG', 'light blue': 'LBL', 'dark blue': 'DBL',
  'dark green': 'DGN', 'light green': 'LGN', 'hot pink': 'HPK',
  'baby blue': 'BBL', 'sky blue': 'SKB', 'neon green': 'NGN',
  'neon pink': 'NPK', 'forest green': 'FGN', 'royal blue': 'RBL',
};

const SIZE_CODES = {
  'small': 'SM', 'medium': 'MD', 'large': 'LG', 'extra large': 'XL',
  'mini': 'MN', 'xl': 'XL', '6 inch': '6IN', '8 inch': '8IN',
  '10 inch': '10N', '12 inch': '12N', '14 inch': '14N', '16 inch': '16N',
  '18 inch': '18N', '10mm': '10M', '14mm': '14M', '18mm': '18M',
};

function getSkuSuffix(type, value) {
  const normalized = value.toLowerCase().trim();
  if (type === 'color') {
    return COLOR_CODES[normalized] || normalized.replace(/[^a-z]/g, '').substring(0, 3).toUpperCase();
  }
  if (type === 'size') {
    return SIZE_CODES[normalized] || normalized.replace(/[^a-z0-9]/g, '').substring(0, 4).toUpperCase();
  }
  // style
  return normalized.replace(/[^a-z]/g, '').substring(0, 3).toUpperCase();
}

function generateVariantSku(baseSku, optionValues) {
  if (!baseSku) baseSku = 'NOSKU';
  // Strip existing variant suffix if re-processing (e.g., NOSKU-RED → NOSKU)
  const cleanBase = baseSku.replace(/-[A-Z0-9]{2,4}$/, '');
  const types = ['color', 'size', 'style'];
  const suffixes = optionValues.map((v, i) => getSkuSuffix(types[i] || 'style', v));
  return `${cleanBase}-${suffixes.join('-')}`;
}

// ── Combination builder ────────────────────────────────────────────────────

function buildCombinations(optionTypes) {
  if (optionTypes.length === 0) return [];
  if (optionTypes.length === 1) {
    return optionTypes[0].values.map(v => [{ name: optionTypes[0].name, value: v }]);
  }
  const result = [];
  const [first, ...rest] = optionTypes;
  const restCombos = buildCombinations(rest);
  for (const val of first.values) {
    for (const combo of restCombos) {
      result.push([{ name: first.name, value: val }, ...combo]);
    }
  }
  return result;
}

// ── Plan builder ───────────────────────────────────────────────────────────

/**
 * Compare existing product variants with AI analysis and produce a change plan.
 * Does NOT modify Shopify — pure data transformation.
 */
export function buildVariantPlan(product, analysis) {
  const currentVariants = product.variants || [];
  const detected = analysis.detected_variants || {};

  // Determine which option types to create (must have >1 value to be useful)
  const optionTypes = [];
  if (detected.color && detected.color.length > 1) {
    optionTypes.push({ name: 'Color', values: detected.color });
  }
  if (detected.size && detected.size.length > 1) {
    optionTypes.push({ name: 'Size', values: detected.size });
  }
  if (detected.style && detected.style.length > 1) {
    optionTypes.push({ name: 'Style', values: detected.style });
  }

  // Nothing to do?
  if (optionTypes.length === 0) {
    return {
      action: 'skip',
      reason: analysis.has_variants
        ? 'AI detected variants but each type has only 1 value'
        : 'No variants detected',
      currentVariantCount: currentVariants.length,
      proposedVariantCount: currentVariants.length,
      changes: [],
    };
  }

  // Shopify limits: max 3 option types, max 100 variants
  if (optionTypes.length > 3) optionTypes.length = 3;

  const baseVariant = currentVariants[0];
  const basePrice = baseVariant?.price || '0.00';
  const baseSku = baseVariant?.sku || '';
  const baseWeight = baseVariant?.weight || 0;
  const baseWeightUnit = baseVariant?.weight_unit || 'g';
  const baseInventoryQty = baseVariant?.inventory_quantity || 0;
  const baseTaxable = baseVariant?.taxable !== false;
  const baseRequiresShipping = baseVariant?.requires_shipping !== false;

  // Check if product has only the default single variant
  const isDefaultSingle = currentVariants.length === 1 &&
    (currentVariants[0].title === 'Default Title' || !currentVariants[0].option2);

  // ── CASE 1: Convert single-variant → multi-variant ───────────────────
  if (isDefaultSingle) {
    const combos = buildCombinations(optionTypes);

    // Shopify hard limit
    if (combos.length > 100) {
      return {
        action: 'skip',
        reason: `Too many variant combinations (${combos.length} > 100 Shopify limit)`,
        currentVariantCount: 1,
        proposedVariantCount: combos.length,
        changes: [],
      };
    }

    const newVariants = combos.map((combo, idx) => {
      const optionValues = combo.map(c => c.value);
      const variant = {
        option1: optionValues[0] || null,
        option2: optionValues[1] || null,
        option3: optionValues[2] || null,
        price: basePrice,
        sku: generateVariantSku(baseSku, optionValues),
        weight: baseWeight,
        weight_unit: baseWeightUnit,
        taxable: baseTaxable,
        requires_shipping: baseRequiresShipping,
        inventory_management: 'shopify',
      };
      // First variant keeps the existing Shopify variant ID (preserves inventory item)
      if (idx === 0) {
        variant.id = baseVariant.id;
      }
      return variant;
    });

    return {
      action: 'create_variants',
      reason: `Converting from single variant to ${combos.length} variants`,
      currentVariantCount: 1,
      proposedVariantCount: combos.length,
      options: optionTypes.map(ot => ({ name: ot.name, values: ot.values })),
      variants: newVariants,
      inventoryToCopy: baseInventoryQty,
      changes: [
        `Add options: ${optionTypes.map(ot => `${ot.name} (${ot.values.join(', ')})`).join(' | ')}`,
        `Create ${combos.length} variants (price: $${basePrice} each)`,
      ],
    };
  }

  // ── CASE 2: Product already has variants — suggest additions ─────────
  const existingOptions = product.options || [];
  const changes = [];
  const variantsToAdd = [];

  for (const optionType of optionTypes) {
    // Find matching existing option by name (case-insensitive)
    const existingOpt = existingOptions.find(
      o => o.name.toLowerCase() === optionType.name.toLowerCase()
    );

    if (existingOpt) {
      // Option exists — find new values not yet present
      const existingVals = new Set(existingOpt.values.map(v => v.toLowerCase()));
      const newVals = optionType.values.filter(v => !existingVals.has(v.toLowerCase()));

      if (newVals.length > 0) {
        // Position in Shopify's option1/option2/option3
        const optKey = `option${existingOpt.position}`;

        for (const val of newVals) {
          const variant = {
            [optKey]: val,
            price: basePrice,
            sku: generateVariantSku(baseSku, [val]),
            weight: baseWeight,
            weight_unit: baseWeightUnit,
            taxable: baseTaxable,
            requires_shipping: baseRequiresShipping,
            inventory_management: 'shopify',
          };
          // Fill other option positions with first existing value (Shopify requires all options)
          for (const otherOpt of existingOptions) {
            if (otherOpt.position !== existingOpt.position) {
              variant[`option${otherOpt.position}`] = otherOpt.values[0];
            }
          }
          variantsToAdd.push(variant);
        }
        changes.push(`Add ${optionType.name} values: ${newVals.join(', ')}`);
      }
    } else if (existingOptions.length < 3) {
      // Completely new option type — can add if product has < 3 options
      changes.push(`New option "${optionType.name}" detected: ${optionType.values.join(', ')} (requires manual setup — Shopify cannot add new option types to existing multi-variant products via REST)`);
    }
  }

  if (changes.length === 0) {
    return {
      action: 'skip',
      reason: 'All detected variants already exist on this product',
      currentVariantCount: currentVariants.length,
      proposedVariantCount: currentVariants.length,
      changes: [],
    };
  }

  // Guard against exceeding Shopify's 100 variant limit
  if (currentVariants.length + variantsToAdd.length > 100) {
    return {
      action: 'skip',
      reason: `Adding ${variantsToAdd.length} variants would exceed Shopify's 100 variant limit (currently ${currentVariants.length})`,
      currentVariantCount: currentVariants.length,
      proposedVariantCount: currentVariants.length + variantsToAdd.length,
      changes,
    };
  }

  return {
    action: 'update_variants',
    reason: `Adding ${variantsToAdd.length} new variant(s) to existing ${currentVariants.length}`,
    currentVariantCount: currentVariants.length,
    proposedVariantCount: currentVariants.length + variantsToAdd.length,
    variantsToAdd,
    inventoryToCopy: baseInventoryQty,
    changes,
  };
}

// ── Apply plan to Shopify ──────────────────────────────────────────────────

// Cache location ID across calls
let _cachedLocationId = null;

async function getLocationId() {
  if (_cachedLocationId) return _cachedLocationId;
  const data = await getLocations();
  _cachedLocationId = data.locations?.[0]?.id || null;
  return _cachedLocationId;
}

/**
 * Execute a variant plan against the Shopify API.
 * @param {Object} product - The Shopify product
 * @param {Object} plan - Output of buildVariantPlan()
 * @returns {Object} { success, action, message, variantCount? }
 */
export async function applyVariantPlan(product, plan) {
  if (plan.action === 'skip') {
    return { success: true, action: 'skip', message: plan.reason };
  }

  const locationId = await getLocationId();

  // ── CASE 1: Single → multi variant conversion ─────────────────────────
  if (plan.action === 'create_variants') {
    console.log(`    Applying: ${plan.reason}`);

    try {
      const result = await updateProduct(product.id, {
        options: plan.options.map(opt => ({ name: opt.name })),
        variants: plan.variants,
      });

      if (!result.product) {
        return { success: false, action: 'create_variants', message: 'Shopify returned no product data' };
      }

      // Set inventory for newly created variants (skip first — it kept original inventory)
      if (locationId && plan.inventoryToCopy > 0) {
        const newVariants = result.product.variants.slice(1);
        for (const variant of newVariants) {
          try {
            await setInventoryLevel(variant.inventory_item_id, locationId, plan.inventoryToCopy);
          } catch (invErr) {
            console.log(`    Warning: Inventory set failed for variant ${variant.id}: ${invErr.message}`);
          }
        }
      }

      return {
        success: true,
        action: 'create_variants',
        message: `Created ${result.product.variants.length} variants`,
        variantCount: result.product.variants.length,
      };
    } catch (err) {
      return { success: false, action: 'create_variants', message: `API error: ${err.message}` };
    }
  }

  // ── CASE 2: Add variants to existing multi-variant product ─────────────
  if (plan.action === 'update_variants') {
    console.log(`    Applying: ${plan.reason}`);

    let created = 0;
    for (const variantData of plan.variantsToAdd) {
      try {
        const result = await createProductVariant(product.id, variantData);
        if (result.variant) {
          created++;
          // Copy inventory to new variant
          if (locationId && plan.inventoryToCopy > 0) {
            try {
              await setInventoryLevel(result.variant.inventory_item_id, locationId, plan.inventoryToCopy);
            } catch (invErr) {
              console.log(`    Warning: Inventory set failed for variant ${result.variant.id}: ${invErr.message}`);
            }
          }
        }
      } catch (err) {
        console.log(`    Warning: Failed to create variant: ${err.message}`);
      }
    }

    return {
      success: true,
      action: 'update_variants',
      message: `Added ${created} of ${plan.variantsToAdd.length} new variants`,
      variantCount: created,
    };
  }

  return { success: false, action: plan.action, message: `Unknown action: ${plan.action}` };
}

export default { buildVariantPlan, applyVariantPlan };
