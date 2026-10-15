import type { LendingApplication, LendingProduct } from "@portfolio/api-client";
import { router } from "expo-router";
import { useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { lendingPath, nextOption, numericInput } from "./model";
import { useLendingAction } from "./actions";

export function useProductForm(
  organizationId: string,
  options: Record<string, string>,
  initial?: LendingProduct,
) {
  const { api } = usePlatformSession();
  const action = useLendingAction(organizationId);
  const [step, setStep] = useState(0);
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [jurisdiction, setJurisdiction] = useState(
    initial?.jurisdiction_label ?? "",
  );
  const [terms, setTerms] = useState(initial?.terms_text ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "");
  const [digits, setDigits] = useState(
    String(initial?.minor_unit_digits ?? ""),
  );
  const [minimum, setMinimum] = useState(
    String(initial?.principal_min_minor ?? ""),
  );
  const [maximum, setMaximum] = useState(
    String(initial?.principal_max_minor ?? ""),
  );
  const [numerator, setNumerator] = useState(
    String(initial?.term_rate_numerator ?? ""),
  );
  const [denominator, setDenominator] = useState(
    String(initial?.term_rate_denominator ?? ""),
  );
  const [count, setCount] = useState(String(initial?.installment_count ?? ""));
  const [interval, setInterval] = useState(
    String(initial?.interval_days ?? ""),
  );
  const [status, setStatus] = useState(
    initial?.status ?? Object.keys(options)[0] ?? "",
  );
  const save = () => {
    const fields = {
      name,
      jurisdiction_label: jurisdiction,
      terms_text: terms,
      currency,
      minor_unit_digits: numericInput(digits),
      principal_min_minor: numericInput(minimum),
      principal_max_minor: numericInput(maximum),
      term_rate_numerator: numericInput(numerator),
      term_rate_denominator: numericInput(denominator),
      installment_count: numericInput(count),
      interval_days: numericInput(interval),
    };
    void action.run(async () => {
      const result = initial
        ? await api.lending.updateProduct(organizationId, initial.id, {
            ...fields,
            expected_version: initial.version,
            status,
          })
        : await api.lending.createProduct(organizationId, { ...fields, code });
      router.replace(
        lendingPath(organizationId, "products", result.product.id),
      );
    });
  };
  return {
    step,
    setStep,
    code,
    setCode,
    name,
    setName,
    jurisdiction,
    setJurisdiction,
    terms,
    setTerms,
    currency,
    setCurrency,
    digits,
    setDigits,
    minimum,
    setMinimum,
    maximum,
    setMaximum,
    numerator,
    setNumerator,
    denominator,
    setDenominator,
    count,
    setCount,
    interval,
    setInterval,
    status,
    cycleStatus: (options: Record<string, string>) =>
      setStatus(nextOption(options, status)),
    save,
    ...action,
  };
}

export function useApplicationForm(
  organizationId: string,
  initial?: LendingApplication,
  selectedProductId?: string,
) {
  const { api } = usePlatformSession();
  const action = useLendingAction(organizationId);
  const [productId, setProductId] = useState(
    selectedProductId ?? String(initial?.product_id ?? ""),
  );
  const [principal, setPrincipal] = useState(
    String(initial?.principal_minor ?? ""),
  );
  const [date, setDate] = useState(initial?.first_due_date ?? "");
  const [purpose, setPurpose] = useState(initial?.purpose ?? "");
  const save = () =>
    void action.run(async () => {
      const fields = {
        principal_minor: numericInput(principal),
        first_due_date: date,
        purpose,
      };
      const result = initial
        ? await api.lending.updateApplication(organizationId, initial.id, {
            ...fields,
            expected_version: initial.version,
          })
        : await api.lending.createApplication(organizationId, {
            ...fields,
            product_id: numericInput(productId),
          });
      router.replace(
        lendingPath(organizationId, "applications", result.application.id),
      );
    });
  return {
    productId,
    setProductId,
    principal,
    setPrincipal,
    date,
    setDate,
    purpose,
    setPurpose,
    save,
    ...action,
  };
}
