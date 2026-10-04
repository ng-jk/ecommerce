import { expect, it } from "vitest";
import {
  assistantPaymentLinks,
  assistantResultRows,
} from "../../packages/storefront/services/assistant/logic/assistantResults";

const product = {
  id: 7,
  name: "Wireless headphones",
  price: 18900,
  stock: 10,
  shop_id: 2,
  version: 4,
  code: "internal-code",
  created_at: "2026-09-27",
};
it("extracts only allowlisted hosted payment URLs from checkout and order lists", () => {
  const billplz = "https://www.billplz.com/bills/bill_1";
  const sandbox = "https://www.billplz-sandbox.com/bills/bill_2";
  const stripe = "https://checkout.stripe.com/c/pay/cs_test_123";
  expect(
    assistantPaymentLinks({
      order: { id: 9, payment: { checkout_url: billplz } },
    }),
  ).toEqual([{ label: "Pay securely #9", url: billplz }]);
  expect(
    assistantPaymentLinks({
      orders: {
        data: [
          { id: 10, payment: { checkout_url: sandbox } },
          { payment: { checkout_url: stripe } },
        ],
      },
    }),
  ).toEqual([
    { label: "Pay securely #10", url: sandbox },
    { label: "Pay securely", url: stripe },
  ]);
  for (const value of [
    null,
    undefined,
    { products: { data: [] } },
    { orders: {} },
    { order: null },
    { order: { payment: null } },
  ])
    expect(assistantPaymentLinks(value)).toEqual([]);
  for (const checkout_url of [
    null,
    1,
    "javascript:alert(1)",
    "http://www.billplz.com/bills/a",
    "https://evil.test/pay",
    "https://www.billplz.com.evil.test/bills/a",
    "https://checkout.stripe.com@evil.test/c/pay/a",
    "https://checkout.stripe.com/c/pay/a?next=evil",
  ])
    expect(
      assistantPaymentLinks({ order: { payment: { checkout_url } } }),
    ).toEqual([]);
});
it("summarizes catalog and individual products with MYR prices and public product references", () => {
  const expected = ["Wireless headphones #7 — RM 189.00 · Stock: 10"];
  expect(assistantResultRows({ product })).toEqual(expected);
  expect(
    assistantResultRows({
      products: { data: [product], meta: { total: 1 } },
      shop: { id: 2 },
    }),
  ).toEqual(expected);
  expect(assistantResultRows({ products: { data: [] } })).toEqual([
    "No products found.",
  ]);
  expect(assistantResultRows({ product: null })).toEqual([
    "Product details unavailable.",
  ]);
  expect(
    assistantResultRows({
      product: { id: 0, name: "", price: -1, stock: "bad" },
    }),
  ).toEqual(["Product — Amount unavailable · Stock unavailable"]);
  expect(assistantResultRows({ product: { id: "7", price: 1.5 } })).toEqual([
    "Product — Amount unavailable · Stock unavailable",
  ]);
});

it("summarizes orders with server payment/status labels, totals and invoice references", () => {
  const order = {
    id: 9,
    total: 19700,
    status: "placed",
    payment_label: "Awaiting payment",
    payment: { invoice_id: "invoice-9", label: "Merchant invoice" },
    version: 5,
  };
  expect(assistantResultRows({ order, options: { placed: "Placed" } })).toEqual(
    [
      "Order #9 — RM 197.00",
      "Awaiting payment",
      "Status: Placed",
      "Payment reference: invoice-9",
    ],
  );
  expect(assistantResultRows({ orders: { data: [order] } })).toEqual([
    "Order #9 — RM 197.00",
    "Awaiting payment",
    "Payment reference: invoice-9",
  ]);
  expect(assistantResultRows({ orders: { data: [] } })).toEqual([
    "No orders found.",
  ]);
  expect(assistantResultRows({ order: [] })).toEqual([
    "Order details unavailable.",
  ]);
  expect(
    assistantResultRows({
      order: { total: 100, payment: { label: "Paid", invoice_id: "" } },
    }),
  ).toEqual(["Order — RM 1.00", "Paid"]);
  expect(
    assistantResultRows({
      order: { id: -1, total: null, status: "unknown" },
      options: { unknown: 3 },
    }),
  ).toEqual(["Order — Amount unavailable", "Payment details unavailable"]);
});

