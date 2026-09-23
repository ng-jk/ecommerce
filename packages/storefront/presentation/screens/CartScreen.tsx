import { money } from "@portfolio/api-client";
import { router } from "expo-router";
import { Image,View } from "react-native";
import {
Button,
Copy,
Heading,
Loading,
Page,
Panel,
SignInRequired,
} from "../components/ui";
import { useCart } from "../view-models/useCart";
export function CartScreen() {
  const { user, ready, cart, busy, subtotal, change } = useCart();
  return (
    <Page>
      <Heading>Your bag.</Heading>
      {!ready ? (
        <Loading />
      ) : !user ? (
        <SignInRequired />
      ) : !cart.length ? (
        <Panel>
          <Copy>Your next favourite is waiting to be discovered.</Copy>
          <Button
            title="Explore the collection"
            onPress={() => router.push("/")}
          />
        </Panel>
      ) : (
        <>
          {cart.map((line) => (
            <Panel key={line.product_id}>
              <View style={{ flexDirection: "row", gap: 18 }}>
                <Image
                  source={{ uri: line.product?.image_url }}
                  style={{ width: 90, height: 110, borderRadius: 6 }}
                />
                <View style={{ flex: 1, gap: 12 }}>
                  <Copy bold>
                    {line.product?.name || "Unavailable product"}
                  </Copy>
                  <Copy>{money(line.product?.price || 0)}</Copy>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: 12,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <Button
                      secondary
                      title="−"
                      disabled={busy}
                      onPress={() =>
                        void change(line.product_id, line.quantity - 1)
                      }
                    />
                    <Copy>{line.quantity}</Copy>
                    <Button
                      secondary
                      title="+"
                      disabled={
                        busy ||
                        line.quantity >= (line.product?.stock || 0) ||
                        line.quantity >= 99
                      }
                      onPress={() =>
                        void change(line.product_id, line.quantity + 1)
                      }
                    />
                    <Button
                      secondary
                      title="Remove"
                      disabled={busy}
                      onPress={() => void change(line.product_id, 0)}
                    />
                  </View>
                </View>
              </View>
            </Panel>
          ))}
          <View style={{ maxWidth: 480, width: "100%", alignSelf: "flex-end" }}>
            <Panel>
              <Copy>Subtotal: {money(subtotal)}</Copy>
              <Copy muted>Delivery: RM 8.00</Copy>
              <Copy size={23} bold>
                Total: {money(subtotal + 800)}
              </Copy>
              <Button
                title="Continue to checkout"
                disabled={busy}
                onPress={() => router.push("/checkout")}
              />
            </Panel>
          </View>
        </>
      )}
    </Page>
  );
}
