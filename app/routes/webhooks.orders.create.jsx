/**
 * orders/create webhook handler.
 *
 * On every new order this handler:
 *   1. Forwards order data to the external backend (order metafield / custom image storage).
 *   2. Deletes dynamic pricing variants that were used for this order.
 *      Variants are one-shot: created per-price-per-cart, deleted once ordered.
 *
 * The variant cleanup is fire-and-forget — errors are logged but never block
 * the 200 response Shopify requires within 5 s.
 */

import { authenticate } from "../shopify.server";
import { postOrderMetafield } from "../orderMetafieldApi.server";
import { buildLineItemsAndImages, getOrderId } from "../orderPayload.server";
import { deleteVariant } from "../variantPricing.server";

// Fallback numeric product ID from env (used for orders placed before the per-product migration).
const FALLBACK_CARRIER_NUMERIC_ID = (process.env.CUSTOM_PRODUCT_ID ?? "")
  .split("/")
  .pop();

export const action = async ({ request }) => {
  const { payload, topic, shop, admin } = await authenticate.webhook(request);

  if (topic !== "orders/create") {
    return new Response(null, { status: 400 });
  }

  const order = payload;
  const orderId = getOrderId(order);
  if (!orderId) {
    console.error("[webhooks.orders.create] Missing order id in payload");
    return new Response(null, { status: 400 });
  }

  const { lineItems, images } = buildLineItemsAndImages(order);

  // ── 1. Forward to external order-metafield backend ────────────────────────
  try {
    const res = await postOrderMetafield({
      shop,
      order_id: orderId,
      line_items: lineItems,
      images,
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(
        "[webhooks.orders.create] order-metafield API error:",
        res.status,
        text,
      );
    } else {
      console.log(
        "[webhooks.orders.create] order-metafield API called for order",
        orderId,
        "images:",
        images?.length ?? 0,
      );
    }
  } catch (err) {
    console.error("[webhooks.orders.create] postOrderMetafield threw:", err);
  }

  // ── 2. Delete dynamic pricing variants (fire-and-forget) ──────────────────
  // For each line item, determine the product GID two ways:
  //   a) _ProductGid hidden property set at cart-add time (new flow — uses actual product)
  //   b) Fallback: match FALLBACK_CARRIER_NUMERIC_ID (old carrier product, legacy orders)
  if (admin) {
    for (const line of order.line_items ?? []) {
      if (!line.variant_id) continue;

      // Try to read _ProductGid from cart line properties
      const props = Array.isArray(line.properties) ? line.properties : [];
      const productGidProp = props.find(
        (p) => (p.name || p.key || "") === "_ProductGid",
      );
      const productGid = productGidProp?.value?.trim() || null;

      // Fallback: if this line belongs to the old separate carrier product
      const isFallbackCarrier =
        !productGid &&
        FALLBACK_CARRIER_NUMERIC_ID &&
        String(line.product_id) === FALLBACK_CARRIER_NUMERIC_ID;

      const resolvedProductGid =
        productGid ||
        (isFallbackCarrier
          ? `gid://shopify/Product/${FALLBACK_CARRIER_NUMERIC_ID}`
          : null);

      if (!resolvedProductGid) continue;

      const variantGid = `gid://shopify/ProductVariant/${line.variant_id}`;
      await deleteVariant(admin, variantGid, resolvedProductGid);
    }
  }

  // Always return 200 quickly so Shopify does not mark the webhook as failed
  return new Response();
};
