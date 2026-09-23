import { type Order } from "@portfolio/api-client/domain/types";
import { useStore } from "@portfolio/storefront";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
export function useAdminOrders() {
  const { api, run, user } = useStore();
  const [items, setItems] = useState<Order[]>([]),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [last, setLast] = useState(1),
    [options, setOptions] = useState<Record<string, string>>({}),
    [transitions, setTransitions] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const result = await api.adminOrders(page, status);
    setItems(result.orders.data);
    setLast(result.orders.meta.last_page);
    setOptions(result.options);
    setTransitions(result.transitions);
  }, [api, page, status]);
  useFocusEffect(
    useCallback(() => {
      if (user?.role === "admin") void run(load);
    }, [user?.role, run, load]),
  );
  const filter = () => {
    const values = Object.keys(options);
    setStatus(values[values.indexOf(status) + 1] ?? "");
    setPage(1);
  };
  const advance = (id: number, next: string) =>
    run(async () => {
      await api.advanceOrder(id, next);
      await load();
    });
  return {
    items,
    status,
    page,
    setPage,
    last,
    options,
    transitions,
    filter,
    advance,
  };
}
