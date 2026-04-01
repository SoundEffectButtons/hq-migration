/**
 * One-time setup: creates Shopify automatic discounts matching the volume
 * discount tier structure.
 *
 * Each tier becomes an "Automatic percentage-off" discount restricted to the
 * carrier product, with a minimum-subtotal requirement evaluated against only
 * qualifying items.  Shopify automatically picks the best matching discount for
 * the customer so tiers do not stack.
 *
 * Call once after deploy via  GET /app/setup-discounts  (admin-authenticated).
 */

const DISCOUNT_TIERS = [
  { minSubtotal: 49,   discount: 0.1,  title: "Volume 10% Off" },
  { minSubtotal: 99,   discount: 0.15, title: "Volume 15% Off" },
  { minSubtotal: 150,  discount: 0.2,  title: "Volume 20% Off" },
  { minSubtotal: 250,  discount: 0.3,  title: "Volume 30% Off" },
  { minSubtotal: 500,  discount: 0.4,  title: "Volume 40% Off" },
  { minSubtotal: 1000, discount: 0.5,  title: "Volume 50% Off" },
  { minSubtotal: 1750, discount: 0.6,  title: "Volume 60% Off" },
  { minSubtotal: 3800, discount: 0.65, title: "Volume 65% Off" },
];

const LIST_AUTOMATIC_DISCOUNTS = `#graphql
  query ListAutomaticDiscounts($query: String!) {
    discountNodes(first: 50, query: $query) {
      edges {
        node {
          id
          discount {
            ... on DiscountAutomaticBasic {
              title
              status
            }
          }
        }
      }
    }
  }
`;

const CREATE_AUTOMATIC_DISCOUNT = `#graphql
  mutation CreateAutomaticDiscount($automaticBasicDiscount: DiscountAutomaticBasicInput!) {
    discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {
      automaticDiscountNode {
        id
        automaticDiscount {
          ... on DiscountAutomaticBasic { title status }
        }
      }
      userErrors { field message code }
    }
  }
`;

/**
 * Create all missing volume-discount tiers as Shopify automatic discounts.
 *
 * @param {object} admin          – authenticated Shopify Admin GraphQL client
 * @param {string} carrierProductGid – e.g. "gid://shopify/Product/123"
 * @returns {Promise<Array<{title:string, status:string, error?:string}>>}
 */
export async function setupVolumeDiscounts(admin, carrierProductGid) {
  const existingRes = await admin.graphql(LIST_AUTOMATIC_DISCOUNTS, {
    variables: { query: 'title:Volume* AND type:automatic' },
  });
  const existingJson = await existingRes.json();
  const existingTitles = new Set(
    (existingJson.data?.discountNodes?.edges ?? [])
      .map((e) => e.node?.discount?.title)
      .filter(Boolean),
  );

  const results = [];

  for (const tier of DISCOUNT_TIERS) {
    if (existingTitles.has(tier.title)) {
      results.push({ title: tier.title, status: "already_exists" });
      continue;
    }

    try {
      const res = await admin.graphql(CREATE_AUTOMATIC_DISCOUNT, {
        variables: {
          automaticBasicDiscount: {
            title: tier.title,
            startsAt: new Date().toISOString(),
            combinesWith: {
              orderDiscounts: false,
              productDiscounts: false,
              shippingDiscounts: true,
            },
            minimumRequirement: {
              subtotal: {
                greaterThanOrEqualToSubtotal: tier.minSubtotal.toFixed(2),
              },
            },
            customerGets: {
              value: { percentage: tier.discount },
              items: {
                products: { productsToAdd: [carrierProductGid] },
              },
            },
          },
        },
      });

      const json = await res.json();
      const userErrors =
        json.data?.discountAutomaticBasicCreate?.userErrors ?? [];

      if (userErrors.length) {
        console.error(
          `[discountSetup] Failed to create "${tier.title}":`,
          JSON.stringify(userErrors),
        );
        results.push({
          title: tier.title,
          status: "error",
          error: userErrors.map((e) => e.message).join("; "),
        });
      } else {
        console.log(`[discountSetup] Created "${tier.title}"`);
        results.push({ title: tier.title, status: "created" });
      }
    } catch (err) {
      console.error(`[discountSetup] Exception creating "${tier.title}":`, err);
      results.push({ title: tier.title, status: "error", error: String(err) });
    }
  }

  return results;
}
