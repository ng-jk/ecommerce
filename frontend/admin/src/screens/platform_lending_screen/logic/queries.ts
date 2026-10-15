import { useCallback, useState } from "react";
import type {
  LendingApplication,
  LendingProduct,
  LendingProductSummary,
} from "@portfolio/api-client";
import { usePlatformSession } from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import { nextOption } from "./model";

export type LendingKind = "products" | "applications" | "reviews";
type DirectoryResult = {
  data: (LendingProductSummary | LendingApplication)[];
  meta: {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    options: Record<string, string>;
  };
};
type RecordResult = {
  options: Record<string, string>;
  product?: LendingProduct;
  application?: LendingApplication;
};

export function useLendingDirectory(organizationId: string, kind: LendingKind) {
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const load = useCallback(
    (): Promise<DirectoryResult> =>
      api.lending[kind](organizationId, page, status, 2),
    [api, kind, organizationId, page, status],
  );
  const query = usePlatformQuery(!!user, load);
  const cycleStatus = () => {
    setStatus(nextOption(query.result?.meta.options ?? {}, status));
    setPage(1);
  };
  return { user, page, setPage, status, cycleStatus, ...query };
}

export function useLendingRecord(
  organizationId: string,
  kind: LendingKind,
  id: string,
) {
  const { api, user } = usePlatformSession();
  const load = useCallback(
    (): Promise<RecordResult> =>
      kind === "products"
        ? api.lending.product(organizationId, id)
        : kind === "applications"
          ? api.lending.application(organizationId, id)
          : api.lending.review(organizationId, id),
    [api, kind, organizationId, id],
  );
  return { user, ...usePlatformQuery(!!user, load) };
}

export function useLendingSchedule(organizationId: string, id: string) {
  const { api, user } = usePlatformSession();
  const load = useCallback(
    () => api.lending.schedule(organizationId, id),
    [api, organizationId, id],
  );
  return { user, ...usePlatformQuery(!!user, load) };
}
