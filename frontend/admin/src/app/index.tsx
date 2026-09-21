import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  StoreProvider,
  useStore,
  Button,
  Copy,
  Field,
  Heading,
  Loading,
  Panel,
} from "@portfolio/storefront";
import {
  money,
  type Product,
  type Order,
  type ShopSlug,
} from "@portfolio/api-client";

export default function Admin() {
  const [shop, setShop] = useState<ShopSlug>("fashion");
  return (
    <StoreProvider key={shop} shop={shop}>
      <Dashboard shop={shop} switchShop={setShop} />
    </StoreProvider>
  );
}
function Dashboard({
  shop,
  switchShop,
}: {
  shop: ShopSlug;
  switchShop: (s: ShopSlug) => void;
}) {
  const {
    theme,
    user,
    ready,
    api,
    run,
    busy,
    authenticate,
    logout,
    message,
    setMessage,
  } = useStore();
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const [products, setProducts] = useState<Product[]>([]),
    [orders, setOrders] = useState<Order[]>([]);
  const [tab, setTab] = useState<"products" | "orders">("products");
  const [page, setPage] = useState(1),
    [last, setLast] = useState(1),
    [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);
  const [price, setPrice] = useState(""),
    [stock, setStock] = useState(""),
    [specs, setSpecs] = useState("");
  const load = useCallback(async () => {
    if (tab === "products") {
      const d = await api.adminProducts(page);
      setProducts(d.products.data);
      setLast(d.products.last_page);
      setTotal(d.products.total);
    } else {
      const d = await api.adminOrders(page);
      setOrders(d.orders.data);
      setLast(d.orders.last_page);
      setTotal(d.orders.total);
    }
  }, [api, page, tab]);
  useEffect(() => {
    if (user?.role === "admin") void run(load);
  }, [user?.id, user?.role, run, load]);
  const edit = (p: Partial<Product>) => {
    setEditing(p);
    setPrice(p.price !== undefined ? String(p.price / 100) : "");
    setStock(String(p.stock ?? 0));
    setSpecs(
      Object.entries(p.specifications || {})
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n"),
    );
  };
  const save = () =>
    run(async () => {
      if (!/^\d+(\.\d{1,2})?$/.test(price) || !/^\d+$/.test(stock))
        throw new Error(
          "Enter a valid MYR price (up to two decimals) and whole-number stock.",
        );
      const specifications: Record<string, string> = {};
      for (const line of specs.split("\n").filter((l) => l.trim())) {
        const colon = line.indexOf(":");
        if (colon < 1 || !line.slice(colon + 1).trim())
          throw new Error("Write each specification as Label: Value.");
        specifications[line.slice(0, colon).trim()] = line
          .slice(colon + 1)
          .trim();
      }
      await api.saveProduct({
        ...editing,
        price: Math.round(Number(price) * 100),
        stock: Number(stock),
        specifications,
      });
      setEditing(null);
      await load();
      setMessage("Product saved.");
    });
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 28,
          gap: 26,
          maxWidth: 1200,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <View>
            <Text
              style={{
                color: theme.accent,
                fontWeight: "700",
                fontSize: 12,
                letterSpacing: 2,
              }}
            >
              COMMERCE STUDIO
            </Text>
            <Heading>Your shop, in focus.</Heading>
          </View>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              title="Maison"
              secondary={shop !== "fashion"}
              disabled={busy}
              onPress={() =>
                run(async () => {
                  if (user) await logout();
                  switchShop("fashion");
                })
              }
            />
            <Button
              title="Volt"
              secondary={shop !== "electronics"}
              disabled={busy}
              onPress={() =>
                run(async () => {
                  if (user) await logout();
                  switchShop("electronics");
                })
              }
            />
          </View>
        </View>
        {!!message && (
          <Panel>
            <View accessibilityRole="alert">
              <Copy>{message}</Copy>
            </View>
            <Button secondary title="Dismiss" onPress={() => setMessage("")} />
          </Panel>
        )}
        {!ready ? (
          <Loading />
        ) : !user ? (
          <View style={{ maxWidth: 480, width: "100%", alignSelf: "center" }}>
            <Panel>
              <Heading>Admin sign in</Heading>
              <Copy muted>
                Use the administrator account for{" "}
                {shop === "fashion" ? "Maison" : "Volt"}.
              </Copy>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              <Button
                title="Sign in"
                disabled={busy || !email || !password}
                onPress={() =>
                  run(async () => {
                    await authenticate(email, password);
                    setPassword("");
                  })
                }
              />
            </Panel>
          </View>
        ) : user.role !== "admin" ? (
          <Panel>
            <Copy>This account does not have shop management access.</Copy>
            <Button title="Sign out" onPress={() => run(logout)} />
          </Panel>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
              <Button
                title="Products"
                secondary={tab !== "products"}
                onPress={() => {
                  setTab("products");
                  setPage(1);
                  setEditing(null);
                }}
              />
              <Button
                title="Orders"
                secondary={tab !== "orders"}
                onPress={() => {
                  setTab("orders");
                  setPage(1);
                  setEditing(null);
                }}
              />
              <Button
                title="Refresh"
                secondary
                disabled={busy}
                onPress={() => run(load)}
              />
              <Button
                title="Sign out"
                secondary
                disabled={busy}
                onPress={() => run(logout)}
              />
            </View>
            <Copy muted>
              {total} {tab} · Access limited to{" "}
              {shop === "fashion" ? "Maison" : "Volt"}
            </Copy>
            {tab === "products" && (
              <Button
                title="Add product"
                disabled={busy}
                onPress={() =>
                  edit({
                    active: true,
                    name: "",
                    category: "",
                    description: "",
                    image_url: "",
                  })
                }
              />
            )}
            {editing && (
              <Panel>
                <Heading>{editing.id ? "Edit product" : "New product"}</Heading>
                {(
                  ["name", "category", "description", "image_url"] as const
                ).map((k) => (
                  <Field
                    key={k}
                    label={
                      {
                        name: "Product name",
                        category: "Category",
                        description: "Description",
                        image_url: "Image URL (HTTPS)",
                      }[k]
                    }
                    value={editing[k] || ""}
                    multiline={k === "description"}
                    onChangeText={(v) => setEditing((p) => ({ ...p, [k]: v }))}
                  />
                ))}
                <Field
                  label="Price (MYR)"
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="Stock"
                  value={stock}
                  onChangeText={setStock}
                  keyboardType="number-pad"
                />
                <Field
                  label="Specifications (one Label: Value per line)"
                  value={specs}
                  onChangeText={setSpecs}
                  multiline
                />
                <Button
                  title={
                    editing.active
                      ? "Visible in shop — click to hide"
                      : "Hidden — click to publish"
                  }
                  secondary
                  onPress={() =>
                    setEditing((p) => ({ ...p, active: !p?.active }))
                  }
                />
                <Button title="Save product" disabled={busy} onPress={save} />
                <Button
                  title="Cancel editing"
                  secondary
                  onPress={() => setEditing(null)}
                />
              </Panel>
            )}
            {tab === "products" ? (
              products.map((p) => (
                <Panel key={p.id}>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 15,
                    }}
                  >
                    <View style={{ gap: 6 }}>
                      <Copy bold size={18}>
                        {p.name}
                      </Copy>
                      <Copy muted>
                        {p.category} · {money(p.price)} · {p.stock} in stock ·{" "}
                        {p.active ? "Published" : "Hidden"}
                      </Copy>
                    </View>
                    <Button
                      title={`Edit ${p.name}`}
                      secondary
                      disabled={busy}
                      onPress={() => edit(p)}
                    />
                  </View>
                </Panel>
              ))
            ) : orders.length === 0 ? (
              <Panel>
                <Copy>No orders yet.</Copy>
              </Panel>
            ) : (
              orders.map((order) => (
                <Panel key={order.id}>
                  <Copy bold size={20}>
                    Order #{order.id} · {money(order.total)}
                  </Copy>
                  <Copy muted>
                    {order.status.toUpperCase()} ·{" "}
                    {new Date(order.created_at).toLocaleString()} · Simulated
                    payment
                  </Copy>
                  {order.items.map((item) => (
                    <Copy key={item.product_id}>
                      {item.quantity} × {item.name}
                    </Copy>
                  ))}
                  <Copy muted>
                    {order.shipping_address.name} ·{" "}
                    {order.shipping_address.line1},{" "}
                    {order.shipping_address.city},{" "}
                    {order.shipping_address.postcode}
                  </Copy>
                  {order.status !== "completed" && (
                    <Button
                      title={`Mark ${{ placed: "processing", processing: "shipped", shipped: "completed", completed: "completed" }[order.status]}`}
                      disabled={busy}
                      onPress={() =>
                        run(async () => {
                          await api.advanceOrder(
                            order.id,
                            {
                              placed: "processing",
                              processing: "shipped",
                              shipped: "completed",
                              completed: "completed",
                            }[order.status] as string,
                          );
                          await load();
                        })
                      }
                    />
                  )}
                </Panel>
              ))
            )}
            {last > 1 && (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Button
                  secondary
                  title="Previous"
                  disabled={busy || page === 1}
                  onPress={() => setPage((p) => p - 1)}
                />
                <Copy>
                  {page} / {last}
                </Copy>
                <Button
                  secondary
                  title="Next"
                  disabled={busy || page === last}
                  onPress={() => setPage((p) => p + 1)}
                />
              </View>
            )}
          </>
        )}
        <Copy size={12} muted>
          Portfolio administration · Each account belongs to one shop. Switch
          shops to sign in with its administrator.
        </Copy>
      </ScrollView>
    </SafeAreaView>
  );
}