it("summarizes cart quantities and item prices without leaking its version or method configuration", () => {
  expect(
    assistantResultRows({
      items: [{ product_id: 7, quantity: 2, product }],
      version: 10,
      payment_methods: { internal: "Private" },
    }),
  ).toEqual(["Wireless headphones #7 — Quantity: 2 · Each: RM 189.00"]);
  expect(assistantResultRows({ items: [] })).toEqual(["Your cart is empty."]);
  expect(
    assistantResultRows({
      items: [null, { product_id: 7, quantity: null, product: null }],
    }),
  ).toEqual([
    "Cart item details unavailable.",
    "Product #7 — Quantity unavailable · Each: Amount unavailable",
  ]);
});

it("keeps unknown simple responses readable and suppresses secret, tenant and transport metadata", () => {
  expect(assistantResultRows(null)).toEqual([]);
  expect(assistantResultRows(undefined)).toEqual([]);
  expect(assistantResultRows("Done")).toEqual(["Done"]);
  expect(assistantResultRows(["Done"])).toEqual(["0: Done"]);
  expect(
    assistantResultRows({
      shop_id: 2,
      version: 3,
      created_at: "date",
      updated_at: "date",
      code: "internal",
      meta: { total: 2 },
      token: "secret",
      password: "secret",
      receipt_hash: "secret",
      data: { display_name: "Public name", verified: true },
    }),
  ).toEqual(["Data · Display name: Public name", "Data · Verified: true"]);
  expect(
    assistantResultRows({ products: {}, orders: {}, logged_out: true }),
  ).toEqual(["Logged out: true"]);
});
it("uses model option labels for plugins and presents loyalty balances", () => {
  const plugin = {
    id: 3,
    plugin_id: "loyalty",
    enabled: true,
    customer_enabled: false,
    version: 9,
  };
  const options = { plugin_id: { loyalty: "Reward points" } };
  expect(assistantResultRows({ plugin, options })).toEqual([
    "Reward points #3 — Enabled · Customer access off",
  ]);
  expect(assistantResultRows({ plugins: { data: [plugin] }, options })).toEqual(
    ["Reward points #3 — Enabled · Customer access off"],
  );
  expect(assistantResultRows({ plugins: { data: [] }, options })).toEqual([
    "No plugins found.",
  ]);
  expect(assistantResultRows({ plugin: null, options })).toEqual([
    "Plugin details unavailable.",
  ]);
  expect(assistantResultRows({ plugin })).toEqual([
    "Plugin type unavailable. Refresh this page.",
  ]);
  expect(assistantResultRows({ balance: { points: 42 } })).toEqual([
    "Loyalty balance: 42 points",
  ]);
  expect(assistantResultRows({ balance: { points: "42" } })).toEqual([
    "Loyalty balance unavailable.",
  ]);
});

it("rejects missing or malformed plugin labels and shows disabled customer grants accurately", () => {
  const plugin = {
    id: 3,
    plugin_id: "loyalty",
    enabled: false,
    customer_enabled: true,
  };
  expect(
    assistantResultRows({
      plugin,
      options: { plugin_id: { loyalty: "Rewards" } },
    }),
  ).toEqual(["Rewards #3 — Disabled · Customer access on"]);
  for (const options of [
    {},
    { plugin_id: null },
    { plugin_id: { loyalty: " " } },
  ]) {
    expect(assistantResultRows({ plugin, options })).toEqual([
      "Plugin type unavailable. Refresh this page.",
    ]);
  }
  expect(
    assistantResultRows({
      plugin: { ...plugin, plugin_id: 42 },
      options: { plugin_id: { "42": "Untrusted label" } },
    }),
  ).toEqual(["Plugin type unavailable. Refresh this page."]);
});
