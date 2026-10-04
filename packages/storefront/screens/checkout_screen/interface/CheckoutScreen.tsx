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
} from "../../store_shell_screen";
import { useCheckout } from "../logic/useCheckout";
import { nextChoice } from "../../../services/assistant";
export function CheckoutScreen() {
  const {
    user,
    ready,
    cart,
    busy,
    address,
    setAddress,
    submit,
    subtotal,
    paymentMethods,
    paymentMethod,
    setPaymentMethod,
  } = useCheckout();
  const paymentKeys = Object.keys(paymentMethods ?? {});
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
            {paymentMethods !== undefined && paymentKeys.length === 0 && (
              <Copy>
                Payment is currently unavailable. Try again after the merchant
                configures a payment method.
              </Copy>
            )}
            {paymentKeys.length > 0 && (
              <Button
                title={`Payment: ${paymentMethods[paymentMethod] ?? "Choose an available method"}`}
                disabled={busy}
                onPress={() =>
                  setPaymentMethod(nextChoice(paymentKeys, paymentMethod))
                }
              />
            )}
            <Copy size={22}>
              Total: {money(subtotal + (cart.length ? 800 : 0))}
            </Copy>
            <Copy size={13} muted>
              We confirm current prices and stock when you place the order.
              Payment instructions and status appear on your orders page.
            </Copy>
            <Button
              title={busy ? "Placing order…" : "Place order"}
              disabled={
                busy ||
                (paymentMethods !== undefined && paymentKeys.length === 0) ||
                (paymentKeys.length > 0 && !paymentMethods[paymentMethod]) ||
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
