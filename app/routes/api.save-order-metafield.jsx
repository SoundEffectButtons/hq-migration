/**
 * App proxy endpoint: call from the order confirmation/thank you page so the
 * order-metafield API runs when the customer sees the confirmation (and shows in Network tab).
 *
 * URL from storefront: /apps/customscale-app/save-order-metafield?order_id=123
 * (Shopify adds shop, signature, etc.)
 *
 * Trigger: Customer Events (Custom Pixel) in Shopify Admin → Settings → Customer events
 * → Code → subscribe to checkout_completed and call this URL (no legacy Additional scripts).
 */
import { authenticate } from "../shopify.server";
import { postOrderMetafield } from "../orderMetafieldApi.server";
import { buildLineItemsAndImages, getOrderId } from "../orderPayload.server";

const ORDER_QUERY = `#graphql
  query getOrder($id: ID!) {
    order(id: $id) {
      id
      lineItems(first: 60) {
        edges {
          node {
            id
            name
            title
            quantity
            sku
            variant { id }
            customAttributes { key value }
          }
        }
      }
    }
  }
`;

/** Convert GraphQL order to webhook-like shape for buildLineItemsAndImages */
function orderFromGraphQL(data) {
  const order = data?.order;
  if (!order) return null;
  const lineItems = (order.lineItems?.edges || []).map(({ node: n }) => ({
    id: n.id?.replace("gid://shopify/LineItem/", "") || n.id,
    name: n.name,
    title: n.title,
    quantity: n.quantity ?? 1,
    sku: n.sku,
    variant_id: n.variant?.id?.replace("gid://shopify/ProductVariant/", ""),
    product_id: null,
    price: null,
    properties: (n.customAttributes || []).map(({ key, value }) => ({ name: key, value: value ?? "" })),
  }));
  return {
    id: order.id?.replace("gid://shopify/Order/", "") || order.id,
    admin_graphql_api_id: order.id,
    line_items: lineItems,
  };
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const orderIdParam = url.searchParams.get("order_id")?.trim();

  if (!orderIdParam) {
    return json({ ok: false, error: "missing order_id" }, 400);
  }

  let admin;
  let shop;
  try {
    const ctx = await authenticate.public.appProxy(request);
    admin = ctx.admin;
    shop = ctx.session?.shop;
  } catch (e) {
    return json({ ok: false, error: "invalid app proxy" }, 400);
  }

  if (!admin || !shop) {
    return json({ ok: false, error: "app not installed or session missing" }, 403);
  }

  const orderGid = orderIdParam.startsWith("gid://") ? orderIdParam : `gid://shopify/Order/${orderIdParam}`;

  let data;
  try {
    const response = await admin.graphql(ORDER_QUERY, { variables: { id: orderGid } });
    data = await response.json();
  } catch (err) {
    console.error("[api.save-order-metafield] GraphQL error:", err);
    return json({ ok: false, error: "failed to load order" }, 502);
  }

  if (data?.errors?.length) {
    console.error("[api.save-order-metafield] GraphQL errors:", data.errors);
    return json({ ok: false, error: "order not found or access denied" }, 404);
  }

  const order = orderFromGraphQL(data?.data);
  if (!order) {
    return json({ ok: false, error: "order not found" }, 404);
  }

  const orderId = getOrderId(order);
  if (!orderId) {
    return json({ ok: false, error: "order id missing" }, 400);
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
      console.error("[api.save-order-metafield] backend API error:", res.status, text);
      return json({ ok: false, error: "backend error" }, 502);
    }
    console.log("[api.save-order-metafield] order-metafield API called for order", orderId, "images:", images?.length ?? 0);
    return json({ ok: true, order_id: orderId });
  } catch (err) {
    console.error("[api.save-order-metafield] postOrderMetafield error:", err);
    return json({ ok: false, error: "internal error" }, 500);
  }
};
