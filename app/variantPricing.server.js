/**
 * Server-side pricing engine and dynamic variant manager.
 *
 * Architecture:
 *  - calculateUnitPrice()  → pure pricing formula, no I/O
 *  - getOrCreateVariant()  → queries the carrier product, reuses or creates a variant
 *  - deleteVariant()       → removes a single variant (used post-order)
 *
 * Carrier product setup requirement:
 *   The product at CUSTOM_PRODUCT_ID must have a single option called "Price".
 *   Each dynamic variant maps one unique price to one option value (the price string).
 *   Pool is capped at MAX_VARIANTS; when full, PRUNE_COUNT oldest are removed first.
 *
 * Environment:
 *   CUSTOM_PRODUCT_ID=gid://shopify/Product/7918491762736
 */

// ─── Pricing constants ────────────────────────────────────────────────────────

const PRICE_PER_SQIN = 0.0416;
const PRECUT_FEE = 0.24;

const DISCOUNT_TIERS = [
  { minQty: 1, maxQty: 14, discount: 0 },
  { minQty: 15, maxQty: 49, discount: 0.2 },
  { minQty: 50, maxQty: 99, discount: 0.3 },
  { minQty: 100, maxQty: 249, discount: 0.4 },
  { minQty: 250, maxQty: Infinity, discount: 0.5 },
];

// ─── Variant pool limits ──────────────────────────────────────────────────────

const MAX_VARIANTS = 90;
const PRUNE_COUNT = 10;

// The option name on the carrier product that holds the price value.
const CARRIER_OPTION_NAME = "Price";

// ─── GraphQL documents ────────────────────────────────────────────────────────

const GET_VARIANTS_QUERY = `#graphql
  query GetProductVariants($id: ID!) {
    product(id: $id) {
      options {
        id
        name
        values
      }
      variants(first: 250) {
        edges {
          node {
            id
            price
            createdAt
            selectedOptions { name value }
          }
        }
      }
    }
  }
`;

const CREATE_OPTION_MUTATION = `#graphql
  mutation CreateOption($productId: ID!, $options: [OptionCreateInput!]!) {
    productOptionsCreate(productId: $productId, options: $options) {
      product {
        options { id name values }
      }
      userErrors { field message }
    }
  }
`;

const ACTIVATE_PRODUCT_MUTATION = `#graphql
  mutation ActivateProduct($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id status }
      userErrors { field message }
    }
  }
`;

const GET_PRODUCT_STATUS_QUERY = `#graphql
  query GetProductStatus($id: ID!) {
    product(id: $id) {
      status
    }
  }
`;

const UPDATE_VARIANTS_MUTATION = `#graphql
  mutation UpdateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      productVariants { id price inventoryPolicy }
      userErrors { field message }
    }
  }
`;

const CREATE_VARIANT_MUTATION = `#graphql
  mutation CreateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkCreate(productId: $productId, variants: $variants) {
      productVariants {
        id
        price
      }
      userErrors { field message }
    }
  }
`;

const DELETE_VARIANTS_MUTATION = `#graphql
  mutation DeleteVariants($productId: ID!, $variantsIds: [ID!]!) {
    productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
      product { id }
      userErrors { field message }
    }
  }
`;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Calculate the final unit price after area formula and volume discount.
 *
 * Formula:  unitPrice = (width × height × 0.0416) + (preCut ? 0.24 : 0)
 *           discounted = unitPrice × (1 − tier.discount)   [tier from quantity]
 *
 * @param {number}  width    - inches
 * @param {number}  height   - inches
 * @param {boolean} preCut   - whether pre-cut service is requested
 * @param {number}  quantity - used to select the volume-discount tier
 * @returns {number} unit price rounded to 2 decimal places
 */
export function calculateUnitPrice(width, height, preCut, quantity) {
  const areaPrice = width * height * PRICE_PER_SQIN;
  const precutFee = preCut ? PRECUT_FEE : 0;
  const rawUnit = areaPrice + precutFee;

  const tier =
    DISCOUNT_TIERS.find((t) => quantity >= t.minQty && quantity <= t.maxQty) ??
    DISCOUNT_TIERS[0];

  return parseFloat((rawUnit * (1 - tier.discount)).toFixed(2));
}

