// @ts-check

/**
 * Shopify Function for secure server-side pricing calculation
 * Cart Transform API - purchase.cart-transform.run
 * 
 * This function calculates custom pricing based on:
 * - Area dimensions (width × height in inches)
 * - Pre-cut option ($0.24 additional)
 * 
 * Pricing formula: (width × height × $0.0416) + (preCut ? $0.24 : 0)
 */

/**
 * @typedef {import("../generated/api").RunInput} RunInput
 * @typedef {import("../generated/api").FunctionRunResult} FunctionRunResult
 */

/**
 * @param {RunInput} input
 * @returns {FunctionRunResult}
 */
export function run(input) {
  const operations = [];

  for (const line of input.cart.lines) {
    // Get custom attributes from line item
    const widthAttr = line.areaX?.value;
    const heightAttr = line.areaY?.value;
    const precutAttr = line.preCut?.value;

    // Get currency code from the line item cost
    const currencyCode = line.cost?.amountPerQuantity?.currencyCode || "USD";

    // Parse dimensions
    const width = parseFloat(widthAttr || "0");
    const height = parseFloat(heightAttr || "0");
    const precut = precutAttr === "Yes";

    // Skip if no valid dimensions
    if (!width || !height || width <= 0 || height <= 0) {
      continue;
    }

    // Calculate price based on area
    // Base price: $0.0416 per square inch
    let price = width * height * 0.0416;

    // Add pre-cut fee if applicable
    if (precut) {
      price += 0.24;
    }

    // Round to 2 decimal places
    const finalPrice = price.toFixed(2);

    // Add update operation for this line item
    operations.push({
      update: {
        cartLineId: line.id,
        price: {
          adjustment: {
            fixedPricePerUnit: {
              amount: finalPrice,
              currencyCode: currencyCode
            }
          }
        }
      }
    });
  }

  return { operations };
}
