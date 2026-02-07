import { authenticate } from "../shopify.server";
import { getOrderImagesZip } from "../orderMetafieldApi.server";

/**
 * GET /app/orders/zip?order_id= — proxy to external API and return ZIP file for download.
 */
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const orderId = url.searchParams.get("order_id")?.trim();

  if (!orderId) {
    return new Response("Missing order_id", { status: 400 });
  }

  const res = await getOrderImagesZip({
    shop: session.shop,
    order_id: orderId,
  });

  if (!res.ok) {
    const text = await res.text();
    return new Response(text || `Upstream error ${res.status}`, {
      status: res.status,
    });
  }

  const blob = await res.blob();
  const contentType = res.headers.get("Content-Type") || "application/zip";
  const contentDisposition =
    res.headers.get("Content-Disposition") ||
    `attachment; filename="order-${orderId}-images.zip"`;

  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition,
    },
  });
};
