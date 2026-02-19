/**
 * Tests for order payload parsing (CustomImage extraction, order metafield payload).
 * Run: node --test app/orderPayload.server.test.js
 */
import { describe, it } from "node:test";
import assert from "node:assert";
import {
  extractImagesFromProperties,
  buildLineItemsAndImages,
  getOrderId,
} from "./orderPayload.server.js";

describe("extractImagesFromProperties", () => {
  it("extracts URL from CustomImage property", () => {
    const props = [
      { name: "CustomImage", value: "https://highquality.allgovjobs.com/backend/processed/1771182255193-img.png" },
    ];
    const got = extractImagesFromProperties(props);
    assert.deepStrictEqual(got, ["https://highquality.allgovjobs.com/backend/processed/1771182255193-img.png"]);
  });

  it("extracts URL from Custom Image (with space) property", () => {
    const props = [
      { name: "Custom Image", value: "https://example.com/img.png" },
    ];
    const got = extractImagesFromProperties(props);
    assert.deepStrictEqual(got, ["https://example.com/img.png"]);
  });

  it("extracts URL from any property name containing 'image'", () => {
    const props = [
      { name: "product_image", value: "https://cdn.example.com/pic.jpg" },
    ];
    const got = extractImagesFromProperties(props);
    assert.deepStrictEqual(got, ["https://cdn.example.com/pic.jpg"]);
  });

  it("ignores empty or non-URL values for image-like names", () => {
    const props = [
      { name: "CustomImage", value: "" },
      { name: "CustomImage", value: "   " },
    ];
    const got = extractImagesFromProperties(props);
    assert.deepStrictEqual(got, []);
  });

  it("extracts value that looks like URL even without 'image' in name", () => {
    const props = [{ name: "some_key", value: "https://foo.com/x.png" }];
    const got = extractImagesFromProperties(props);
    assert.deepStrictEqual(got, ["https://foo.com/x.png"]);
  });

  it("returns empty array for non-array input", () => {
    assert.deepStrictEqual(extractImagesFromProperties(null), []);
    assert.deepStrictEqual(extractImagesFromProperties(undefined), []);
  });
});

describe("buildLineItemsAndImages", () => {
  it("builds lineItems and images with CustomImage URL and custom_image_url per line", () => {
    const order = {
      id: 5678,
      line_items: [
        {
          id: 1001,
          name: "The Collection Snowboard: Liquid",
          title: "The Collection Snowboard: Liquid",
          quantity: 1,
          price: "749.95",
          properties: [
            {
              name: "CustomImage",
              value: "https://highquality.allgovjobs.com/backend/processed/1771182255193-img.png",
            },
          ],
        },
      ],
    };
    const { lineItems, images } = buildLineItemsAndImages(order);
    assert.strictEqual(images.length, 1);
    assert.strictEqual(images[0], "https://highquality.allgovjobs.com/backend/processed/1771182255193-img.png");
    assert.strictEqual(lineItems.length, 1);
    assert.strictEqual(lineItems[0].custom_image_url, "https://highquality.allgovjobs.com/backend/processed/1771182255193-img.png");
    assert.strictEqual(lineItems[0].name, "The Collection Snowboard: Liquid");
  });

  it("handles line item with no CustomImage (custom_image_url null)", () => {
    const order = {
      line_items: [
        { id: 1002, name: "Plain Product", properties: [] },
      ],
    };
    const { lineItems, images } = buildLineItemsAndImages(order);
    assert.strictEqual(images.length, 0);
    assert.strictEqual(lineItems[0].custom_image_url, null);
  });

  it("deduplicates images across line items", () => {
    const order = {
      line_items: [
        {
          id: 1,
          properties: [{ name: "CustomImage", value: "https://same.com/img.png" }],
        },
        {
          id: 2,
          properties: [{ name: "CustomImage", value: "https://same.com/img.png" }],
        },
      ],
    };
    const { images } = buildLineItemsAndImages(order);
    assert.deepStrictEqual(images, ["https://same.com/img.png"]);
  });
});

describe("getOrderId", () => {
  it("returns order.id when present", () => {
    assert.strictEqual(getOrderId({ id: 12345 }), 12345);
  });
  it("returns id from admin_graphql_api_id when id missing", () => {
    assert.strictEqual(
      getOrderId({ admin_graphql_api_id: "gid://shopify/Order/999" }),
      "999"
    );
  });
  it("returns null for null/undefined order", () => {
    assert.strictEqual(getOrderId(null), null);
    assert.strictEqual(getOrderId(undefined), null);
  });
});
