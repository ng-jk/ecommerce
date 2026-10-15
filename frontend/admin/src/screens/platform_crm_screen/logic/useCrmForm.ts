import { ApiError, errorMessage } from "@portfolio/api-client";
import { router } from "expo-router";
import { useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import type { CrmKind, CrmRecord } from "./model";
import { crmPath } from "./model";

export function useCrmForm(
  organizationId: string,
  kind: CrmKind,
  initial?: CrmRecord,
) {
  const { api } = usePlatformSession();
  const [code, setCode] = useState(
    "code" in (initial ?? {}) ? (initial as { code: string }).code : "",
  );
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(
    "email" in (initial ?? {}) ? (initial as { email: string }).email : "",
  );
  const [companyId, setCompanyId] = useState(
    "company_id" in (initial ?? {})
      ? String((initial as { company_id: number | null }).company_id ?? "")
      : "",
  );
  const [status, setStatus] = useState(
    "status" in (initial ?? {}) ? (initial as { status: string }).status : "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const cycleStatus = (options: Record<string, string>) => {
    const keys = Object.keys(options);
    setStatus(keys[(keys.indexOf(status) + 1) % keys.length] ?? "");
  };
  const save = async () => {
    setBusy(true);
    setMessage("");
    setFieldErrors({});
    try {
      const company_id = companyId.trim() === "" ? null : Number(companyId);
      if (
        kind !== "companies" &&
        company_id !== null &&
        (!Number.isSafeInteger(company_id) || company_id <= 0)
      ) {
        setFieldErrors({
          company_id: ["Enter a valid company ID or leave it blank."],
        });
        return;
      }
      let id: number;
      if (kind === "companies") {
        const result = initial
          ? await api.crm.updateCompany(organizationId, initial.id, {
              name,
              expected_version: initial.version,
            })
          : await api.crm.createCompany(organizationId, {
              code: code.toLowerCase().trim(),
              name,
            });
        id = result.company.id;
      } else if (kind === "contacts") {
        const input = { name, email, company_id };
        const result = initial
          ? await api.crm.updateContact(organizationId, initial.id, {
              ...input,
              expected_version: initial.version,
            })
          : await api.crm.createContact(organizationId, input);
        id = result.contact.id;
      } else {
        const input = { name, email, company_id };
        const result = initial
          ? await api.crm.updateLead(organizationId, initial.id, {
              ...input,
              status,
              expected_version: initial.version,
            })
          : await api.crm.createLead(organizationId, input);
        id = result.lead.id;
      }
      router.replace(crmPath(organizationId, kind, id));
    } catch (reason) {
      if (reason instanceof ApiError) setFieldErrors(reason.validation_error);
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return {
    code,
    setCode,
    name,
    setName,
    email,
    setEmail,
    companyId,
    setCompanyId,
    status,
    cycleStatus,
    busy,
    message,
    fieldErrors,
    save,
  };
}
