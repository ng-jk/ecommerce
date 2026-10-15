import { z } from "zod";

const id = z.number().int().positive();
export const builderId = z.coerce.number().int().positive();
export const builderPageNumber = z.number().int().positive();
const version = z.number().int().nonnegative();
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[<>\x00-\x08\x0B\x0C\x0E-\x1F]/u.test(value));
const httpsUrl = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !/[<>\x00-\x20]/.test(value)
    );
  });
export const builderBlock = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("heading"),
      text: text(200),
      level: z.number().int().min(1).max(3),
    })
    .strict(),
  z.object({ type: z.literal("paragraph"), text: text(2000) }).strict(),
  z
    .object({ type: z.literal("image"), src: httpsUrl, alt: text(200) })
    .strict(),
  z
    .object({ type: z.literal("button"), label: text(100), url: httpsUrl })
    .strict(),
]);
export type BuilderBlock = z.infer<typeof builderBlock>;
const blocks = z.array(builderBlock).max(20);
const options = z.object({
  status: z.record(z.string()),
  block_type: z.record(z.string()),
});
export const builderPage = z.object({
  id,
  slug: z.string(),
  title: z.string(),
  blocks,
  status: z.string(),
  version,
  published_version: version.nullable(),
  published_at: z.string().datetime({ offset: true }).nullable(),
});
export type BuilderPage = z.infer<typeof builderPage>;
export const builderList = z.object({
  data: z.array(builderPage),
  meta: z.object({
    current_page: builderPageNumber,
    per_page: builderPageNumber,
    last_page: builderPageNumber,
    total: z.number().int().nonnegative(),
    options,
  }),
});
export const builderDetail = z.object({ page: builderPage, options });
export const builderRender = z.object({
  render: z.object({
    slug: z.string(),
    title: z.string(),
    blocks,
    published_version: version,
  }),
});
export const createBuilderPage = z
  .object({
    slug: z
      .string()
      .min(2)
      .max(100)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: text(200),
    blocks,
  })
  .strict();
export const updateBuilderPage = createBuilderPage
  .omit({ slug: true })
  .extend({ expected_version: version });
export const publishBuilderPage = z
  .object({ expected_version: version })
  .strict();
