import type { Product } from "@portfolio/api-client/domain/types";
export function productValues(
  draft: Partial<Product>,
  price: string,
  stock: string,
  specs: string,
): Partial<Product> {
  if (!/^\d+(\.\d{1,2})?$/.test(price) || !/^\d+$/.test(stock))
    throw new Error("Enter a valid MYR price and whole-number stock.");
  const [whole = "0", fraction = ""] = price.split(".");
  const sen = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (
    !Number.isSafeInteger(sen) ||
    sen < 1 ||
    sen > 10000000 ||
    Number(stock) > 1000000
  )
    throw new Error("Price or stock is outside the allowed range.");
  const entries = specs
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const colon = line.indexOf(":");
      if (colon < 1 || !line.slice(colon + 1).trim())
        throw new Error("Write each specification as Label: Value.");
      return [
        line.slice(0, colon).trim(),
        line.slice(colon + 1).trim(),
      ] as const;
    });
  if (new Set(entries.map(([key]) => key)).size !== entries.length)
    throw new Error("Specification labels must be unique.");
  return {
    ...draft,
    price: sen,
    stock: Number(stock),
    specifications: Object.fromEntries(entries),
  };
}
