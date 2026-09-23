import { useStore } from "@portfolio/storefront";
import { useEffect, useState } from "react";
export function useCreateProduct() {
  const { api, run, user } = useStore();
  const [options, setOptions] = useState<Record<string, string>>({});
  useEffect(() => {
    if (user?.role === "admin")
      void run(async () => setOptions((await api.adminProducts()).options));
  }, [api, run, user?.role]);
  return { user, options };
}
