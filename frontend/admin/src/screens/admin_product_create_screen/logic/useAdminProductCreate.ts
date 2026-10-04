import { useEffect, useState } from "react";
import { useStore } from "@portfolio/storefront";
import { getAdminProducts } from "../../../services/admin_products";

export function useAdminProductCreate() {
  const { api, run, user } = useStore();
  const [options, setOptions] = useState<Record<string, string>>({});
  useEffect(() => {
    if (user?.role === "admin")
      void run(async () => setOptions((await getAdminProducts(api)).options));
  }, [api, run, user?.role]);
  return { user, options };
}
