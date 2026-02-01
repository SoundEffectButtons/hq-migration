import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

// ============================================================================
// CONSTANTS
// ============================================================================

const PRODUCTS_PER_PAGE = 10;
const CUSTOM_TEMPLATE_SUFFIX = "custom-editor";
const DEBOUNCE_DELAY = 400;

// ============================================================================
// GRAPHQL QUERIES & MUTATIONS
// ============================================================================

const GET_PRODUCTS_QUERY = `#graphql
  query GetProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          status
          featuredImage {
            url(transform: { maxWidth: 100, maxHeight: 100 })
          }
          templateSuffix
          totalInventory
          priceRangeV2 {
            minVariantPrice {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

const UPDATE_PRODUCT_TEMPLATE = `#graphql
  mutation UpdateProductTemplate($id: ID!, $templateSuffix: String) {
    productUpdate(input: { id: $id, templateSuffix: $templateSuffix }) {
      product {
        id
        title
        templateSuffix
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ============================================================================
// LOADER
// ============================================================================

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);

  const searchQuery = url.searchParams.get("q") || "";
  const cursor = url.searchParams.get("cursor") || null;
  const isLoadMore = cursor !== null;

  try {
    const response = await admin.graphql(GET_PRODUCTS_QUERY, {
      variables: {
        first: PRODUCTS_PER_PAGE,
        after: cursor,
        query: searchQuery || null,
      },
    });

    const { data, errors } = await response.json();

    if (errors?.length) {
      console.error("GraphQL Errors:", errors);
      return {
        products: [],
        pageInfo: { hasNextPage: false, endCursor: null },
        searchQuery,
        isLoadMore,
        error: "Failed to fetch products. Please try again.",
      };
    }

    const products = data?.products?.edges?.map((edge) => edge.node) || [];
    const pageInfo = data?.products?.pageInfo || { hasNextPage: false, endCursor: null };

    return { products, pageInfo, searchQuery, isLoadMore, error: null };
  } catch (error) {
    console.error("Loader Error:", error);
    return {
      products: [],
      pageInfo: { hasNextPage: false, endCursor: null },
      searchQuery,
      isLoadMore,
      error: "An unexpected error occurred. Please refresh the page.",
    };
  }
};

// ============================================================================
// ACTION
// ============================================================================

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    const formData = await request.formData();
    const actionType = formData.get("actionType");
    const productIds = JSON.parse(formData.get("productIds") || "[]");

    // Validation
    if (!actionType || !["enable", "disable"].includes(actionType)) {
      return { success: false, error: "Invalid action type.", updatedProducts: [] };
    }

    if (!Array.isArray(productIds) || productIds.length === 0) {
      return { success: false, error: "No products selected.", updatedProducts: [] };
    }

    const templateSuffix = actionType === "enable" ? CUSTOM_TEMPLATE_SUFFIX : null;
    const updatedProducts = [];
    const errors = [];

    // Process each product sequentially
    for (const productId of productIds) {
      try {
        const response = await admin.graphql(UPDATE_PRODUCT_TEMPLATE, {
          variables: { id: productId, templateSuffix },
        });

        const { data, errors: gqlErrors } = await response.json();

        if (gqlErrors?.length) {
          errors.push({ productId, message: gqlErrors[0].message });
          continue;
        }

        const userErrors = data?.productUpdate?.userErrors || [];
        if (userErrors.length > 0) {
          errors.push({ productId, message: userErrors[0].message });
          continue;
        }

        if (data?.productUpdate?.product) {
          updatedProducts.push(data.productUpdate.product);
        }
      } catch (err) {
        errors.push({ productId, message: err.message || "Unknown error" });
      }
    }

    return {
      success: errors.length === 0,
      actionType,
      updatedProducts,
      updatedCount: updatedProducts.length,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : null,
      error: errors.length > 0 ? `Failed to update ${errors.length} product(s).` : null,
    };
  } catch (error) {
    console.error("Action Error:", error);
    return {
      success: false,
      error: "An unexpected error occurred. Please try again.",
      updatedProducts: [],
    };
  }
};

// ============================================================================
// STYLES
// ============================================================================

