/**
 * External API client for order metafield and order images zip.
 * Base URL: https://highquality.allgovjobs.com
 */

const API_BASE = "https://highquality.allgovjobs.com/backend";

/**
 * POST /api/order-metafield - Save order metafield when customer places order.
 * Called from orders/create webhook (or Flow) so backend has order + CustomImage URLs when customer sees confirmation page.
 * @param {{ shop: string, order_id: string|number, line_items: object[], images: string[] }} body - images are CustomImage URLs from line item properties
 * @returns {Promise<Response>}
 */
export async function postOrderMetafield({ shop, order_id, line_items, images }) {
  const res = await fetch(`${API_BASE}/api/order-metafield`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shop, order_id, line_items, images }),
  });
  return res;
}

/**
 * GET /api/order-metafield - Get order metafield data
 * @param {{ shop: string, order_id: string }} params
 * @returns {Promise<Response>}
 */
export async function getOrderMetafield({ shop, order_id }) {
  const url = new URL(`${API_BASE}/api/order-metafield`);
  url.searchParams.set("shop", shop);
  url.searchParams.set("order_id", String(order_id));
  const res = await fetch(url.toString());
  return res;
}

/**
 * GET /order-images-zip - Get order images as zip (returns blob)
 * @param {{ shop: string, order_id: string }} params
 * @returns {Promise<Response>}
 */

export async function getOrderImagesZip({ shop, order_id }) {
  const url = new URL(`${API_BASE}/order-images-zip`);
  url.searchParams.set("shop", shop);
  url.searchParams.set("order_id", String(order_id));
  const res = await fetch(url.toString());
  return res;
}
