import { type Order } from "@portfolio/api-client";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { useStore } from "../../store_shell_screen";
export function useOrders() {
  const { user, ready, api, run } = useStore();
  const [orders, setOrders] = useState<Order[]>([]),
    [options, setOptions] = useState<Record<string, string>>({}),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(1),
    [last, setLast] = useState(1);
  const load = useCallback(() => {
    if (user) {
      setLoading(true);
      void run(async () => {
        const data = await api.orders(page);
        setOrders(data.orders.data);
        setOptions(data.options);
        setLast(data.orders.meta.last_page);
      }).finally(() => setLoading(false));
    }
  }, [user, api, page, run]);
  useFocusEffect(load);
  return { user, ready, orders, loading, page, setPage, last, options, load };
}
