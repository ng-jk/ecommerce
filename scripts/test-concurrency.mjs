import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Against the running local PostgreSQL demo. Creates isolated test accounts/products.
const base = "http://localhost:8080/api/v1/shops/fashion/";
async function request(path, token, method = "GET", body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() };
}
const login = await request("auth/login", null, "POST", {
  email: "admin@fashion.demo",
  password: "Portfolio2026!",
  device_name: "Concurrency test",
});
assert.equal(login.status, 200);
const admin = login.data.token;
const product = await request("admin/products", admin, "POST", {
  name: "Concurrency fixture " + randomUUID(),
  category: "Test",
  description: "Temporary stock contention fixture",
  image_url: "https://example.com/test.jpg",
  price: 100,
  stock: 1,
});
assert.equal(product.status, 201);
const id = product.data.product.id;
const tokens = [];
const address = {
  name: "Concurrent tester",
  line1: "Test address",
  city: "Melaka",
  postcode: "75000",
  country: "MY",
};
try {
  for (let i = 0; i < 2; i++) {
    const account = await request("auth/register", null, "POST", {
      name: "Concurrent tester",
      email: `${randomUUID()}@concurrency.test`,
      password: "Concurrency2026!",
      password_confirmation: "Concurrency2026!",
      device_name: "Test",
    });
    assert.equal(account.status, 200);
    tokens.push(account.data.token);
    assert.equal(
      (
        await request("cart", account.data.token, "PUT", {
          items: [{ product_id: id, quantity: 1 }],
        })
      ).status,
      200,
    );
  }
  const results = await Promise.all(
    tokens.map((token) =>
      request("checkout", token, "POST", {
        checkout_key: randomUUID(),
        shipping_address: address,
      }),
    ),
  );
  assert.deepEqual(
    results.map((r) => r.status).sort(),
    [200, 422],
    "Only one customer may buy the final unit",
  );
  assert.equal((await request(`products/${id}`)).data.product.stock, 0);
  await request(`admin/products/${id}`, admin, "PATCH", { stock: 1 });
  await request("cart", tokens[0], "PUT", {
    items: [{ product_id: id, quantity: 1 }],
  });
  const body = { checkout_key: randomUUID(), shipping_address: address };
  const retries = await Promise.all([
    request("checkout", tokens[0], "POST", body),
    request("checkout", tokens[0], "POST", body),
  ]);
  assert.equal(retries[0].status, 200);
  assert.equal(retries[1].status, 200);
  assert.equal(
    retries[0].data.order.id,
    retries[1].data.order.id,
    "Concurrent retries must resolve to one order",
  );
  assert.equal((await request(`products/${id}`)).data.product.stock, 0);
  console.log(
    "PASS: PostgreSQL prevents overselling and duplicate concurrent orders.",
  );
} finally {
  await request(`admin/products/${id}`, admin, "PATCH", { active: false });
  for (const token of [...tokens, admin])
    await fetch(base + "auth/logout", {
      method: "POST",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
}
