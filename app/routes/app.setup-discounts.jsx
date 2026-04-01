/**
 * Admin route: GET /app/setup-discounts
 *
 * Creates Shopify automatic discounts matching the volume-discount tiers.
 * Run once after deploy.  Safe to re-run — skips tiers that already exist.
 *
 * Access via Shopify Admin → Apps → CustomScale-app → Setup Discounts
 */
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { setupVolumeDiscounts } from "../discountSetup.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const carrierProductGid = process.env.CUSTOM_PRODUCT_ID;
  if (!carrierProductGid) {
    return { error: "CUSTOM_PRODUCT_ID env var is not set", results: [] };
  }

  const results = await setupVolumeDiscounts(admin, carrierProductGid);
  return { error: null, results };
};

export default function SetupDiscounts() {
  const { error, results } = useLoaderData();

  if (error) {
    return (
      <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif" }}>
        <h1 style={{ color: "#dc2626" }}>Setup Error</h1>
        <p>{error}</p>
      </div>
    );
  }

  const created = results.filter((r) => r.status === "created").length;
  const existing = results.filter((r) => r.status === "already_exists").length;
  const errors = results.filter((r) => r.status === "error").length;

  return (
    <div style={{ padding: "2rem", fontFamily: "system-ui, sans-serif", maxWidth: 600 }}>
      <h1>Volume Discount Setup</h1>
      <p style={{ color: "#059669", fontWeight: 600 }}>
        {created} created · {existing} already existed · {errors} failed
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
            <th style={{ padding: "0.5rem" }}>Discount</th>
            <th style={{ padding: "0.5rem" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.title} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: "0.5rem", fontWeight: 600 }}>{r.title}</td>
              <td style={{ padding: "0.5rem" }}>
                {r.status === "created" && <span style={{ color: "#059669" }}>Created</span>}
                {r.status === "already_exists" && <span style={{ color: "#6b7280" }}>Already exists</span>}
                {r.status === "error" && <span style={{ color: "#dc2626" }}>Error: {r.error}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
