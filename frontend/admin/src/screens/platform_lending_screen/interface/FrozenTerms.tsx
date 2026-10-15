import type { LendingTermsSnapshot } from "@portfolio/api-client";
import { PlatformText } from "../../platform_shell_screen";

export function FrozenTerms({
  terms,
}: {
  terms: LendingTermsSnapshot | null | undefined;
}) {
  if (!terms) return null;
  return (
    <>
      <PlatformText>
        Submitted terms · product version {terms.product_version}
      </PlatformText>
      <PlatformText>
        Jurisdiction: {terms.jurisdiction_label}; currency: {terms.currency} (
        {terms.minor_unit_digits} minor digits).
      </PlatformText>
      <PlatformText>{terms.terms_text}</PlatformText>
      <PlatformText>
        Flat whole-term rate: {terms.term_rate_numerator}/
        {terms.term_rate_denominator}; {terms.installment_count} installments
        every {terms.interval_days} days.
      </PlatformText>
      <PlatformText>
        Frozen principal: {terms.principal_minor} minor units; first due{" "}
        {terms.first_due_date}.
      </PlatformText>
    </>
  );
}
