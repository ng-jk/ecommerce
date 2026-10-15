import {
  ApiError,
  errorMessage,
  type BuilderPage,
} from "@portfolio/api-client";
import { useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";

export function useBuilderPublish(
  organizationId: string,
  page: BuilderPage,
  reload: () => void,
) {
  const { api } = usePlatformSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const publish = async () => {
    setBusy(true);
    setMessage("");
    try {
      await api.builder.publishPage(organizationId, page.id, {
        expected_version: page.version,
      });
      reload();
    } catch (reason) {
      const detail =
        reason instanceof ApiError &&
        reason.validation_error.expected_version?.join(" ");
      setMessage(detail || errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return { busy, message, publish };
}
