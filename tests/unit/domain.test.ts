import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  backDestination,
  durableHistory,
  type Screen,
} from "../../packages/storefront/services/navigation/logic/navigation";
import {
  changeQuantity,
  subtotal,
} from "../../packages/storefront/services/cart/logic/cart";
import { productValues } from "../../frontend/admin/src/services/admin_products/logic/productValues";
const main: Screen = { id: "home", kind: "main", fallback: "/", controls: [] };
const temp: Screen = {
  id: "pending",
  kind: "temp",
  fallback: "/",
  controls: [],
};
describe("navigation policy", () => {
  it("never returns a transient screen for any finite history", () =>
    fc.assert(
      fc.property(fc.array(fc.boolean()), (values) => {
        const history = values.map((value) => (value ? main : temp));
        expect(backDestination(history, main).kind).toBe("main");
        expect(
          durableHistory(history, temp).every(
            (screen) => screen.kind === "main",
          ),
        ).toBe(true);
      }),
    ));
  it("rejects a transient fallback", () =>
    expect(() => backDestination([], temp)).toThrow(
      "The fallback must be a main screen.",
    ));
});
it("changes only the requested cart line and removes zero quantity", () => {
  expect(
    changeQuantity(
      [
        { product_id: 1, quantity: 2 },
        { product_id: 2, quantity: 1 },
      ],
      1,
      0,
    ),
  ).toEqual([{ product_id: 2, quantity: 1 }]);
  expect(() => changeQuantity([], 1, -1)).toThrow();
  expect(() => changeQuantity([], 1, 1.5)).toThrow();
  expect(subtotal([])).toBe(0);
});
it("parses cents without floating point rounding and rejects malformed data", () => {
  expect(productValues({}, "1.01", "2", "Colour: Blue")).toMatchObject({
    price: 101,
    stock: 2,
    specifications: { Colour: "Blue" },
  });
  for (const price of ["-1", "1.001", "NaN", "0", "1000000"]) {
    expect(() => productValues({}, price, "2", "")).toThrow();
  }
  expect(() => productValues({}, "1", "2", "broken")).toThrow();
  expect(() => productValues({}, "1", "2", "A: 1\nA: 2")).toThrow();
});

it("returns the most recent durable route and preserves durable history order", () => {
  const first = { ...main, id: "first" },
    second = { ...main, id: "second" },
    next = { ...main, id: "next" };
  const history = [first, temp, second, temp];
  expect(backDestination(history, main)).toBe(second);
  expect(backDestination([temp], main)).toBe(main);
  expect(durableHistory(history, temp)).toEqual([first, second]);
  expect(durableHistory(history, next)).toEqual([first, second, next]);
  expect(history).toEqual([first, temp, second, temp]);
});
