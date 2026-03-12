import {
  reactExtension,
  useApi,
  Text,
  BlockStack,
} from "@shopify/ui-extensions-react/checkout";

export default reactExtension(
  "purchase.thank-you.cart-line-item.render-after",
  () => <LineItemProductName />,
);

function LineItemProductName() {
  const api = useApi();
  const line = api?.target?.value ?? api?.target?.current;
  const attributes = line?.attributes ?? [];
  const productNameAttr = attributes.find(
    (a) => a && (a.key === "Product" || a.key === "product"),
  );
  const displayName = productNameAttr?.value?.trim();

  if (!displayName) return null;

  return (
    <BlockStack spacing="tight">
      <Text size="medium" emphasis="bold">
        {displayName}
      </Text>
    </BlockStack>
  );
}