const styles = {
  container: {
    maxWidth: "100%",
  },
  searchContainer: {
    marginBottom: "20px",
  },
  searchLabel: {
    display: "block",
    marginBottom: "8px",
    fontWeight: "600",
    fontSize: "14px",
    color: "#202223",
  },
  searchInputWrapper: {
    position: "relative",
  },
  searchInput: {
    width: "100%",
    padding: "12px 16px 12px 44px",
    fontSize: "14px",
    border: "1px solid #c9cccf",
    borderRadius: "8px",
    outline: "none",
    transition: "border-color 0.2s, box-shadow 0.2s",
    backgroundColor: "#fff",
  },
  searchIcon: {
    position: "absolute",
    left: "14px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "#6d7175",
    pointerEvents: "none",
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "14px 16px",
    background: "#f6f6f7",
    borderRadius: "8px 8px 0 0",
    borderBottom: "1px solid #e1e3e5",
  },
  toolbarLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  checkbox: {
    width: "18px",
    height: "18px",
    cursor: "pointer",
    accentColor: "#008060",
  },
  selectionText: {
    fontWeight: "500",
    fontSize: "14px",
    color: "#202223",
  },
  productList: {
    border: "1px solid #e1e3e5",
    borderTop: "none",
    borderRadius: "0 0 8px 8px",
    overflow: "hidden",
    backgroundColor: "#fff",
  },
  productItem: (isSelected) => ({
    display: "flex",
    alignItems: "center",
    padding: "14px 16px",
    borderBottom: "1px solid #f1f1f1",
    background: isSelected ? "#f0fdf4" : "#fff",
    cursor: "pointer",
    transition: "background 0.15s ease",
  }),
  productImage: {
    width: "52px",
    height: "52px",
    borderRadius: "8px",
    overflow: "hidden",
    marginRight: "16px",
    background: "#f6f6f7",
    flexShrink: 0,
    border: "1px solid #e1e3e5",
  },
  productImagePlaceholder: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#8c9196",
    fontSize: "10px",
    textAlign: "center",
  },
  productInfo: {
    flex: 1,
    minWidth: 0,
  },
  productTitle: {
    fontWeight: "600",
    fontSize: "14px",
    color: "#202223",
    marginBottom: "4px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  productMeta: {
    fontSize: "12px",
    color: "#6d7175",
    display: "flex",
    gap: "12px",
  },
  badge: (enabled) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "5px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "600",
    background: enabled ? "#d1fae5" : "#f3f4f6",
    color: enabled ? "#065f46" : "#6b7280",
    marginLeft: "16px",
    whiteSpace: "nowrap",
  }),
  emptyState: {
    padding: "60px 20px",
    textAlign: "center",
    color: "#6d7175",
  },
  emptyStateIcon: {
    width: "48px",
    height: "48px",
    margin: "0 auto 16px",
    color: "#c9cccf",
  },
  pagination: {
    display: "flex",
    justifyContent: "center",
    padding: "20px",
    borderTop: "1px solid #e1e3e5",
  },
  loadMoreButton: {
    padding: "10px 24px",
    fontSize: "14px",
    fontWeight: "500",
    color: "#202223",
    background: "#fff",
    border: "1px solid #c9cccf",
    borderRadius: "8px",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  banner: (status) => ({
    padding: "14px 16px",
    borderRadius: "8px",
    marginBottom: "20px",
    display: "flex",
    alignItems: "flex-start",
    gap: "12px",
    background: status === "success" ? "#d1fae5" : status === "error" ? "#fee2e2" : "#fef3c7",
    border: `1px solid ${status === "success" ? "#6ee7b7" : status === "error" ? "#fca5a5" : "#fcd34d"}`,
  }),
  bannerIcon: (status) => ({
    flexShrink: 0,
    width: "20px",
    height: "20px",
    color: status === "success" ? "#059669" : status === "error" ? "#dc2626" : "#d97706",
  }),
  bannerContent: {
    flex: 1,
  },
  bannerTitle: (status) => ({
    fontWeight: "600",
    fontSize: "14px",
    color: status === "success" ? "#065f46" : status === "error" ? "#991b1b" : "#92400e",
    marginBottom: "2px",
  }),
  bannerMessage: (status) => ({
    fontSize: "13px",
    color: status === "success" ? "#047857" : status === "error" ? "#b91c1c" : "#b45309",
  }),
  bannerClose: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "4px",
    color: "#6b7280",
  },
  spinner: {
    display: "inline-block",
    width: "16px",
    height: "16px",
    border: "2px solid #e1e3e5",
    borderTopColor: "#008060",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
};

