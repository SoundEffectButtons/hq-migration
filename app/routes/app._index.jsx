import { useEffect } from "react";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session?.shop || null };
};

export default function Index() {
  const { shop } = useLoaderData();

  useEffect(() => {
    if (!shop) return;

    const url = `https://highquality.allgovjobs.com/backend/api/check-token?shop=${encodeURIComponent(shop)}`;
    fetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((res) => res.json())
      .then((data) => {
        console.log("[app._index] check-token response:", data);
      })
      .catch((err) => {
        console.error("[app._index] check-token error:", err);
      });
  }, [shop]);

  return (
    <s-page heading="Product Editor Manager">
      <s-section heading="Admin dashboard">
        <s-paragraph>
          Admin dashboard is working. Next step: product selector UI.
        </s-paragraph>
        <s-paragraph>
          <s-link href="/app/editor">Go to Product Editor</s-link> to manage which products use the custom editor template.
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
