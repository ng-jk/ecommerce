import {
  ApiError,
  errorMessage,
  type BuilderPage,
  type BuilderBlock,
} from "@portfolio/api-client";
import { router } from "expo-router";
import { useState } from "react";
import { usePlatformSession } from "../../platform_shell_screen";
import { builderPath } from "./model";

export function useBuilderForm(organizationId: string, initial?: BuilderPage) {
  const { api } = usePlatformSession();
  const heading = initial?.blocks.find((block) => block.type === "heading");
  const paragraph = initial?.blocks.find((block) => block.type === "paragraph");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [headingText, setHeadingText] = useState(
    heading?.type === "heading" ? heading.text : "",
  );
  const [bodyText, setBodyText] = useState(
    paragraph?.type === "paragraph" ? paragraph.text : "",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const save = async () => {
    setBusy(true);
    setMessage("");
    setFieldErrors({});
    try {
      const blocks: BuilderBlock[] = [];
      if (headingText.trim())
        blocks.push({ type: "heading", text: headingText.trim(), level: 1 });
      if (bodyText.trim())
        blocks.push({ type: "paragraph", text: bodyText.trim() });
      for (const block of initial?.blocks ?? []) {
        if (block.type !== "heading" && block.type !== "paragraph")
          blocks.push(block);
      }
      const result = initial
        ? await api.builder.updatePage(organizationId, initial.id, {
            title,
            blocks,
            expected_version: initial.version,
          })
        : await api.builder.createPage(organizationId, { slug, title, blocks });
      router.replace(builderPath(organizationId, result.page.id));
    } catch (reason) {
      if (reason instanceof ApiError) setFieldErrors(reason.validation_error);
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return {
    slug,
    setSlug,
    title,
    setTitle,
    headingText,
    setHeadingText,
    bodyText,
    setBodyText,
    busy,
    message,
    fieldErrors,
    save,
  };
}
