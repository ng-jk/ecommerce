import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  Text,
  View,
  type ScrollView,
  useWindowDimensions,
} from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import {
  money,
  type Address,
  type Order,
  type Product,
} from "@portfolio/api-client";
import { useStore } from "./context";
import {
  Button,
  Copy,
  Field,
  Heading,
  Loading,
  Page,
  Panel,
  SignInRequired,
} from "./ui";
export { StoreProvider, useStore, themes } from "./context";
export { Button, Copy, Field, Heading, Loading, Page, Panel } from "./ui";

export function HomeScreen() {
  const { api, theme, shop, setMessage } = useStore();
  const [products, setProducts] = useState<Product[]>([]),
    [categories, setCategories] = useState<string[]>([]);
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState(""),
    [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1),
    [lastPage, setLastPage] = useState(1),
    [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const collectionY = useRef(0);
  const contentY = useRef(0);
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const data = await api.catalog(search, category, page);
        if (live) {
          setProducts(data.products.data);
          setCategories(data.categories);
          setLastPage(data.products.last_page);
        }
      } catch (e) {
        if (live) {
          setMessage((e as Error).message);
          setFailed(true);
        }
      } finally {
        if (live) setLoading(false);
      }
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [api, search, category, page, retry, setMessage]);
  return (
    <Page
      scrollRef={scrollRef}
      onContentLayout={(y) => {
        contentY.current = y;
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
                  y: contentY.current + collectionY.current,
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
          collectionY.current = event.nativeEvent.layout.y;
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

export function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProductDetail key={id} id={id} />;
}

function ProductDetail({ id }: { id: string }) {
  const { api, theme, user, cart, setCart, run, busy, setMessage } = useStore();
  const [product, setProduct] = useState<Product | null>(null),
    [loading, setLoading] = useState(true);
  const { width } = useWindowDimensions();
  useEffect(() => {
    let live = true;
    api
      .product(id)
      .then((d) => {
        if (live) setProduct(d.product);
      })
      .catch((e) => {
        if (live) {
          setProduct(null);
          setMessage(e.message);
        }
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [id, api, setMessage]);
  const add = () =>
    run(async () => {
      if (!user) {
        router.push("/account");
        setMessage(
          "Sign in, then return to your favourite piece to add it to your bag.",
        );
        return;
      }
      const previous = cart.find((l) => l.product_id === product!.id);
      const lines = cart
        .filter((l) => l.product_id !== product!.id)
        .map((l) => ({ product_id: l.product_id, quantity: l.quantity }));
      await setCart([
        ...lines,
        { product_id: product!.id, quantity: (previous?.quantity || 0) + 1 },
      ]);
      router.push("/cart");
    });
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
              onPress={add}
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

export function AccountScreen() {
  const { user, ready, busy, authenticate, logout, run } = useStore();
  const [register, setRegister] = useState(false),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  return (
    <Page>
      <View
        style={{
          maxWidth: 520,
          width: "100%",
          alignSelf: "center",
          gap: 24,
          paddingVertical: 20,
        }}
      >
        <Heading>
          {user
            ? `Hello, ${user.name.split(" ")[0]}.`
            : register
              ? "Make yourself at home."
              : "Good to see you."}
        </Heading>
        {!ready ? (
          <Loading />
        ) : user ? (
          <Panel>
            <Copy>{user.email}</Copy>
            <Button
              title="View my orders"
              onPress={() => router.push("/orders")}
            />
            <Button
              title="Continue shopping"
              secondary
              onPress={() => router.push("/")}
            />
            <Button
              title="Sign out"
              secondary
              disabled={busy}
              onPress={() => run(logout)}
            />
          </Panel>
        ) : (
          <Panel>
            <Copy muted>
              {register
                ? "Create an account for this shop."
                : "Sign in to your shop account."}
            </Copy>
            {register && (
              <Field
                label="Your name"
                value={name}
                onChangeText={setName}
                autoComplete="name"
              />
            )}
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={register ? "new-password" : "current-password"}
            />
            {register && (
              <Copy size={12} muted>
                Use at least 10 characters.
              </Copy>
            )}
            <Button
              title={
                busy ? "Please wait…" : register ? "Create account" : "Sign in"
              }
              disabled={busy || !email || !password || (register && !name)}
              onPress={() =>
                run(async () => {
                  await authenticate(
                    email,
                    password,
                    register ? name : undefined,
                  );
                  setPassword("");
                  router.replace("/");
                })
              }
            />
            <Button
              secondary
              title={
                register
                  ? "Already a member? Sign in"
                  : "New here? Create account"
              }
              onPress={() => setRegister(!register)}
            />
          </Panel>
        )}
      </View>
    </Page>
  );
}

export function CartScreen() {
  const { user, ready, cart, busy, run, setCart, refreshCart } = useStore();
  useFocusEffect(
    useCallback(() => {
      if (user) void run(refreshCart);
    }, [user, run, refreshCart]),
  );
  const subtotal = cart.reduce(
    (sum, l) => sum + (l.product?.price || 0) * l.quantity,
    0,
  );
  const change = (id: number, quantity: number) =>
    run(() =>
      setCart(
        cart.flatMap((l) =>
          l.product_id !== id
            ? [{ product_id: l.product_id, quantity: l.quantity }]
            : quantity
              ? [{ product_id: id, quantity }]
              : [],
        ),
      ),
    );
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
                      onPress={() => change(line.product_id, line.quantity - 1)}
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
                      onPress={() => change(line.product_id, line.quantity + 1)}
                    />
                    <Button
                      secondary
                      title="Remove"
                      disabled={busy}
                      onPress={() => change(line.product_id, 0)}
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

export function CheckoutScreen() {
  const { user, ready, cart, api, shop, busy, run, refreshCart } = useStore();
  const [address, setAddress] = useState<Address>({
    name: "",
    line1: "",
    city: "",
    postcode: "",
    country: "MY",
  });
  const key = useRef<string | null>(null);
  const submit = () =>
    run(async () => {
      const storageKey = `portfolio.${shop}.${user!.id}.checkout`;
      if (!key.current) {
        key.current =
          Platform.OS === "web"
            ? window.sessionStorage.getItem(storageKey)
            : await SecureStore.getItemAsync(storageKey);
        if (!key.current) {
          key.current = Crypto.randomUUID();
          if (Platform.OS === "web")
            window.sessionStorage.setItem(storageKey, key.current);
          else await SecureStore.setItemAsync(storageKey, key.current);
        }
      }
      await api.checkout(key.current, address);
      if (Platform.OS === "web") window.sessionStorage.removeItem(storageKey);
      else await SecureStore.deleteItemAsync(storageKey);
      key.current = null;
      await refreshCart();
      router.replace("/orders");
    });
  const subtotal = cart.reduce(
    (sum, l) => sum + (l.product?.price || 0) * l.quantity,
    0,
  );
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
              onPress={submit}
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

export function OrdersScreen() {
  const { user, ready, api, run } = useStore();
  const [orders, setOrders] = useState<Order[]>([]),
    [loading, setLoading] = useState(true),
    [page, setPage] = useState(1),
    [last, setLast] = useState(1);
  const load = useCallback(() => {
    if (user) {
      setLoading(true);
      void run(async () => {
        const data = await api.orders(page);
        setOrders(data.orders.data);
        setLast(data.orders.last_page);
      }).finally(() => setLoading(false));
    }
  }, [user, api, page, run]);
  useFocusEffect(load);
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
                  {order.status.toUpperCase()} · SIMULATED PAYMENT
                </Copy>
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
