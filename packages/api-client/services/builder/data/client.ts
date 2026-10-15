import type { z } from "zod";
import {
  builderId,
  builderPageNumber,
  builderList,
  builderDetail,
  builderRender,
  createBuilderPage,
  updateBuilderPage,
  publishBuilderPage,
} from "../logic/contracts";

type Request = <T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  method?: string,
  body?: unknown,
) => Promise<T>;

export function createBuilderClient(request: Request) {
  const base = (organizationId: string | number) =>
    `organizations/${builderId.parse(organizationId)}/builder/pages`;
  const record = (organizationId: string | number, pageId: string | number) =>
    `${base(organizationId)}/${builderId.parse(pageId)}`;
  return {
    pages: (
      organizationId: string | number,
      page = 1,
      status = "",
      perPage = 20,
    ) =>
      request(
        `${base(organizationId)}?page=${builderPageNumber.parse(page)}&per_page=${builderPageNumber.max(50).parse(perPage)}${status ? `&status=${encodeURIComponent(status)}` : ""}`,
        builderList,
      ),
    page: (organizationId: string | number, pageId: string | number) =>
      request(record(organizationId, pageId), builderDetail),
    createPage: (
      organizationId: string | number,
      input: z.input<typeof createBuilderPage>,
    ) =>
      request(
        base(organizationId),
        builderDetail,
        "POST",
        createBuilderPage.parse(input),
      ),
    updatePage: (
      organizationId: string | number,
      pageId: string | number,
      input: z.input<typeof updateBuilderPage>,
    ) =>
      request(
        record(organizationId, pageId),
        builderDetail,
        "PATCH",
        updateBuilderPage.parse(input),
      ),
    publishPage: (
      organizationId: string | number,
      pageId: string | number,
      input: z.input<typeof publishBuilderPage>,
    ) =>
      request(
        `${record(organizationId, pageId)}/publish`,
        builderDetail,
        "POST",
        publishBuilderPage.parse(input),
      ),
    renderPage: (organizationId: string | number, pageId: string | number) =>
      request(`${record(organizationId, pageId)}/render`, builderRender),
  };
}
