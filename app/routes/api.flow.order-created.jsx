/**
 * Alternative to orders/create webhook: called by Shopify Flow (Order created → Send HTTP request).
 * No PCD webhook subscription required, so dev preview works without PCD approval.
 *
 * Setup in Shopify Admin → Settings → Apps and sales channels → Shopify Flow:
 * 1. Create workflow: Trigger = "Order created"
 * 2. Add action "Send HTTP request":
 *    - URL: https://YOUR_APP_URL/api/flow/order-created
 *    - Method: POST
 *    - Headers: Content-Type: application/json
 *      (optional) X-Flow-Secret: same value as FLOW_WEBHOOK_SECRET in .env
 *    - Body: JSON with "shop" (store myshopify domain) and "order" (order object with id, line_items, etc.)
 *      Flow can reference trigger data; map Order fields to match webhook shape (id, line_items with properties).
 *
 * Expected body: { shop: string, order: { id?, admin_graphql_api_id?, line_items: [...] } }
 */
import { postOrderMetafield } from "../orderMetafieldApi.server";
import { buildLineItemsAndImages, getOrderId } from "../orderPayload.server";

function checkFlowSecret(request) {
  const secret = process.env.FLOW_WEBHOOK_SECRET;
  if (!secret) return true;
  const header = request.headers.get("X-Flow-Secret");
  return header === secret;
}

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return new Response(null, { status: 405 });
  }
  if (!checkFlowSecret(request)) {
    return new Response(null, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const shop = body.shop?.trim();
  const order = body.order;
  if (!shop || !order) {
    return new Response(
      JSON.stringify({ error: "Missing shop or order in body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const orderId = getOrderId(order);
  if (!orderId) {
    return new Response(
      JSON.stringify({ error: "Order id not found in order payload" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
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
      console.error("[api.flow.order-created] API error:", res.status, text);
      return new Response(
        JSON.stringify({ error: "Downstream API error", status: res.status }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("[api.flow.order-created] Failed to call order-metafield API:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
