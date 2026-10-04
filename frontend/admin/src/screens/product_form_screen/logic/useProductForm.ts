import type { Product } from "@portfolio/api-client";
import { useStore } from "@portfolio/storefront";
import { router } from "expo-router";
import { useState } from "react";
import {
  deleteAdminProduct,
  productValues,
  saveAdminProduct,
} from "../../../services/admin_products";

export function useProductForm(initial: Partial<Product>) {
  const { api, run, busy } = useStore();
  const [draft, setDraft] = useState(initial),
    [step, setStep] = useState(0);
  const [price, setPrice] = useState(
    initial.price === undefined ? "" : String(initial.price / 100),
  );
  const [stock, setStock] = useState(String(initial.stock ?? 0));
  const [specs, setSpecs] = useState(
    Object.entries(initial.specifications ?? {})
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n"),
  );
  const set = (field: keyof Product, value: string) =>
    setDraft((previous) => ({ ...previous, [field]: value }));
  const save = () =>
    run(async () => {
      await saveAdminProduct(api, productValues(draft, price, stock, specs));
      router.replace("/products");
    });
  const remove = () =>
    run(async () => {
      if (draft.id === undefined || draft.version === undefined)
        throw new Error("Reload the product before deleting.");
      await deleteAdminProduct(api, draft.id, draft.version);
      router.replace("/products");
    });
  const setVisibility = (value: string) =>
    setDraft((previous) => ({ ...previous, active: value === "1" }));
  return {
    draft,
    step,
    setStep,
    price,
    setPrice,
    stock,
    setStock,
    specs,
    setSpecs,
    set,
    busy,
    save,
    remove,
    setVisibility,
  };
}
