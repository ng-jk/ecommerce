import { money } from "@portfolio/api-client";
import { View } from "react-native";
import {
Button,
Copy,
Field,
Heading,
Loading,
Page,
Panel,
SignInRequired,
} from "../components/ui";
import { useCheckout } from "../view-models/useCheckout";
export function CheckoutScreen() {
  const { user, ready, cart, busy, address, setAddress, submit, subtotal } =
    useCheckout();
  return (
    <Page>
      <Heading>The final little details.</Heading>
      {!ready ? (
        <Loading />
      ) : !user ? (
        <SignInRequired />
      ) : (
        <View style={{ maxWidth: 620, width: "100%", alignSelf: "center" }}>
          <Panel>
            <Copy bold>Shipping address</Copy>
            {(
              [
                ["name", "Full name"],
                ["line1", "Street address"],
                ["city", "City"],
                ["postcode", "Postcode"],
              ] as const
            ).map(([k, label]) => (
              <Field
                key={k}
                label={label}
                value={address[k]}
                onChangeText={(v) => setAddress((a) => ({ ...a, [k]: v }))}
              />
            ))}
            <Copy muted>Country: Malaysia</Copy>
            <Copy size={22}>
              Total: {money(subtotal + (cart.length ? 800 : 0))}
            </Copy>
            <Copy size={13} muted>
              This is a simulated checkout. No payment is taken. The server
              confirms current prices and stock when you place the order.
            </Copy>
            <Button
              title={busy ? "Placing order…" : "Place demo order"}
              disabled={
                busy ||
                !address.name ||
                !address.line1 ||
                !address.city ||
                !address.postcode
              }
              onPress={() => void submit()}
            />
            {!cart.length && (
              <Copy size={12} muted>
                Your bag is empty. If a previous request was interrupted, you
                can retry here to retrieve its order.
              </Copy>
            )}
          </Panel>
        </View>
      )}
    </Page>
  );
}
