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

import { authenticate }         from "../shopify.server";
import { postOrderMetafield }   from "../orderMetafieldApi.server";
import { buildLineItemsAndImages, getOrderId } from "../orderPayload.server";
import { deleteVariant }        from "../variantPricing.server";

// Numeric product ID extracted from the GID env var at startup.
// e.g. "gid://shopify/Product/9874439864560" → "9874439864560"
const CARRIER_NUMERIC_ID = (process.env.CUSTOM_PRODUCT_ID ?? "").split("/").pop();

export const action = async ({ request }) => {
  const { payload, topic, shop, admin } = await authenticate.webhook(request);

  if (topic !== "orders/create") {
    return new Response(null, { status: 400 });
  }

  const order   = payload;
  const orderId = getOrderId(order);
  if (!orderId) {
    console.error("[webhooks.orders.create] Missing order id in payload");
    return new Response(null, { status: 400 });
  }

  const { lineItems, images } = buildLineItemsAndImages(order);

  // ── 1. Forward to external order-metafield backend ────────────────────────
  try {
    const res = await postOrderMetafield({ shop, order_id: orderId, line_items: lineItems, images });
    if (!res.ok) {
      const text = await res.text();
      console.error("[webhooks.orders.create] order-metafield API error:", res.status, text);
    } else {
      console.log(
        "[webhooks.orders.create] order-metafield API called for order",
        orderId,
        "images:", images?.length ?? 0,
      );
    }
  } catch (err) {
    console.error("[webhooks.orders.create] postOrderMetafield threw:", err);
  }

  // ── 2. Delete dynamic pricing variants (fire-and-forget) ──────────────────
  if (CARRIER_NUMERIC_ID && admin) {
    const carrierLines = (order.line_items ?? []).filter(
      (line) => String(line.product_id) === CARRIER_NUMERIC_ID,
    );

    for (const line of carrierLines) {
      if (!line.variant_id) continue;
      const variantGid = `gid://shopify/ProductVariant/${line.variant_id}`;
      // deleteVariant() catches all errors internally — safe to await sequentially
      await deleteVariant(admin, variantGid);
    }
  }

  // Always return 200 quickly so Shopify does not mark the webhook as failed
  return new Response();
};
