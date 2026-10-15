import type { ErpJournal } from "@portfolio/api-client";
import { router } from "expo-router";
import {
  PlatformButton,
  PlatformField,
  PlatformText,
} from "../../platform_shell_screen";
import { erpPath } from "../logic/model";
import { useErpJournalForm } from "../logic/useErpJournalForm";

export function ErpJournalForm({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial?: ErpJournal;
}) {
  const model = useErpJournalForm(organizationId, initial);
  const errors = (field: string) =>
    model.fieldErrors[field]?.map((message, index) => (
      <PlatformText key={`${field}.${index}`}>{message}</PlatformText>
    ));
  return (
    <>
      <PlatformText>
        Effective date:{" "}
        {initial?.effective_date ?? new Date().toISOString().slice(0, 10)} UTC
      </PlatformText>
      <PlatformField
        label="Description"
        value={model.description}
        onChangeText={model.setDescription}
      />
      {errors("description")}
      <PlatformField
        label="Currency (3 letters)"
        value={model.currency}
        onChangeText={model.setCurrency}
        autoCapitalize="characters"
      />
      {errors("currency")}
      <PlatformField
        label="Debit account ID"
        value={model.debitAccountId}
        onChangeText={model.setDebitAccountId}
        keyboardType="number-pad"
      />
      <PlatformField
        label="Credit account ID"
        value={model.creditAccountId}
        onChangeText={model.setCreditAccountId}
        keyboardType="number-pad"
      />
      <PlatformField
        label="Amount (minor units)"
        value={model.amount}
        onChangeText={model.setAmount}
        keyboardType="number-pad"
      />
      {errors("lines")}
      {errors("effective_date")}
      {errors("expected_version")}
      {!!model.message && <PlatformText>{model.message}</PlatformText>}
      <PlatformButton
        title={initial ? "Save draft" : "Create draft"}
        disabled={model.busy}
        onPress={() => void model.save()}
      />
      <PlatformButton
        title="Cancel"
        secondary
        onPress={() =>
          router.replace(erpPath(organizationId, "journals", initial?.id))
        }
      />
    </>
  );
}
