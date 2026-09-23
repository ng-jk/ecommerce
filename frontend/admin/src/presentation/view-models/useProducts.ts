import { type Product } from "@portfolio/api-client/domain/types";
import { useStore } from "@portfolio/storefront";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
export function useProducts() {
  const { api, run, user } = useStore();
  const [items, setItems] = useState<Product[]>([]),
    [category, setCategory] = useState(""),
    [page, setPage] = useState(1),
    [last, setLast] = useState(1);
  useFocusEffect(
    useCallback(() => {
      if (user?.role === "admin")
        void run(async () => {
          const result = await api.adminProducts(page, category);
          setItems(result.products.data);
          setLast(result.products.meta.last_page);
        });
    }, [api, run, page, category, user?.role]),
  );
  return { user, items, page, setPage, last, category, setCategory };
}