// ============================================================================
// COMPONENTS
// ============================================================================

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M17.5 17.5L13.875 13.875M15.8333 9.16667C15.8333 12.8486 12.8486 15.8333 9.16667 15.8333C5.48477 15.8333 2.5 12.8486 2.5 9.16667C2.5 5.48477 5.48477 2.5 9.16667 2.5C12.8486 2.5 15.8333 5.48477 15.8333 9.16667Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16.6666 5L7.49998 14.1667L3.33331 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EmptyIcon() {
  return (
    <svg style={styles.emptyStateIcon} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20 7L12 3L4 7M20 7L12 11M20 7V17L12 21M12 11L4 7M12 11V21M4 7V17L12 21"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BannerIcon({ status }) {
  if (status === "success") {
    return (
      <svg style={styles.bannerIcon(status)} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M7 10L9 12L13 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg style={styles.bannerIcon(status)} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M10 18C14.4183 18 18 14.4183 18 10C18 5.58172 14.4183 2 10 2C5.58172 2 2 5.58172 2 10C2 14.4183 5.58172 18 10 18Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M10 6V10M10 14H10.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function Banner({ status, title, message, onDismiss }) {
  return (
    <div style={styles.banner(status)}>
      <BannerIcon status={status} />
      <div style={styles.bannerContent}>
        <div style={styles.bannerTitle(status)}>{title}</div>
        <div style={styles.bannerMessage(status)}>{message}</div>
      </div>
      <button style={styles.bannerClose} onClick={onDismiss} aria-label="Dismiss">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 5L5 15M5 5L15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function ProductSettingsPanel({
  productId,
  productTitle,
  settings,
  onSettingChange,
  onSave,
  isSaving,
}) {
  return (
    <div
      style={{
        padding: "16px",
        background: "#fff",
        border: "1px solid #e1e3e5",
        borderRadius: "8px",
        marginTop: "16px",
      }}
    >
      <h3 style={{ fontSize: "14px", fontWeight: "600", marginBottom: "12px", color: "#202223" }}>
        Customizer Features
      </h3>
      <p style={{ fontSize: "12px", color: "#6d7175", marginBottom: "16px" }}>
        Control which UI elements appear on the product page
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.enableSize}
            onChange={(e) => onSettingChange("enableSize", e.target.checked)}
            style={styles.checkbox}
          />
          <span style={{ fontSize: "13px" }}>Enable custom size</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.enablePrecut}
            onChange={(e) => onSettingChange("enablePrecut", e.target.checked)}
            style={styles.checkbox}
          />
          <span style={{ fontSize: "13px" }}>Enable pre-cut service</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.enableQuantity}
            onChange={(e) => onSettingChange("enableQuantity", e.target.checked)}
            style={styles.checkbox}
          />
          <span style={{ fontSize: "13px" }}>Enable quantity selector</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={settings.enablePlacement}
            onChange={(e) => onSettingChange("enablePlacement", e.target.checked)}
            style={styles.checkbox}
          />
          <span style={{ fontSize: "13px" }}>Enable design placement preview</span>
        </label>
      </div>
      <button
        onClick={onSave}
        disabled={isSaving}
        style={{
          marginTop: "16px",
          width: "100%",
          padding: "10px",
          fontSize: "14px",
          fontWeight: "500",
          color: "#fff",
          background: isSaving ? "#9ca3af" : "#008060",
          border: "none",
          borderRadius: "8px",
          cursor: isSaving ? "not-allowed" : "pointer",
        }}
      >
        {isSaving ? "Saving..." : "Save settings"}
      </button>
    </div>
  );
}

function ProductItem({ product, isSelected, onToggle }) {
  const isEnabled = product.templateSuffix === CUSTOM_TEMPLATE_SUFFIX;
  const price = product.priceRangeV2?.minVariantPrice;

  return (
    <div style={styles.productItem(isSelected)} onClick={onToggle}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        onClick={(e) => e.stopPropagation()}
        style={{ ...styles.checkbox, marginRight: "16px" }}
        aria-label={`Select ${product.title}`}
      />

      <div style={styles.productImage}>
        {product.featuredImage?.url ? (
          <img
            src={product.featuredImage.url}
            alt={product.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            loading="lazy"
          />
        ) : (
          <div style={styles.productImagePlaceholder}>No image</div>
        )}
      </div>

      <div style={styles.productInfo}>
        <div style={styles.productTitle}>{product.title}</div>
        <div style={styles.productMeta}>
          {price && (
            <span>
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: price.currencyCode,
              }).format(price.amount)}
            </span>
          )}
          <span>{product.totalInventory ?? 0} in stock</span>
          <span style={{ textTransform: "capitalize" }}>{product.status?.toLowerCase()}</span>
        </div>
      </div>

      <div style={styles.badge(isEnabled)}>
        {isEnabled && <CheckIcon />}
        {isEnabled ? "Editor Enabled" : "Standard"}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function EditorPage() {
  const loaderData = useLoaderData();
  const fetcher = useFetcher();
  const loadMoreFetcher = useFetcher();
  const settingsFetcher = useFetcher();
  const settingsLoaderFetcher = useFetcher();
  const shopify = useAppBridge();

  // State
  const [products, setProducts] = useState(loaderData.products || []);
  const [pageInfo, setPageInfo] = useState(loaderData.pageInfo || { hasNextPage: false, endCursor: null });
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchValue, setSearchValue] = useState(loaderData.searchQuery || "");
  const [notification, setNotification] = useState(null);
  const [productSettings, setProductSettings] = useState({
    enableSize: true,
    enablePrecut: true,
    enableQuantity: true,
    enablePlacement: true,
  });
  // Derived state
  const isUpdating = fetcher.state !== "idle";
  const settingsSaving = settingsFetcher.state !== "idle";
  const isLoadingMore = loadMoreFetcher.state === "loading";
  const allSelected = products.length > 0 && selectedIds.length === products.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < products.length;

  // Handle loader errors
  useEffect(() => {
    if (loaderData.error) {
      setNotification({ status: "error", title: "Error", message: loaderData.error });
    }
  }, [loaderData.error]);

  // Track last search value to prevent duplicate fetches
  const lastSearchRef = useRef(loaderData.searchQuery || "");

  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue !== lastSearchRef.current) {
        lastSearchRef.current = searchValue;
        loadMoreFetcher.load(`/app/editor?q=${encodeURIComponent(searchValue)}`);
      }
    }, DEBOUNCE_DELAY);

    return () => clearTimeout(timer);
  }, [searchValue]);

  // Handle fetcher results (search or load more)
  useEffect(() => {
    if (loadMoreFetcher.data) {
      const { products: newProducts, pageInfo: newPageInfo, isLoadMore } = loadMoreFetcher.data;
      
      if (isLoadMore) {
        // Pagination: append products
        setProducts((prev) => [...prev, ...(newProducts || [])]);
      } else {
        // New search: replace products
        setProducts(newProducts || []);
        setSelectedIds([]);
      }
      
      setPageInfo(newPageInfo || { hasNextPage: false, endCursor: null });
    }
  }, [loadMoreFetcher.data]);

  // Fetch product settings when exactly one product is selected
  useEffect(() => {
    if (selectedIds.length !== 1) {
      setProductSettings({
        enableSize: true,
        enablePrecut: true,
        enableQuantity: true,
        enablePlacement: true,
      });
      return;
    }
    const productId = selectedIds[0];
    settingsLoaderFetcher.load(`/api/product-settings?productId=${encodeURIComponent(productId)}`);
  }, [selectedIds]);

  // Apply loaded settings to state
  useEffect(() => {
    if (settingsLoaderFetcher.data && selectedIds.length === 1) {
      const d = settingsLoaderFetcher.data;
      setProductSettings({
        enableSize: d.enableSize ?? true,
        enablePrecut: d.enablePrecut ?? true,
        enableQuantity: d.enableQuantity ?? true,
        enablePlacement: d.enablePlacement ?? true,
      });
    }
  }, [settingsLoaderFetcher.data, selectedIds.length]);

  // Handle action response
  useEffect(() => {
    if (fetcher.data) {
      const { success, actionType, updatedCount, errorCount, error, updatedProducts } = fetcher.data;

      if (success) {
        const action = actionType === "enable" ? "enabled" : "disabled";
        setNotification({
          status: "success",
          title: "Success",
          message: `Editor ${action} for ${updatedCount} product(s).`,
        });
        shopify.toast.show(`Editor ${action} for ${updatedCount} product(s)`);

        // Update products in state
        if (updatedProducts?.length) {
          setProducts((prev) =>
            prev.map((p) => {
              const updated = updatedProducts.find((u) => u.id === p.id);
              return updated ? { ...p, templateSuffix: updated.templateSuffix } : p;
            })
          );
        }
        setSelectedIds([]);
      } else {
        setNotification({
          status: "error",
          title: "Error",
          message: error || `Failed to update ${errorCount} product(s).`,
        });
        shopify.toast.show(error || "Update failed", { isError: true });
      }
    }
  }, [fetcher.data, shopify]);

  // Handle settings save response
  useEffect(() => {
    if (settingsFetcher.data) {
      if (settingsFetcher.data.success) {
        shopify.toast.show("Settings saved");
      } else {
        shopify.toast.show(settingsFetcher.data.error || "Failed to save", { isError: true });
      }
    }
  }, [settingsFetcher.data, shopify]);

  // Handlers
  const handleSelectAll = useCallback(() => {
    setSelectedIds(allSelected ? [] : products.map((p) => p.id));
  }, [allSelected, products]);

  const handleToggleProduct = useCallback((productId) => {
    setSelectedIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }, []);

  const handleAction = useCallback(
    (actionType) => {
      if (selectedIds.length === 0) {
        shopify.toast.show("Please select at least one product", { isError: true });
        return;
      }

      fetcher.submit(
        { actionType, productIds: JSON.stringify(selectedIds) },
        { method: "POST" }
      );
    },
    [selectedIds, fetcher, shopify]
  );

  const handleLoadMore = useCallback(() => {
    if (pageInfo.hasNextPage && pageInfo.endCursor) {
      loadMoreFetcher.load(
        `/app/editor?q=${encodeURIComponent(searchValue)}&cursor=${pageInfo.endCursor}`
      );
    }
  }, [pageInfo, searchValue, loadMoreFetcher]);

  const handleSettingChange = useCallback((key, value) => {
    setProductSettings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSaveSettings = useCallback(() => {
    if (selectedIds.length !== 1) return;
    settingsFetcher.submit(
      {
        productId: selectedIds[0],
        enableSize: String(productSettings.enableSize),
        enablePrecut: String(productSettings.enablePrecut),
        enableQuantity: String(productSettings.enableQuantity),
        enablePlacement: String(productSettings.enablePlacement),
      },
      { method: "POST", action: "/api/product-settings" }
    );
  }, [selectedIds, productSettings, settingsFetcher]);

  // Count enabled products in selection
  const enabledCount = useMemo(
    () => products.filter((p) => selectedIds.includes(p.id) && p.templateSuffix === CUSTOM_TEMPLATE_SUFFIX).length,
    [products, selectedIds]
  );

  return (
    <s-page heading="Product Editor Manager">
      {/* Spinner animation CSS */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      
      <s-stack direction="inline" gap="base" slot="primary-action">
        <s-button
          variant="primary"
          onClick={() => handleAction("enable")}
          disabled={selectedIds.length === 0 || isUpdating}
          {...(isUpdating && fetcher.formData?.get("actionType") === "enable" ? { loading: true } : {})}
        >
          Enable Editor
        </s-button>
        <s-button
          variant="secondary"
          onClick={() => handleAction("disable")}
          disabled={selectedIds.length === 0 || isUpdating}
          {...(isUpdating && fetcher.formData?.get("actionType") === "disable" ? { loading: true } : {})}
        >
          Disable Editor
        </s-button>
      </s-stack>

      <s-section>
        <s-box padding="base">
          <div style={styles.container}>
            {/* Notification Banner */}
            {notification && (
              <Banner
                status={notification.status}
                title={notification.title}
                message={notification.message}
                onDismiss={() => setNotification(null)}
              />
            )}

            {/* Search */}
            <div style={styles.searchContainer}>
              <label htmlFor="search" style={styles.searchLabel}>
                Search Products
              </label>
              <div style={styles.searchInputWrapper}>
                <span style={styles.searchIcon}>
                  <SearchIcon />
                </span>
                <input
                  id="search"
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search by product title..."
                  style={styles.searchInput}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{
              display: "flex",
              gap: "12px",
              marginBottom: "20px",
              padding: "16px",
              background: "#f9fafb",
              borderRadius: "8px",
              border: "1px solid #e1e3e5",
            }}>
              <button
                onClick={() => handleAction("enable")}
                disabled={selectedIds.length === 0 || isUpdating}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#fff",
                  background: selectedIds.length === 0 || isUpdating ? "#9ca3af" : "#008060",
                  border: "none",
                  borderRadius: "8px",
                  cursor: selectedIds.length === 0 || isUpdating ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {isUpdating && fetcher.formData?.get("actionType") === "enable" && (
                  <span style={{
                    width: "14px",
                    height: "14px",
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }} />
                )}
                Enable Editor {selectedIds.length > 0 && `(${selectedIds.length})`}
              </button>
              
              <button
                onClick={() => handleAction("disable")}
                disabled={selectedIds.length === 0 || isUpdating}
                style={{
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: selectedIds.length === 0 || isUpdating ? "#9ca3af" : "#dc2626",
                  background: "#fff",
                  border: `1px solid ${selectedIds.length === 0 || isUpdating ? "#e5e7eb" : "#dc2626"}`,
                  borderRadius: "8px",
                  cursor: selectedIds.length === 0 || isUpdating ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                {isUpdating && fetcher.formData?.get("actionType") === "disable" && (
                  <span style={{
                    width: "14px",
                    height: "14px",
                    border: "2px solid rgba(220,38,38,0.3)",
                    borderTopColor: "#dc2626",
                    borderRadius: "50%",
                    animation: "spin 0.8s linear infinite",
                  }} />
                )}
                Disable Editor
              </button>
              
              {selectedIds.length > 0 && (
                <span style={{
                  marginLeft: "auto",
                  fontSize: "14px",
                  color: "#374151",
                  display: "flex",
                  alignItems: "center",
                }}>
                  {selectedIds.length} product{selectedIds.length !== 1 ? "s" : ""} selected
                </span>
              )}
            </div>

            {/* Toolbar */}
            <div style={styles.toolbar}>
              <div style={styles.toolbarLeft}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => el && (el.indeterminate = someSelected)}
                  onChange={handleSelectAll}
                  style={styles.checkbox}
                  aria-label="Select all products"
                />
                <span style={styles.selectionText}>
                  {selectedIds.length > 0
                    ? `${selectedIds.length} of ${products.length} selected`
                    : `${products.length} product${products.length !== 1 ? "s" : ""}`}
                </span>
                {selectedIds.length > 0 && enabledCount > 0 && (
                  <span style={{ fontSize: "12px", color: "#6d7175" }}>
                    ({enabledCount} already enabled)
                  </span>
                )}
              </div>
              {loadMoreFetcher.state === "loading" && (
                <span style={{ fontSize: "13px", color: "#6d7175" }}>Loading...</span>
              )}
            </div>

            {/* Product List */}
            <div style={styles.productList}>
              {products.length === 0 ? (
                <div style={styles.emptyState}>
                  <EmptyIcon />
                  <div style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px" }}>
                    No products found
                  </div>
                  <div style={{ fontSize: "14px" }}>
                    {searchValue ? "Try a different search term" : "Your store has no products yet"}
                  </div>
                </div>
              ) : (
                products.map((product) => (
                  <ProductItem
                    key={product.id}
                    product={product}
                    isSelected={selectedIds.includes(product.id)}
                    onToggle={() => handleToggleProduct(product.id)}
                  />
                ))
              )}
            </div>

            {/* Pagination */}
            {pageInfo.hasNextPage && (
              <div style={styles.pagination}>
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  style={{
                    ...styles.loadMoreButton,
                    opacity: isLoadingMore ? 0.7 : 1,
                  }}
                >
                  {isLoadingMore ? "Loading..." : "Load More Products"}
                </button>
              </div>
            )}
          </div>
        </s-box>
      </s-section>

      <s-section slot="aside" heading="About">
        <s-paragraph>
          Use this tool to assign the <code>custom-editor</code> template to products, enabling the custom product customizer on their product pages.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Quick Stats">
        <s-paragraph>
          <strong>Total Products:</strong> {products.length}
        </s-paragraph>
        <s-paragraph>
          <strong>Editor Enabled:</strong> {products.filter((p) => p.templateSuffix === CUSTOM_TEMPLATE_SUFFIX).length}
        </s-paragraph>
        <s-paragraph>
          <strong>Selected:</strong> {selectedIds.length}
        </s-paragraph>
      </s-section>

      {selectedIds.length === 1 && (
        <s-section slot="aside" heading="Product Customizer Settings">
          {settingsLoaderFetcher.state === "loading" ? (
            <s-paragraph>Loading settings...</s-paragraph>
          ) : (
            <ProductSettingsPanel
              productId={selectedIds[0]}
              productTitle={products.find((p) => p.id === selectedIds[0])?.title || ""}
              settings={productSettings}
              onSettingChange={handleSettingChange}
              onSave={handleSaveSettings}
              isSaving={settingsSaving}
            />
          )}
        </s-section>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
