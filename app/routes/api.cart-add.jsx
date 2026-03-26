/**
 * App proxy endpoint: POST /apps/customscale-app/cart-add
 *
 * Called by the storefront React editor when the customer clicks "Add to Cart".
 * Receives design parameters, calculates price server-side, creates (or reuses)
 * a dynamic variant on the carrier product, then redirects the browser to
 * Shopify's native /cart/add endpoint with the variant ID and encoded properties.
 *
 * Storefront proxy URL:  /apps/customscale-app/cart-add
 * Internal route path:   /api/cart-add
 *
 * Request body (JSON or form-encoded):
 *   lines[]      {array}   – optional. One entry per placement+size:
 *                           { placementId, placementLabel, sizeId, sizeLabel, width, height, quantity, preCut }
 *   totalQty     {number}  – optional. Global quantity for discount tier selection
 *   width        {number}  – legacy fallback inches when lines[] is omitted
 *   height       {number}  – legacy fallback inches when lines[] is omitted
 *   preCut       {string}  – "true" | "false" (legacy/global fallback)
 *   quantity     {number}  – legacy fallback quantity
 *   customImage  {string}  – image URL, optional
 *   productTitle {string}  – name of the product page (shown in cart as line item property)
 *   productId    {string}  – storefront product ID (used to fetch title when productTitle is missing)
 *
 * Success response (JSON):
 *   {
 *     items: [{ id, quantity, properties }],
 *     variantId: 123456789,          ← first line fallback for older clients
 *     properties: { ... }            ← first line fallback for older clients
 *   }
 *
 * Error responses:  JSON { error: "..." } with appropriate 4xx/5xx status
 *
 * React app usage:
 *   const cartUrl  = document.getElementById('cloth-editor-app').dataset.cartUrl;
 *   const { variantId, properties } = await fetch(cartUrl, { method:'POST', ... }).then(r=>r.json());
 *   await fetch('/cart/add.js', { method:'POST', headers:{'Content-Type':'application/json'},
 *     body: JSON.stringify({ items:[{ id: variantId, quantity, properties }] }) });
 *   window.location.href = '/cart';
 */

import { authenticate } from "../shopify.server";
import { calculateUnitPrice, getOrCreateVariant } from "../variantPricing.server";

const CUSTOM_PRODUCT_ID = process.env.CUSTOM_PRODUCT_ID;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });

// Handle CORS preflight
export const loader = async ({ request }) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
      },
    });
  }
  return json({ status: "ok" });
};

