# Checkout line item title

Shows the **dynamic product name** for CustomScale line items in checkout and on the Thank you page.

When a line item has the `Product` line item property (the real product title from the page where the customer added the item), this extension renders that name under the line item so customers see e.g. "Blue T-Shirt" instead of only "CustomScale Dynamic Product".

## Setup

1. Deploy the app so this extension is included: `shopify app deploy`.
2. In **Shopify Admin → Settings → Checkout**, open the checkout editor and add the **"checkout-line-item-title"** block to the order summary (it appears per line item when the `Product` property is present).

## Cart page

For the **cart** page to show the dynamic product name, your theme must use the snippet:

- **Snippet:** `extensions/cloth-extension/snippets/customscale-line-item-title.liquid`
- Use it where you render the line item title, e.g. `{% render 'customscale-line-item-title', line_item: line_item %}`

That snippet shows `line_item.properties.Product` when set, otherwise the product title.
