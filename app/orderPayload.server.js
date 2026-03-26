/**
 * Shared order payload parsing (webhook-shaped or Flow-sent).
 * Used by webhooks.orders.create and api.flow.order-created.
 */

/**
 * Normalize Shopify property/customAttribute shapes to { name, value }[].
 * Accepts:
 *  - [{ name, value }]
 *  - [{ key, value }]
 *  - { key: value, ... }
 */
function normalizeProperties(properties) {
  if (Array.isArray(properties)) {
    return properties.map((p) => ({
      name: String(p?.name ?? p?.key ?? ""),
      value: String(p?.value ?? ""),
    }));
  }
  if (properties && typeof properties === "object") {
    return Object.entries(properties).map(([name, value]) => ({
      name: String(name),
      value: String(value ?? ""),
    }));
  }
  return [];
}

/**
 * Extract image URLs from line item properties (e.g. CustomImage from checkout).
 * Matches property names: "CustomImage", "Custom Image", or any name containing "image",
 * and any value that looks like a URL.
 * @param {Array<{ name?: string, value?: string }>|Array<{ key?: string, value?: string }>|Record<string, string>} properties
 * @returns {string[]}
 */
export function extractImagesFromProperties(properties) {
  const normalized = normalizeProperties(properties);
  if (normalized.length === 0) return [];
  const images = [];
  for (const p of normalized) {
    const name = (p.name || "").toLowerCase().replace(/\s+/g, "");
    const value = (p.value || "").trim();
    const isCustomImage =
      name === "customimage" || name.includes("image") || /^https?:\/\//i.test(value);
    if (isCustomImage && value) images.push(value);
  }
  return images;
}

/**
 * Build line_items payload from Shopify order line_items.
 * @param {object} order - Order object with line_items (webhook or Flow payload)
 * @returns {{ lineItems: object[], images: string[] }}
 */
export function buildLineItemsAndImages(order) {
  const lineItems = [];
  const allImages = [];
  const rawLines = order.line_items || [];

  for (const line of rawLines) {
    const props = normalizeProperties(line.properties);
    const images = extractImagesFromProperties(props);
    allImages.push(...images);
    lineItems.push({
      id: line.id,
      name: line.name,
      title: line.title,
      quantity: line.quantity,
      price: line.price,
      sku: line.sku,
      variant_id: line.variant_id,
      product_id: line.product_id,
      properties: props,
      /** First CustomImage (or image) URL for this line, for order metafield / confirmation */
      custom_image_url: images[0] || null,
    });
  }

  return { lineItems, images: [...new Set(allImages)] };
}

/**
 * Get order ID from order payload (webhook or Flow).
 * @param {object} order
 * @returns {string|number|null}
 */
export function getOrderId(order) {
  if (!order) return null;
  const id = order.id ?? order.admin_graphql_api_id?.split("/").pop();
  return id ?? null;
}
