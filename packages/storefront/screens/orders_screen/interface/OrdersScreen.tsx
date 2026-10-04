import { money } from "@portfolio/api-client";
import { Link } from "expo-router";
import { View } from "react-native";
import {
  Button,
  Copy,
  Heading,
  Loading,
  Page,
  Panel,
  SignInRequired,
} from "../../store_shell_screen";
import { useOrders } from "../logic/useOrders";
export function OrdersScreen() {
  const { user, ready, orders, loading, page, setPage, last, options, load } =
    useOrders();
  return (
    <Page>
      <Heading>Your orders.</Heading>
      {!ready ? (
        <Loading />
      ) : !user ? (
        <SignInRequired />
      ) : loading ? (
        <Loading />
      ) : (
        <>
          {orders.length === 0 ? (
            <Panel>
              <Copy>No orders yet. Good things are on their way.</Copy>
              <Button title="Refresh orders" secondary onPress={load} />
            </Panel>
          ) : (
            orders.map((order) => (
              <Panel key={order.id}>
                <Copy size={20} bold>
                  Order #{order.id}
                </Copy>
                <Copy muted>
                  {new Date(order.created_at).toLocaleDateString()} ·{" "}
                  {options[order.status] ?? "Unavailable status"} ·{" "}
                  {order.payment_label ?? "Payment details unavailable"}
                </Copy>
                {order.payment?.checkout_url && (
                  <Link href={order.payment.checkout_url}>Pay securely</Link>
                )}
                {order.payment?.invoice_id && (
                  <Copy>Payment reference: {order.payment.invoice_id}</Copy>
                )}
                {order.items.map((item) => (
                  <Copy key={item.product_id}>
                    {item.quantity} × {item.name} —{" "}
                    {money(item.price * item.quantity)}
                  </Copy>
                ))}
                <Copy bold>Total {money(order.total)}</Copy>
                <Copy size={12} muted>
                  Deliver to {order.shipping_address.name},{" "}
                  {order.shipping_address.line1}, {order.shipping_address.city}
                </Copy>
              </Panel>
            ))
          )}
          <Button title="Check payment status" secondary onPress={load} />
          {last > 1 && (
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Button
                secondary
                title="Previous"
                disabled={page === 1}
                onPress={() => setPage((p) => p - 1)}
              />
              <Copy>
                {page} / {last}
              </Copy>
              <Button
                secondary
                title="Next"
                disabled={page === last}
                onPress={() => setPage((p) => p + 1)}
              />
            </View>
          )}
        </>
      )}
    </Page>
  );
}