/**
 * Make sure a variant is always cart-addable on storefront:
 *  - inventoryPolicy: CONTINUE (allow oversell)
 *  - inventory tracking disabled when supported by API input
 */
async function ensureVariantPurchasable(admin, productGid, variantId) {
  try {
    const res = await admin.graphql(UPDATE_VARIANTS_MUTATION, {
      variables: {
        productId: productGid,
        variants: [
          {
            id: variantId,
            inventoryPolicy: "CONTINUE",
            inventoryItem: { tracked: false },
          },
        ],
      },
    });
    const data = await res.json();
    const errs = data?.data?.productVariantsBulkUpdate?.userErrors ?? [];
    if (!errs.length) return true;

    // Some API versions/stores may reject inventoryItem in bulk update.
    const fallback = await admin.graphql(UPDATE_VARIANTS_MUTATION, {
      variables: {
        productId: productGid,
        variants: [{ id: variantId, inventoryPolicy: "CONTINUE" }],
      },
    });
    const fallbackData = await fallback.json();
    const fallbackErrs = fallbackData?.data?.productVariantsBulkUpdate?.userErrors ?? [];
    if (fallbackErrs.length) {
      console.error(
        "[variantPricing] ensureVariantPurchasable errors:",
        JSON.stringify(fallbackErrs),
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[variantPricing] ensureVariantPurchasable threw:", err);
    return false;
  }
}

/**
 * Find an existing carrier-product variant whose price matches exactly,
 * or create a new one.  Prunes the oldest PRUNE_COUNT variants when the
 * pool reaches MAX_VARIANTS.
 *
 * @param {object} admin      - Shopify Admin API client (from authenticate.*)
 * @param {string} productGid - GID, e.g. "gid://shopify/Product/7918491762736"
 * @param {number} price      - unit price (will be formatted to 2 decimal places)
 * @returns {Promise<{ variantGid: string, numericId: string }>}
 */
export async function getOrCreateVariant(admin, productGid, price) {
  const priceStr = price.toFixed(2);

  // ── 1. Load existing variants + product options ───────────────────────────
  const listRes = await admin.graphql(GET_VARIANTS_QUERY, {
    variables: { id: productGid },
  });
  const listJson = await listRes.json();

  if (listJson.errors?.length) {
    throw new Error(
      `[variantPricing] GetProductVariants error: ${JSON.stringify(listJson.errors)}`,
    );
  }

  const productData = listJson.data?.product;
  const edges = productData?.variants?.edges ?? [];
  const variants = edges.map((e) => e.node);
  const options = productData?.options ?? [];

  // ── 1b. Ensure carrier product is ACTIVE so storefront can add its variants ─
  const statusRes = await admin.graphql(GET_PRODUCT_STATUS_QUERY, {
    variables: { id: productGid },
  });
  const statusJson = await statusRes.json();
  const currentStatus = statusJson.data?.product?.status;

  if (currentStatus && currentStatus !== "ACTIVE") {
    console.log(
      `[variantPricing] Activating carrier product (was ${currentStatus})`,
    );
    const activateRes = await admin.graphql(ACTIVATE_PRODUCT_MUTATION, {
      variables: { input: { id: productGid, status: "ACTIVE" } },
    });
    const activateJson = await activateRes.json();
    const activateErrs = activateJson.data?.productUpdate?.userErrors ?? [];
    if (activateErrs.length) {
      console.error(
        "[variantPricing] Failed to activate product:",
        JSON.stringify(activateErrs),
      );
    } else {
      console.log("[variantPricing] Carrier product set to ACTIVE");
    }
  }

  // ── 2. Return existing variant if price already matches ────────────────────
  const match = variants.find(
    (v) => parseFloat(v.price).toFixed(2) === priceStr,
  );
  if (match) {
    await ensureVariantPurchasable(admin, productGid, match.id);
    return { variantGid: match.id, numericId: match.id.split("/").pop() };
  }

  // ── 3. Ensure the "Price" option exists on the product ────────────────────
  const priceOptionExists = options.some(
    (o) => o.name.toLowerCase() === CARRIER_OPTION_NAME.toLowerCase(),
  );

  if (!priceOptionExists) {
    console.log(
      `[variantPricing] Creating "${CARRIER_OPTION_NAME}" option on product`,
    );
    const optRes = await admin.graphql(CREATE_OPTION_MUTATION, {
      variables: {
        productId: productGid,
        options: [{ name: CARRIER_OPTION_NAME, values: [{ name: priceStr }] }],
      },
    });
    const optJson = await optRes.json();
    const optErrs = optJson.data?.productOptionsCreate?.userErrors ?? [];
    if (optErrs.length) {
      throw new Error(
        `[variantPricing] productOptionsCreate userErrors: ${JSON.stringify(optErrs)}`,
      );
    }
    console.log(`[variantPricing] "${CARRIER_OPTION_NAME}" option created`);

    // Shopify auto-creates a variant with the option value but sets price=0.
    // Refetch, find that variant by its selectedOptions value, then update its price.
    const refetchRes = await admin.graphql(GET_VARIANTS_QUERY, {
      variables: { id: productGid },
    });
    const refetchJson = await refetchRes.json();
    const newVariants =
      refetchJson.data?.product?.variants?.edges?.map((e) => e.node) ?? [];

    const autoCreated = newVariants.find((v) =>
      v.selectedOptions?.some(
        (o) =>
          o.name.toLowerCase() === CARRIER_OPTION_NAME.toLowerCase() &&
          o.value === priceStr,
      ),
    );

    if (autoCreated) {
      // Update the price on the auto-created variant
      const updRes = await admin.graphql(UPDATE_VARIANTS_MUTATION, {
        variables: {
          productId: productGid,
          variants: [
            {
              id: autoCreated.id,
              price: priceStr,
              inventoryPolicy: "CONTINUE",
            },
          ],
        },
      });
      const updJson = await updRes.json();
      const updErrs = updJson.data?.productVariantsBulkUpdate?.userErrors ?? [];
      if (updErrs.length) {
        console.error(
          "[variantPricing] price update userErrors:",
          JSON.stringify(updErrs),
        );
      } else {
        console.log(
          "[variantPricing] Auto-created variant price set to",
          priceStr,
          autoCreated.id,
        );
      }
      await ensureVariantPurchasable(admin, productGid, autoCreated.id);
      return {
        variantGid: autoCreated.id,
        numericId: autoCreated.id.split("/").pop(),
      };
    }
  }

  // ── 4. Prune oldest variants when pool is full ─────────────────────────────
  if (variants.length >= MAX_VARIANTS) {
    const sorted = [...variants].sort(
      (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    );
    const toDelete = sorted.slice(0, PRUNE_COUNT).map((v) => v.id);

    try {
      const delRes = await admin.graphql(DELETE_VARIANTS_MUTATION, {
        variables: { productId: productGid, variantsIds: toDelete },
      });
      const delJson = await delRes.json();
      const errs = delJson.data?.productVariantsBulkDelete?.userErrors ?? [];
      if (errs.length) {
        console.error(
          "[variantPricing] Prune delete userErrors:",
          JSON.stringify(errs),
        );
      } else {
        console.log("[variantPricing] Pruned", toDelete.length, "old variants");
      }
    } catch (err) {
      console.error("[variantPricing] Prune delete error:", err);
    }
  }

  // ── 5. Create new variant ──────────────────────────────────────────────────
  // Re-fetch current options in case they changed since step 1 (e.g. "Price" option
  // was just created in step 3 but autoCreated path didn't return).
  const freshOptionsRes = await admin.graphql(GET_VARIANTS_QUERY, {
    variables: { id: productGid },
  });
  const freshOptionsJson = await freshOptionsRes.json();
  const freshOptions = freshOptionsJson.data?.product?.options ?? options;

  // Build optionValues for ALL options on the product.
  // For "Price", use the price string. For any other option (e.g. "Title"), use its
  // first existing value so the combination is valid and unique.
  const allOptionValues = freshOptions.map((opt) => {
    if (opt.name.toLowerCase() === CARRIER_OPTION_NAME.toLowerCase()) {
      return { name: priceStr, optionName: opt.name };
    }
    return { name: opt.values?.[0] ?? "Default", optionName: opt.name };
  });
  // Guard: if "Price" option wasn't in the fetched list, add it explicitly.
  if (!allOptionValues.some((o) => o.optionName.toLowerCase() === CARRIER_OPTION_NAME.toLowerCase())) {
    allOptionValues.push({ name: priceStr, optionName: CARRIER_OPTION_NAME });
  }

  const createRes = await admin.graphql(CREATE_VARIANT_MUTATION, {
    variables: {
      productId: productGid,
      variants: [
        {
          price: priceStr,
          inventoryPolicy: "CONTINUE",
          optionValues: allOptionValues,
        },
      ],
    },
  });
  const createJson = await createRes.json();

  if (createJson.errors?.length) {
    throw new Error(
      `[variantPricing] CreateVariants GraphQL error: ${JSON.stringify(createJson.errors)}`,
    );
  }

  const userErrors =
    createJson.data?.productVariantsBulkCreate?.userErrors ?? [];
  if (userErrors.length) {
    // If the variant already exists (race condition), fetch it and return
    const alreadyExists = userErrors.some((e) =>
      e.message?.toLowerCase().includes("already exists"),
    );
    if (alreadyExists) {
      console.log(
        "[variantPricing] Variant already exists, fetching by option value",
      );
      const reRes = await admin.graphql(GET_VARIANTS_QUERY, {
        variables: { id: productGid },
      });
      const reJson = await reRes.json();
      const reVars =
        reJson.data?.product?.variants?.edges?.map((e) => e.node) ?? [];
      const reMatch = reVars.find((v) =>
        v.selectedOptions?.some(
          (o) =>
            o.name.toLowerCase() === CARRIER_OPTION_NAME.toLowerCase() &&
            o.value === priceStr,
        ),
      );
      if (reMatch) {
        await ensureVariantPurchasable(admin, productGid, reMatch.id);
        return {
          variantGid: reMatch.id,
          numericId: reMatch.id.split("/").pop(),
        };
      }
    }
    throw new Error(
      `[variantPricing] CreateVariants userErrors: ${JSON.stringify(userErrors)}`,
    );
  }

  const newVariant =
    createJson.data?.productVariantsBulkCreate?.productVariants?.[0];
  if (!newVariant) {
    throw new Error(
      "[variantPricing] productVariantsBulkCreate returned no variants",
    );
  }

  console.log(
    "[variantPricing] Created variant:",
    newVariant.id,
    "price:",
    newVariant.price,
  );

  await ensureVariantPurchasable(admin, productGid, newVariant.id);

  return {
    variantGid: newVariant.id,
    numericId: newVariant.id.split("/").pop(),
  };
}

/**
 * Delete a single variant by GID.  All errors are caught and logged so callers
 * can fire-and-forget without risking webhook timeouts.
 *
 * @param {object} admin
 * @param {string} variantGid  - e.g. "gid://shopify/ProductVariant/123"
 * @param {string} [productGid] - product that owns the variant; falls back to CUSTOM_PRODUCT_ID
 */
export async function deleteVariant(admin, variantGid, productGid) {
  const resolvedProductGid = productGid || process.env.CUSTOM_PRODUCT_ID;
  if (!resolvedProductGid) {
    console.error("[variantPricing] deleteVariant: no product GID available");
    return;
  }

  try {
    const res = await admin.graphql(DELETE_VARIANTS_MUTATION, {
      variables: { productId: resolvedProductGid, variantsIds: [variantGid] },
    });
    const data = await res.json();
    const errs = data?.data?.productVariantsBulkDelete?.userErrors ?? [];
    if (errs.length) {
      console.error(
        "[variantPricing] deleteVariant userErrors:",
        variantGid,
        JSON.stringify(errs),
      );
    } else {
      console.log("[variantPricing] Deleted variant:", variantGid);
    }
  } catch (err) {
    console.error("[variantPricing] deleteVariant threw:", variantGid, err);
  }
}
