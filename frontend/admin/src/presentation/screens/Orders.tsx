import { money } from "@portfolio/api-client/domain/types";
import { Button, Copy, Panel } from "@portfolio/storefront";
import { router } from "expo-router";
import { useAdminOrders } from "../view-models/useAdminOrders";
import { AdminPage } from "../components/AdminPage";
export default function Orders() {
  const {
    items,
    status,
    page,
    setPage,
    last,
    options,
    transitions,
    filter,
    advance,
  } = useAdminOrders();
  return (
    <AdminPage title="Orders">
      <Button title="Dashboard" onPress={() => router.replace("/")} />
      <Button
        title={`Filter: ${options[status] ?? "All statuses"}`}
        onPress={filter}
      />
      {items.map((order) => {
        const next = transitions[order.status];
        return (
          <Panel key={order.id}>
            <Copy>
              Order #{order.id} · {money(order.total)} ·{" "}
              {options[order.status] ?? "Unavailable status"}
            </Copy>
            <Copy>{order.payment_label ?? "Payment details unavailable"}</Copy>
            {next && order.can_fulfill !== false && (
              <Button
                title={`Mark ${options[next] ?? "next stage"}`}
                onPress={() => {
                  void advance(order.id, next);
                }}
              />
            )}
          </Panel>
        );
      })}
      <Button
        title="Previous"
        disabled={page === 1}
        onPress={() => setPage((value) => value - 1)}
      />
      <Copy>
        {page} / {last}
      </Copy>
      <Button
        title="Next"
        disabled={page === last}
        onPress={() => setPage((value) => value + 1)}
      />
    </AdminPage>
  );
}
