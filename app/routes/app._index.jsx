import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
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
