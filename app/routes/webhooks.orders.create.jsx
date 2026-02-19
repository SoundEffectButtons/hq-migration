/**
 * orders/create webhook: when a customer completes checkout (e.g. with CustomImage),
 * we call postOrderMetafield so the backend can save order metafield (and custom image URLs).
 * Triggered right after order creation (when the customer sees the confirmation page).
 */
import { authenticate } from "../shopify.server";
import { postOrderMetafield } from "../orderMetafieldApi.server";
import { buildLineItemsAndImages, getOrderId } from "../orderPayload.server";

export const action = async ({ request }) => {
  const { payload, topic, shop } = await authenticate.webhook(request);

  if (topic !== "orders/create") {
    return new Response(null, { status: 400 });
  }

  const order = payload;
  const orderId = getOrderId(order);
  if (!orderId) {
    console.error("[webhooks.orders.create] No order id in payload");
    return new Response(null, { status: 400 });
  }

  const { lineItems, images } = buildLineItemsAndImages(order);

  try {
    const res = await postOrderMetafield({
      shop,
      order_id: orderId,
      line_items: lineItems,
      images,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[webhooks.orders.create] API error:", res.status, text);
    } else {
      console.log("[webhooks.orders.create] order-metafield API called for order", orderId, "images:", images?.length ?? 0);
    }
  } catch (err) {
    console.error("[webhooks.orders.create] Failed to call order-metafield API:", err);
  }

  return new Response();
};
