import { extension, Text, BlockStack } from "@shopify/ui-extensions/checkout";

export default extension(
  "purchase.checkout.cart-line-item.render-after",
  (root, api) => {
    const line = api?.target?.value ?? api?.target?.current;
    const attributes = line?.attributes ?? [];
    const productNameAttr = attributes.find(
      (a) => a && (a.key === "Product" || a.key === "product"),
    );
    const displayName = productNameAttr?.value?.trim();

    if (!displayName) return;

    const text = root.createComponent(Text, { size: "medium", emphasis: "bold" }, displayName);
    const stack = root.createComponent(BlockStack, { spacing: "tight" }, [text]);
    root.appendChild(stack);
  },
);
