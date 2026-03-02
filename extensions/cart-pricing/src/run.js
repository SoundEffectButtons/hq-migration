// @ts-check

/**
 * Shopify Function for secure server-side pricing calculation
 * Cart Transform API - purchase.cart-transform.run
 *
 * Pricing logic must stay in sync with shopify-ext/src/components/PricePreview.jsx:
 * - Same constants: PRICE_PER_SQIN, PRECUT_FEE
 * - Same volume discount tiers (1-14: 0%, 15-49: 20%, 50-99: 30%, 100-249: 40%, 250+: 50%)
 *
 * Formula: unitPrice = (width × height × 0.0416) + (preCut ? 0.24 : 0)
 *          discountedUnitPrice = unitPrice * (1 - tier.discount)  [tier from quantity]
 */

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */

const PRICE_PER_SQIN = 0.0416;
const PRECUT_FEE = 0.24;

/** Volume discount tiers - must match PricePreview.jsx DISCOUNT_TIERS */
const DISCOUNT_TIERS = [
  { minQty: 1, maxQty: 14, discount: 0 },
  { minQty: 15, maxQty: 49, discount: 0.2 },
  { minQty: 50, maxQty: 99, discount: 0.3 },
  { minQty: 100, maxQty: 249, discount: 0.4 },
  { minQty: 250, maxQty: Infinity, discount: 0.5 },
];

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    const widthAttr = line.areaX?.value;
    const heightAttr = line.areaY?.value;
    const precutAttr = line.preCut?.value;
    const quantity = Math.max(1, Number(line.quantity) || 1);

    const width = parseFloat(widthAttr || "0");
    const height = parseFloat(heightAttr || "0");
    const precut = precutAttr === "Yes";

    if (!width || !height || width <= 0 || height <= 0) {
      continue;
    }

    // Unit price before discount (same as PricePreview: basePrice=0, areaPrice + preCutPrice)
    const areaPrice = width * height * PRICE_PER_SQIN;
    const preCutPrice = precut ? PRECUT_FEE : 0;
    const unitPrice = areaPrice + preCutPrice;

    // Apply volume discount tier by quantity
    const tier =
      DISCOUNT_TIERS.find((t) => quantity >= t.minQty && quantity <= t.maxQty) ||
      DISCOUNT_TIERS[0];
    const discountedUnitPrice = unitPrice * (1 - tier.discount);

    // Amount must be a Decimal (number) — NOT a string
    const finalPrice = Math.round(discountedUnitPrice * 100) / 100;

    operations.push({
      lineUpdate: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: finalPrice,
            },
          },
        },
      },
    });
  }

  return { operations };
}
