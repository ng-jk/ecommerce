import { money } from "@portfolio/api-client";
import { router } from "expo-router";
import { Image, Platform, Pressable, Text, View } from "react-native";
import {
  Button,
  Copy,
  Field,
  Heading,
  Loading,
  Page,
  Panel,
} from "../../store_shell_screen";
import { useHome } from "../logic/useHome";
export function HomeScreen() {
  const {
    products,
    categories,
    search,
    setSearch,
    category,
    setCategory,
    loading,
    page,
    setPage,
    lastPage,
    setRetry,
    failed,
    scrollRef,
    collectionYRef,
    contentYRef,
    wide,
    width,
    theme,
    shop,
  } = useHome();
  return (
    <Page
      scrollRef={scrollRef}
      onContentLayout={(y) => {
        contentYRef.current = y;
      }}
    >
      <View
        style={{
          backgroundColor: theme.hero,
          borderRadius: shop === "fashion" ? 3 : 24,
          overflow: "hidden",
          flexDirection: wide ? "row" : "column",
          minHeight: wide ? 410 : undefined,
        }}
      >
        <View
          style={{
            flex: 1,
            padding: wide ? 44 : 28,
            gap: 22,
            justifyContent: "center",
          }}
        >
          <Copy size={11} bold>
            {theme.eyebrow}
          </Copy>
          <Text
            accessibilityRole="header"
            style={{
              color: theme.ink,
              fontSize: wide ? 64 : 44,
              lineHeight: wide ? 69 : 49,
              letterSpacing: -2,
              fontWeight: shop === "fashion" ? "400" : "800",
              fontFamily:
                shop === "fashion" && Platform.OS === "web"
                  ? "Georgia, serif"
                  : undefined,
            }}
          >
            {theme.title}
          </Text>
          <Copy muted>{theme.subtitle}</Copy>
          <View style={{ alignSelf: "flex-start" }}>
            <Button
              title="Explore the collection ↓"
              onPress={() => {
                setCategory("");
                setSearch("");
                scrollRef.current?.scrollTo({
                  y: contentYRef.current + collectionYRef.current,
                  animated: true,
                });
              }}
            />
          </View>
        </View>
        <Image
          accessibilityLabel={
            shop === "fashion"
              ? "New season fashion collection"
              : "Studio audio collection"
          }
          source={{ uri: theme.image }}
          style={{ width: wide ? "45%" : "100%", height: wide ? 410 : 230 }}
          resizeMode="cover"
        />
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 14,
          paddingVertical: 8,
          flexWrap: "wrap",
        }}
      >
        {[
          "01 / Thoughtfully selected",
          "02 / RM 8 delivery",
          "03 / Made for your everyday",
        ].map((t) => (
          <Copy key={t} size={12} muted>
            {t}
          </Copy>
        ))}
      </View>
      <View
        nativeID="collection"
        onLayout={(event) => {
          collectionYRef.current = event.nativeEvent.layout.y;
        }}
        style={{ gap: 22 }}
      >
        <View
          style={{
            flexDirection: wide ? "row" : "column",
            justifyContent: "space-between",
            gap: 20,
            alignItems: wide ? "center" : "stretch",
          }}
        >
          <Heading>{theme.collection}</Heading>
          <View style={{ width: wide ? 290 : "100%" }}>
            <Field
              label="Search products"
              value={search}
              onChangeText={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Find your next favourite"
            />
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {["", ...categories].map((c) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: category === c }}
              key={c}
              onPress={() => {
                setCategory(c);
                setPage(1);
              }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 19,
                borderRadius: 24,
                backgroundColor: category === c ? theme.accent : "transparent",
                borderWidth: 1,
                borderColor: category === c ? theme.accent : theme.line,
              }}
            >
              <Text
                style={{
                  color:
                    category === c
                      ? shop === "fashion"
                        ? "#fff"
                        : "#162113"
                      : theme.ink,
                  fontSize: 13,
                }}
              >
                {c || "All pieces"}
              </Text>
            </Pressable>
          ))}
        </View>
        {loading ? (
          <Loading />
        ) : failed ? (
          <Panel>
            <Copy>We couldn’t load the collection.</Copy>
            <Button title="Try again" onPress={() => setRetry((r) => r + 1)} />
          </Panel>
        ) : products.length === 0 ? (
          <Panel>
            <Copy>No products match your search.</Copy>
            <Button
              secondary
              title="Clear filters"
              onPress={() => {
                setSearch("");
                setCategory("");
              }}
            />
          </Panel>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
            {products.map((product) => (
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`View ${product.name}`}
                key={product.id}
                onPress={() => router.push(`/product/${product.id}`)}
                style={({ pressed }) => ({
                  width: wide ? "31.9%" : width > 440 ? "47%" : "100%",
                  flexGrow: 1,
                  maxWidth: wide ? "33%" : undefined,
                  backgroundColor: theme.surface,
                  borderRadius: shop === "fashion" ? 3 : 16,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: pressed ? theme.accent : theme.line,
                })}
              >
                <View style={{ backgroundColor: theme.soft }}>
                  <Image
                    source={{ uri: product.image_url }}
                    style={{ width: "100%", height: wide ? 260 : 250 }}
                    resizeMode="cover"
                  />
                  <View
                    style={{
                      position: "absolute",
                      top: 14,
                      left: 14,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      backgroundColor: theme.surface,
                      borderRadius: 3,
                    }}
                  >
                    <Copy size={10} bold>
                      {product.stock
                        ? product.category.toUpperCase()
                        : "SOLD OUT"}
                    </Copy>
                  </View>
                </View>
                <View style={{ padding: 20, gap: 9 }}>
                  <Copy size={17} bold>
                    {product.name}
                  </Copy>
                  {shop === "electronics" && (
                    <Copy size={12} muted>
                      {Object.values(product.specifications || {})
                        .slice(0, 2)
                        .join(" · ")}
                    </Copy>
                  )}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <Copy size={15}>{money(product.price)}</Copy>
                    <Copy muted>↗</Copy>
                  </View>
                </View>
              </Pressable>
            ))}
          </View>
        )}
        {lastPage > 1 && (
          <View style={{ flexDirection: "row", gap: 15, alignItems: "center" }}>
            <Button
              title="Previous"
              secondary
              disabled={page === 1}
              onPress={() => setPage((p) => p - 1)}
            />
            <Copy>
              {page} / {lastPage}
            </Copy>
            <Button
              title="Next"
              secondary
              disabled={page === lastPage}
              onPress={() => setPage((p) => p + 1)}
            />
          </View>
        )}
      </View>
      <Panel>
        <Copy size={11} muted>
          GOOD THINGS, CHOSEN WELL.
        </Copy>
        <Heading>
          {shop === "fashion"
            ? "A wardrobe with a little more meaning."
            : "Less noise. Better technology."}
        </Heading>
        <Copy muted>
          {shop === "fashion"
            ? "We believe everyday essentials deserve the same care as your favourite occasion. Discover a smaller, more thoughtful collection."
            : "From your workspace to your weekend, our collection brings together useful tools with thoughtful design."}
        </Copy>
      </Panel>
    </Page>
  );
}
