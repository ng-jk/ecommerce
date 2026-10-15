import type { CrmCompany } from "@portfolio/api-client";
import { router } from "expo-router";
import {
  PlatformButton,
  PlatformField,
  PlatformText,
} from "../../platform_shell_screen";
import { useCrmForm } from "../logic/useCrmForm";
import { crmPath, type CrmKind, type CrmRecord } from "../logic/model";

export function CrmForm({
  organizationId,
  kind,
  initial,
  statusOptions = {},
}: {
  organizationId: string;
  kind: CrmKind;
  initial?: CrmRecord;
  statusOptions?: Record<string, string>;
}) {
  const model = useCrmForm(organizationId, kind, initial);
  const errors = (field: string) =>
    model.fieldErrors[field]?.map((message, index) => (
      <PlatformText key={`${field}.${index}`}>{message}</PlatformText>
    ));
  return (
    <>
      {kind === "companies" &&
        (initial ? (
          <PlatformText>Code: {(initial as CrmCompany).code}</PlatformText>
        ) : (
          <>
            <PlatformField
              label="Code"
              value={model.code}
              onChangeText={model.setCode}
              autoCapitalize="none"
            />
            {errors("code")}
          </>
        ))}
      <PlatformField
        label="Name"
        value={model.name}
        onChangeText={model.setName}
      />
      {errors("name")}
      {kind !== "companies" && (
        <>
          <PlatformField
            label="Email"
            value={model.email}
            onChangeText={model.setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          {errors("email")}
          <PlatformField
            label="Company ID (optional)"
            value={model.companyId}
            onChangeText={model.setCompanyId}
            keyboardType="number-pad"
          />
          {errors("company_id")}
        </>
      )}
      {kind === "leads" && initial && (
        <>
          <PlatformButton
            title={`Status: ${statusOptions[model.status] ?? "Unavailable"}`}
            secondary
            onPress={() => model.cycleStatus(statusOptions)}
          />
          {errors("status")}
        </>
      )}
      {errors("expected_version")}
      {!!model.message && <PlatformText>{model.message}</PlatformText>}
      <PlatformButton
        title={initial ? "Save changes" : "Create"}
        disabled={model.busy}
        onPress={() => void model.save()}
      />
      <PlatformButton
        title="Cancel"
        secondary
        onPress={() =>
          router.replace(crmPath(organizationId, kind, initial?.id))
        }
      />
    </>
  );
}
