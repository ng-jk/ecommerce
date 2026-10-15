import type { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import { createBuilderClient } from "../../packages/api-client/services/builder";

const page = {
  id: 8,
  slug: "home",
  title: "Home",
  blocks: [{ type: "heading", text: "Welcome", level: 1 }],
  status: "draft",
  version: 0,
  published_version: null,
  published_at: null,
};
const options = {
  status: { draft: "Draft", published: "Published" },
  block_type: { heading: "Heading" },
};

describe("standalone Builder SDK", () => {
  it("routes six scoped actions through the validated transport", async () => {
    const request = vi.fn(
      async <T>(
        path: string,
        schema: z.ZodType<T, z.ZodTypeDef, unknown>,
        method?: string,
        body?: unknown,
      ) => {
        const result = path.endsWith("/render")
          ? {
              render: {
                slug: "home",
                title: "Home",
                blocks: page.blocks,
                published_version: 1,
              },
            }
          : method === "GET" || path.includes("?page=")
            ? path.includes("?page=")
              ? {
                  data: [page],
                  meta: {
                    current_page: 2,
                    per_page: 20,
                    last_page: 2,
                    total: 21,
                    options,
                  },
                }
              : { page, options }
            : { page, options };
        return schema.parse(result);
      },
    );
    const client = createBuilderClient(async (path, schema, method, body) =>
      schema.parse(
        await (method === undefined
          ? request(path, schema)
          : request(path, schema, method, body)),
      ),
    );
    expect((await client.pages(3, 2, "draft")).data[0]?.id).toBe(8);
    expect((await client.page(3, 8)).page.slug).toBe("home");
    expect(
      (await client.createPage(3, { slug: "home", title: "Home", blocks: [] }))
        .page.id,
    ).toBe(8);
    expect(
      (
        await client.updatePage(3, 8, {
          title: "Home",
          blocks: [],
          expected_version: 0,
        })
      ).page.id,
    ).toBe(8);
    expect(
      (await client.publishPage(3, 8, { expected_version: 0 })).page.id,
    ).toBe(8);
    expect((await client.renderPage(3, 8)).render.published_version).toBe(1);
    expect(request.mock.calls.map(([path]) => path)).toEqual([
      "organizations/3/builder/pages?page=2&per_page=20&status=draft",
      "organizations/3/builder/pages/8",
      "organizations/3/builder/pages",
      "organizations/3/builder/pages/8",
      "organizations/3/builder/pages/8/publish",
      "organizations/3/builder/pages/8/render",
    ]);
    expect(request.mock.calls.map(([, , method]) => method)).toEqual([
      undefined,
      undefined,
      "POST",
      "PATCH",
      "POST",
      undefined,
    ]);
    await client.pages(3);
    expect(request).toHaveBeenLastCalledWith(
      "organizations/3/builder/pages?page=1&per_page=20",
      expect.anything(),
    );
  });

  it("rejects executable blocks, unsafe URLs, malformed identities, and invalid results", async () => {
    const request = vi.fn(
      async <T>(
        _path: string,
        schema: z.ZodType<T, z.ZodTypeDef, unknown>,
        _method?: string,
        _body?: unknown,
      ) => schema.parse({ page, options }),
    );
    const client = createBuilderClient(async (path, schema, method, body) =>
      schema.parse(
        await (method === undefined
          ? request(path, schema)
          : request(path, schema, method, body)),
      ),
    );
    expect(() =>
      client.createPage(1, {
        slug: "home",
        title: "Home",
        blocks: [{ type: "paragraph", text: "<script>bad</script>" }],
      }),
    ).toThrow();
    expect(() =>
      client.createPage(1, {
        slug: "home",
        title: "Home",
        blocks: [{ type: "button", label: "Go", url: "javascript:alert(1)" }],
      }),
    ).toThrow();
    expect(() =>
      client.createPage(1, {
        slug: "home",
        title: "Home",
        blocks: [
          {
            type: "image",
            src: "https://user:password@example.org/a",
            alt: "A",
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      client.createPage(1, {
        slug: "home",
        title: "Home",
        blocks: [{ type: "button", label: "Go", url: "http://example.org" }],
      }),
    ).toThrow();
    expect(() =>
      client.createPage(1, {
        slug: "home",
        title: "Home",
        blocks: [
          { type: "image", src: "https://user@example.org/a", alt: "A" },
        ],
      }),
    ).toThrow();
    expect(() => client.page("bad", 1)).toThrow();
    expect(() => client.pages(1, 0)).toThrow();
    expect(() =>
      client.updatePage(1, 2, {
        title: "Home",
        blocks: [],
        expected_version: -1,
      }),
    ).toThrow();
    expect(request).not.toHaveBeenCalled();
    expect(() =>
      client.createPage(1, {
        slug: "home",
        title: "Home",
        blocks: [{ type: "image", src: "https://example.org/a", alt: "A" }],
      }),
    ).not.toThrow();
  });
});
