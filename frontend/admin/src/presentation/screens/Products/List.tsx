import { money } from "@portfolio/api-client/domain/types";
import { Button, Copy, Field, Panel } from "@portfolio/storefront";
import { router } from "expo-router";
import { AdminPage } from "../../components/AdminPage";
import { useProducts } from "../../view-models/useProducts";
export default function Products() {
  const { user, items, page, setPage, last, category, setCategory } =
    useProducts();
  return (
    <AdminPage title="Products">
      <Button title="Dashboard" onPress={() => router.replace("/")} />
      {user?.role === "admin" ? (
        <>
          <Button
            title="Add product"
            onPress={() => router.push("/products/create")}
          />
          <Field
            label="Filter by category"
            value={category}
            onChangeText={(value) => {
              setCategory(value);
              setPage(1);
            }}
          />
          {items.map((item) => (
            <Panel key={item.id}>
              <Copy>
                {item.name} · {money(item.price)} · {item.stock} in stock
              </Copy>
              <Button
                title={`Edit ${item.name}`}
                onPress={() => router.push(`/products/${item.id}/edit`)}
              />
            </Panel>
          ))}
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
        </>
      ) : (
        <Copy>Sign in with an administrator account.</Copy>
      )}
    </AdminPage>
  );
}
