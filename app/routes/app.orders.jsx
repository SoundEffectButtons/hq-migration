import { useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { getOrderMetafield } from "../orderMetafieldApi.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const orderId = url.searchParams.get("order_id")?.trim();

  if (!orderId) {
    return { shop: session.shop, orderId: null, metafield: null, error: null };
  }

  try {
    const res = await getOrderMetafield({
      shop: session.shop,
      order_id: orderId,
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        shop: session.shop,
        orderId,
        metafield: null,
        error: `API returned ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const data = await res.json().catch(() => null);
    return {
      shop: session.shop,
      orderId,
      metafield: data,
      error: null,
    };
  } catch (err) {
    console.error("[app.orders] getOrderMetafield error:", err);
    return {
      shop: session.shop,
      orderId,
      metafield: null,
      error: err.message || "Failed to fetch order metafield",
    };
  }
};

const styles = {
  section: {
    marginBottom: "24px",
  },
  label: {
    display: "block",
    fontWeight: "600",
    fontSize: "14px",
    marginBottom: "8px",
    color: "#202223",
  },
  input: {
    width: "100%",
    maxWidth: "320px",
    padding: "12px 16px",
    fontSize: "14px",
    border: "1px solid #c9cccf",
    borderRadius: "8px",
    outline: "none",
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  btn: {
    padding: "10px 20px",
    fontSize: "14px",
    fontWeight: "600",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  btnPrimary: {
    background: "#008060",
    color: "#fff",
  },
  btnSecondary: {
    background: "#f6f6f7",
    color: "#202223",
    border: "1px solid #c9cccf",
  },
  error: {
    padding: "12px 16px",
    background: "#fee2e2",
    border: "1px solid #fca5a5",
    borderRadius: "8px",
    color: "#991b1b",
    fontSize: "14px",
    marginTop: "12px",
  },
  pre: {
    background: "#f6f6f7",
    border: "1px solid #e1e3e5",
    borderRadius: "8px",
    padding: "16px",
    overflow: "auto",
    fontSize: "13px",
    marginTop: "12px",
  },
  link: {
    color: "#008060",
    textDecoration: "none",
    fontWeight: "500",
  },
};

export default function OrdersPage() {
  const { shop, orderId, metafield, error } = useLoaderData();
  const navigate = useNavigate();
  const [inputOrderId, setInputOrderId] = useState(orderId || "");

  const handleLookup = (e) => {
    e.preventDefault();
    const id = inputOrderId.trim();
    if (id) navigate(`/app/orders?order_id=${encodeURIComponent(id)}`);
  };

  const zipUrl = orderId
    ? `/app/orders/zip?order_id=${encodeURIComponent(orderId)}`
    : null;

  return (
    <s-page heading="Orders &amp; images">
      <s-section>
        <s-box padding="base">
          <div style={styles.section}>
            <form onSubmit={handleLookup}>
              <label style={styles.label} htmlFor="order-id">
                Order ID
              </label>
              <div style={styles.row}>
                <input
                  id="order-id"
                  type="text"
                  value={inputOrderId}
                  onChange={(e) => setInputOrderId(e.target.value)}
                  placeholder="e.g. 1234567890"
                  style={styles.input}
                />
                <button
                  type="submit"
                  style={{ ...styles.btn, ...styles.btnPrimary }}
                >
                  Look up order
                </button>
              </div>
            </form>
          </div>

          {error && <div style={styles.error}>{error}</div>}

          {metafield !== null && !error && (
            <>
              <div style={styles.section}>
                <div style={styles.row}>
                  <span style={styles.label}>Order metafield data</span>
                  {zipUrl && (
                    <a
                      href={zipUrl}
                      download
                      style={{ ...styles.btn, ...styles.btnSecondary, textDecoration: "none" }}
                    >
                      Download images ZIP
                    </a>
                  )}
                </div>
                <pre style={styles.pre}>
                  {JSON.stringify(metafield, null, 2)}
                </pre>
              </div>
            </>
          )}

          {orderId && !metafield && !error && (
            <div style={{ ...styles.error, background: "#fef3c7", color: "#92400e", borderColor: "#fcd34d" }}>
              No metafield data returned for this order.
            </div>
          )}
        </s-box>
      </s-section>

      <s-section slot="aside" heading="About">
        <s-paragraph>
          Look up an order by its <strong>Order ID</strong> (numeric ID from Shopify admin)
          to view saved metafield data and download the order images as a ZIP.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
