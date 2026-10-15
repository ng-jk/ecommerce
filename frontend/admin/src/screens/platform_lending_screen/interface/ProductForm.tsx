import type { LendingProduct } from "@portfolio/api-client";
import { router } from "expo-router";
import {
  PlatformButton,
  PlatformField,
  PlatformText,
} from "../../platform_shell_screen";
import { lendingPath, statusLabel } from "../logic/model";
import { useProductForm } from "../logic/forms";

export function ProductForm({
  organizationId,
  initial,
  options,
}: {
  organizationId: string;
  initial?: LendingProduct;
  options: Record<string, string>;
}) {
  const model = useProductForm(organizationId, options, initial);
  const errors = (key: string) =>
    model.fieldErrors[key]?.map((text, index) => (
      <PlatformText key={`${key}.${index}`}>{text}</PlatformText>
    ));
  return (
    <>
      <PlatformText>Step {model.step + 1} of 3</PlatformText>
      {model.step === 0 && (
        <>
          {!initial && (
            <>
              <PlatformField
                label="Code"
                value={model.code}
                onChangeText={model.setCode}
                autoCapitalize="none"
              />
              {errors("code")}
            </>
          )}
          <PlatformField
            label="Name"
            value={model.name}
            onChangeText={model.setName}
          />
          {errors("name")}
          <PlatformField
            label="Jurisdiction label"
            value={model.jurisdiction}
            onChangeText={model.setJurisdiction}
          />
          {errors("jurisdiction_label")}
          <PlatformField
            label="Terms text"
            value={model.terms}
            onChangeText={model.setTerms}
          />
          {errors("terms_text")}
          {initial && (
            <PlatformButton
              title={`Status: ${statusLabel(options, model.status)}`}
              secondary
              onPress={() => model.cycleStatus(options)}
            />
          )}
        </>
      )}
      {model.step === 1 && (
        <>
          <PlatformField
            label="Currency code"
            value={model.currency}
            onChangeText={model.setCurrency}
            autoCapitalize="characters"
          />
          {errors("currency")}
          <PlatformField
            label="Minor unit digits"
            value={model.digits}
            onChangeText={model.setDigits}
            keyboardType="numeric"
          />
          {errors("minor_unit_digits")}
          <PlatformField
            label="Minimum principal, minor units"
            value={model.minimum}
            onChangeText={model.setMinimum}
            keyboardType="numeric"
          />
          {errors("principal_min_minor")}
          <PlatformField
            label="Maximum principal, minor units"
            value={model.maximum}
            onChangeText={model.setMaximum}
            keyboardType="numeric"
          />
          {errors("principal_max_minor")}
        </>
      )}
      {model.step === 2 && (
        <>
          <PlatformField
            label="Whole-term charge numerator"
            value={model.numerator}
            onChangeText={model.setNumerator}
            keyboardType="numeric"
          />
          {errors("term_rate_numerator")}
          <PlatformField
            label="Whole-term charge denominator"
            value={model.denominator}
            onChangeText={model.setDenominator}
            keyboardType="numeric"
          />
          {errors("term_rate_denominator")}
          <PlatformField
            label="Installments"
            value={model.count}
            onChangeText={model.setCount}
            keyboardType="numeric"
          />
          {errors("installment_count")}
          <PlatformField
            label="Days between installments"
            value={model.interval}
            onChangeText={model.setInterval}
            keyboardType="numeric"
          />
          {errors("interval_days")}
        </>
      )}
      {!!model.message && <PlatformText>{model.message}</PlatformText>}
      {model.step > 0 && (
        <PlatformButton
          title="Previous step"
          secondary
          onPress={() => model.setStep(model.step - 1)}
        />
      )}
      {model.step < 2 ? (
        <PlatformButton
          title="Next step"
          onPress={() => model.setStep(model.step + 1)}
        />
      ) : (
        <PlatformButton
          title={initial ? "Save product" : "Create product"}
          disabled={model.busy}
          onPress={model.save}
        />
      )}
      <PlatformButton
        title="Cancel"
        secondary
        onPress={() =>
          router.replace(lendingPath(organizationId, "products", initial?.id))
        }
      />
    </>
  );
}
