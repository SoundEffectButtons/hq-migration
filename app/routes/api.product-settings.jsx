import { authenticate } from "../shopify.server";
import prisma from "../db.server";

const json = (data, init = {}) =>
  new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

const DEFAULT_SETTINGS = {
  enableSize: true,
  enablePrecut: true,
  enableQuantity: true,
  enablePlacement: true,
};

/** Normalize product ID: GID (gid://shopify/Product/123) -> numeric 123 */
function normalizeProductId(productId) {
  if (!productId || typeof productId !== "string") return String(productId || "");
  const match = productId.match(/\/(\d+)$/);
  return match ? match[1] : productId;
}

async function getShopFromRequest(request) {
  const url = new URL(request.url);
  // App proxy requests include signature; admin requests have session
  if (url.searchParams.has("signature")) {
    const { session } = await authenticate.public.appProxy(request);
    return session?.shop || url.searchParams.get("shop");
  }
  const { session } = await authenticate.admin(request);
  return session?.shop;
}

/**
 * GET - Returns product customizer settings.
 * - Storefront: via app proxy (includes signature)
 * - Admin: authenticated request (for Product Editor Manager)
 */
export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const productId = url.searchParams.get("productId");

    if (!productId) {
      return json(DEFAULT_SETTINGS, {
        headers: { "Cache-Control": "public, max-age=60" },
      });
    }

    const normalizedProductId = normalizeProductId(productId);
    const shop = await getShopFromRequest(request);
    if (!shop) {
      return json(DEFAULT_SETTINGS, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const settings = await prisma.productCustomizerSettings.findUnique({
      where: { shop_productId: { shop, productId: normalizedProductId } },
    });

    const payload = settings
      ? {
          enableSize: settings.enableSize,
          enablePrecut: settings.enablePrecut,
          enableQuantity: settings.enableQuantity,
          enablePlacement: settings.enablePlacement,
        }
      : DEFAULT_SETTINGS;

    return json(payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    console.error("[api.product-settings] GET error:", err);
    return json(DEFAULT_SETTINGS, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }
};

/**
 * POST - Upserts product customizer settings from the Admin app.
 * Requires admin authentication.
 */
export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const contentType = request.headers.get("content-type") || "";
    let productId, enableSize, enablePrecut, enableQuantity, enablePlacement;

    if (contentType.includes("application/json")) {
      const body = await request.json();
      productId = body.productId;
      enableSize = body.enableSize ?? true;
      enablePrecut = body.enablePrecut ?? true;
      enableQuantity = body.enableQuantity ?? true;
      enablePlacement = body.enablePlacement ?? true;
    } else {
      const formData = await request.formData();
      productId = formData.get("productId");
      enableSize = formData.get("enableSize") !== "false";
      enablePrecut = formData.get("enablePrecut") !== "false";
      enableQuantity = formData.get("enableQuantity") !== "false";
      enablePlacement = formData.get("enablePlacement") !== "false";
    }

    productId = normalizeProductId(productId);

    if (!productId || typeof productId !== "string") {
      return json({ error: "productId is required" }, { status: 400 });
    }

    const settings = await prisma.productCustomizerSettings.upsert({
      where: { shop_productId: { shop, productId } },
      create: {
        shop,
        productId,
        enableSize,
        enablePrecut,
        enableQuantity,
        enablePlacement,
      },
      update: {
        enableSize,
        enablePrecut,
        enableQuantity,
        enablePlacement,
      },
    });

    return json({
      success: true,
      settings: {
        enableSize: settings.enableSize,
        enablePrecut: settings.enablePrecut,
        enableQuantity: settings.enableQuantity,
        enablePlacement: settings.enablePlacement,
      },
    });
  } catch (err) {
    console.error("[api.product-settings] POST error:", err);
    return json({ error: "Failed to save settings" }, { status: 500 });
  }
};
