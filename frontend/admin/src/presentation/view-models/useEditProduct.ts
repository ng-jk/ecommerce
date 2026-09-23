import type { Product } from "@portfolio/api-client/domain/types";
import { useStore } from "@portfolio/storefront";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
export function useEditProduct() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, run, user } = useStore();
  const [data, setData] = useState<{
    product: Product;
    options: Record<string, string>;
  } | null>(null);
  useEffect(() => {
    if (user?.role === "admin")
      void run(async () => setData(await api.adminProduct(id)));
  }, [api, run, id, user?.role]);
  return { data };
}
