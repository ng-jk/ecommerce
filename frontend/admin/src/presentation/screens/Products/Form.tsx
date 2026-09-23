import type { Product } from "@portfolio/api-client/domain/types";
import { Button, Copy, Field } from "@portfolio/storefront";
import { router } from "expo-router";
import { useProductForm } from "../../view-models/useProductForm";
export function Form({
  initial,
  options,
}: {
  initial: Partial<Product>;
  options: Record<string, string>;
}) {
  const {
    draft,
    step,
    setStep,
    price,
    setPrice,
    stock,
    setStock,
    specs,
    setSpecs,
    set,
    busy,
    save,
    remove,
    setVisibility,
  } = useProductForm(initial);
  return step === 0 ? (
    <>
      <Field
        label="Name"
        value={draft.name ?? ""}
        onChangeText={(value) => set("name", value)}
      />
      <Field
        label="Category"
        value={draft.category ?? ""}
        onChangeText={(value) => set("category", value)}
      />
      <Field
        label="Description"
        value={draft.description ?? ""}
        onChangeText={(value) => set("description", value)}
      />
      <Field
        label="Image URL"
        value={draft.image_url ?? ""}
        onChangeText={(value) => set("image_url", value)}
      />
      <Button title="Next: price and inventory" onPress={() => setStep(1)} />
      {draft.id !== undefined && (
        <Button
          title="Delete product"
          disabled={busy}
          onPress={() => {
            void remove();
          }}
        />
      )}
      <Button title="Cancel" onPress={() => router.replace("/products")} />
    </>
  ) : (
    <>
      <Field label="Price (MYR)" value={price} onChangeText={setPrice} />
      <Field label="Stock" value={stock} onChangeText={setStock} />
      <Field
        label="Specifications (Label: Value)"
        value={specs}
        onChangeText={setSpecs}
        multiline
      />
      <Copy>Visibility</Copy>
      {Object.entries(options).map(([value, label]) => (
        <Button
          key={value}
          title={label}
          secondary={Boolean(draft.active) !== (value === "1")}
          onPress={() => setVisibility(value)}
        />
      ))}
      <Button
        title="Save product"
        disabled={busy}
        onPress={() => {
          void save();
        }}
      />
      <Button title="Previous: product details" onPress={() => setStep(0)} />
    </>
  );
}
