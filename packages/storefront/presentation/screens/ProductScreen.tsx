import { money } from "@portfolio/api-client";
import { router,useLocalSearchParams } from "expo-router";
import { Image,Pressable,View } from "react-native";
import { Button,Copy,Heading,Loading,Page,Panel } from "../components/ui";
import { useProduct } from "../view-models/useProduct";
export function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductDetail key={id} id={id} />;
}

function ProductDetail({ id }: { id: string }) {
  const { theme, product, loading, width, busy, add } = useProduct(id);
  return (
    <Page>
      <Pressable accessibilityRole="link" onPress={() => router.push("/")}>
        <Copy muted>← Back to the collection</Copy>
      </Pressable>
      {loading ? (
        <Loading />
      ) : !product ? (
        <Panel>
          <Heading>Piece not found.</Heading>
          <Copy>This product may no longer be available.</Copy>
        </Panel>
      ) : (
        <View
          style={{ flexDirection: width >= 760 ? "row" : "column", gap: 40 }}
        >
          <Image
            source={{ uri: product.image_url }}
            accessibilityLabel={product.name}
            style={{
              flex: width >= 760 ? 1 : undefined,
              width: width < 760 ? "100%" : undefined,
              height: width >= 760 ? 550 : 340,
              borderRadius: 12,
              backgroundColor: theme.soft,
            }}
          />
          <View style={{ flex: 1, gap: 24, paddingVertical: 20 }}>
            <Copy size={12} muted>
              {product.category.toUpperCase()}
            </Copy>
            <Heading>{product.name}</Heading>
            <Copy size={26}>{money(product.price)}</Copy>
            <Copy muted>{product.description}</Copy>
            <Copy size={13}>
              {product.stock > 0
                ? `${product.stock} available · Ready to find a new home`
                : "Currently sold out"}
            </Copy>
            <Button
              title={product.stock ? "Add to bag" : "Sold out"}
              disabled={busy || !product.stock}
              onPress={() => void add()}
            />
            <Copy size={12} muted>
              Flat RM 8 delivery within Malaysia. Demo checkout only.
            </Copy>
            <View
              style={{
                gap: 12,
                borderTopWidth: 1,
                borderColor: theme.line,
                paddingTop: 24,
              }}
            >
              <Copy bold>The details</Copy>
              {Object.entries(product.specifications || {}).map(([k, v]) => (
                <View
                  key={k}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 20,
                  }}
                >
                  <Copy muted>{k}</Copy>
                  <Copy>{v}</Copy>
                </View>
              ))}
            </View>
          </View>
        </View>
      )}
    </Page>
  );
}