export const action = async ({ request }) => {
  const ctx = await authenticate.public.appProxy(request);
  const admin = ctx.admin;
  if (!admin) {
    console.error("[api.cart-add] No admin context (app proxy has no session/admin)");
    return json({ error: "Store not authenticated" }, 401);
  }

  try {
    if (!CUSTOM_PRODUCT_ID) {
      console.error("[api.cart-add] CUSTOM_PRODUCT_ID env var is not set");
      return json({ error: "Pricing not configured" }, 500);
    }

    // ── Parse input (JSON or form-encoded) ────────────────────────────────────
    let width;
    let height;
    let preCut;
    let quantity;
    let totalQty;
    let lines;
    let customImage;
    let productTitle;
    let productId;
    const contentType = request.headers.get("content-type") ?? "";
    try {
      if (contentType.includes("application/json")) {
        const body = await request.json();
        width        = parseFloat(body.width);
        height       = parseFloat(body.height);
        preCut       = body.preCut === true || body.preCut === "true";
        quantity     = Math.max(1, parseInt(body.quantity, 10) || 1);
        totalQty     = Math.max(1, parseInt(body.totalQty, 10) || quantity);
        lines        = Array.isArray(body.lines) ? body.lines : [];
        customImage  = (body.customImage ?? "").trim();
        productTitle = (body.productTitle ?? "").trim();
        productId    = body.productId != null ? String(body.productId).trim() : "";
      } else {
        const form   = await request.formData();
        width        = parseFloat(form.get("width") ?? "0");
        height       = parseFloat(form.get("height") ?? "0");
        preCut       = form.get("preCut") === "true";
        quantity     = Math.max(1, parseInt(form.get("quantity") ?? "1", 10));
        totalQty     = Math.max(1, parseInt(form.get("totalQty") ?? String(quantity), 10));
        try {
          const linesRaw = form.get("lines");
          lines = linesRaw ? JSON.parse(String(linesRaw)) : [];
        } catch (_) {
          lines = [];
        }
        customImage  = (form.get("customImage") ?? "").trim();
        productTitle = (form.get("productTitle") ?? "").trim();
        productId    = (form.get("productId") ?? "").trim();
      }
    } catch (err) {
      console.error("[api.cart-add] Failed to parse request body:", err);
      return json({ error: "Invalid request body" }, 400);
    }

    const hasLines = Array.isArray(lines) && lines.length > 0;

    if (!hasLines) {
      if (!Number.isFinite(width)  || width  <= 0 ||
          !Number.isFinite(height) || height <= 0) {
        return json({ error: "width and height must be positive numbers" }, 400);
      }
    }

    // ── Resolve display name: use productTitle from request, else fetch by productId ─
    let displayProductName = productTitle;
    if (!displayProductName && productId && productId !== "undefined") {
      try {
        const productGid = productId.startsWith("gid://")
          ? productId
          : `gid://shopify/Product/${productId}`;
        const res = await admin.graphql(
          `query getProductTitle($id: ID!) { product(id: $id) { title } }`,
          { variables: { id: productGid } },
        );
        const data = typeof res?.json === "function" ? await res.json() : res;
        const title = data?.data?.product?.title;
        if (title) displayProductName = title;
      } catch (err) {
        console.warn("[api.cart-add] Could not fetch product title for productId:", productId, err);
      }
    }

    const normalizeLine = (rawLine) => {
      const lineWidth = parseFloat(rawLine?.width);
      const lineHeight = parseFloat(rawLine?.height);
      const lineQuantity = Math.max(1, parseInt(rawLine?.quantity, 10) || 1);
      const linePreCut = rawLine?.preCut === true || rawLine?.preCut === "true" || preCut;
      const placementId = String(rawLine?.placementId ?? "").trim();
      const placementLabel = String(rawLine?.placementLabel ?? "").trim();
      const placementView = String(rawLine?.placementView ?? "").trim();
      const sizeId = String(rawLine?.sizeId ?? "").trim();
      const sizeLabel = String(rawLine?.sizeLabel ?? "").trim();
      if (!Number.isFinite(lineWidth) || lineWidth <= 0 || !Number.isFinite(lineHeight) || lineHeight <= 0) {
        return null;
      }
      return {
        width: lineWidth,
        height: lineHeight,
        quantity: lineQuantity,
        preCut: linePreCut,
        placementId,
        placementLabel,
        placementView,
        sizeId,
        sizeLabel,
      };
    };

    const normalizedLines = hasLines
      ? lines.map(normalizeLine).filter(Boolean)
      : [{
          width,
          height,
          quantity,
          preCut,
          placementId: "",
          placementLabel: "",
          placementView: "",
          sizeId: "",
          sizeLabel: "",
        }];

    if (normalizedLines.length === 0) {
      return json({ error: "No valid line items were provided" }, 400);
    }

    const globalQty = Math.max(
      1,
      parseInt(totalQty, 10) || normalizedLines.reduce((sum, line) => sum + line.quantity, 0),
    );

    const items = [];
    for (const line of normalizedLines) {
      const unitPrice = calculateUnitPrice(line.width, line.height, line.preCut, globalQty);
      console.log(
        `[api.cart-add] line price=${unitPrice} width=${line.width} height=${line.height} preCut=${line.preCut} lineQty=${line.quantity} totalQty=${globalQty} placement=${line.placementId || "n/a"} size=${line.sizeId || "n/a"}`,
      );

      let numericId;
      try {
        const result = await getOrCreateVariant(admin, CUSTOM_PRODUCT_ID, unitPrice);
        numericId = result.numericId;
      } catch (err) {
        console.error("[api.cart-add] getOrCreateVariant failed:", err);
        const status = err?.response?.code ?? (err?.message?.includes("401") ? 401 : 500);
        if (status === 401) {
          return json(
            {
              error:
                "Store access expired or invalid. Please reinstall the app from the Shopify Admin (Apps → CustomScale-app → open app, or install again) to restore add-to-cart.",
            },
            401,
          );
        }
        return json({ error: "Failed to prepare pricing variant" }, 500);
      }

      const properties = {
        Width: String(line.width),
        Height: String(line.height),
        PreCut: line.preCut ? "Yes" : "No",
        UnitPrice: unitPrice.toFixed(2),
      };
      if (displayProductName) properties.Product = displayProductName;
      if (customImage) properties.CustomImage = customImage;
      if (line.placementLabel) properties.Placement = line.placementLabel;
      if (line.placementView) properties.PlacementView = line.placementView;
      if (line.placementId) properties.PlacementId = line.placementId;
      if (line.sizeLabel) properties.Size = line.sizeLabel;
      if (line.sizeId) properties.SizeId = line.sizeId;

      items.push({
        id: parseInt(numericId, 10),
        quantity: line.quantity,
        properties,
      });
    }

    // Keep first-line compatibility fields for older storefront clients.
    const firstItem = items[0];
    return json({
      items,
      variantId: firstItem.id,
      quantity: firstItem.quantity,
      properties: firstItem.properties,
    });
  } catch (err) {
    if (err instanceof Response) throw err;
    console.error("[api.cart-add] Unexpected error:", err);
    return json({ error: "Internal server error" }, 500);
  }
};
