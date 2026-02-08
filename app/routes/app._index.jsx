import { useEffect, useState } from "react";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";


const BACKEND_URL = "https://highquality.allgovjobs.com/backend";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  return { shop: session?.shop || null };
};

export default function Index() {
  const { shop: loaderShop } = useLoaderData();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const backendUrl = BACKEND_URL;
  const loaderStyles = `
    .loader-container {
      display: flex;
      height: 100vh;
      justify-content: center;
      align-items: center;
    }

    .spinner {
      width: 45px;
      height: 45px;
      border: 4px solid #e3e3e3;
      border-top: 4px solid #008060;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      100% {
        transform: rotate(360deg);
      }
    }
  `;

  useEffect(() => {
    const checkAuth = async () => {
      const urlShop = new URLSearchParams(window.location.search).get("shop");
      const shop = urlShop || loaderShop;

      if (!shop) {
        setIsCheckingAuth(false);
        return;
      }

      fetch(`${backendUrl}/api/check-token?shop=${shop}`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.authorized) {
            const installUrl = `${backendUrl}/shopify?shop=${shop}`;
            if (window.top !== window.self) {
              window.top.location.href = installUrl;
            } else {
              window.location.href = installUrl;
            }
          } else {
            setIsAuthorized(true);
          }
        })
        .catch((err) => console.error("Auth check failed:", err))
        .finally(() => setIsCheckingAuth(false));
    };

    checkAuth();
  }, [backendUrl, loaderShop]);

  if (isCheckingAuth || !isAuthorized) {
    return (
      <>
        <style>{loaderStyles}</style>
        <div className="loader-container">
          <div className="spinner"></div>
        </div>
      </>
    );
  }

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
