import { errorMessage } from "@portfolio/api-client";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import { learningBase, learningPath } from "../logic/model";

export type LearningDirectoryKind =
  "courses" | "author/courses" | "enrollments" | "attempts";
type Row =
  | { id: number; title: string }
  | { id: number; course_id: number; status: string }
  | { id: number; number: number; score: number };
type DirectoryPage = {
  data: Row[];
  meta: {
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
  };
};

export function LearningDirectory({ kind }: { kind: LearningDirectoryKind }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const load = useCallback(async (): Promise<DirectoryPage> => {
    switch (kind) {
      case "courses":
        return api.learning.courses(id, page);
      case "author/courses":
        return api.learning.authorCourses(id, page);
      case "enrollments":
        return api.learning.enrollments(id, page);
      case "attempts":
        return api.learning.attempts(id, page);
    }
  }, [api, id, kind, page]);
  const query = usePlatformQuery(!!user, load);
  const title = {
    courses: "Courses",
    "author/courses": "Author courses",
    enrollments: "My enrollments",
    attempts: "My attempts",
  }[kind];
  const open = async (record: Row) => {
    if (kind === "courses") {
      setBusy(true);
      setMessage("");
      try {
        await api.learning.enroll(id, { course_id: record.id });
        router.push(learningPath(id, `courses/${record.id}`));
      } catch (reason) {
        setMessage(errorMessage(reason));
      } finally {
        setBusy(false);
      }
    } else if ("title" in record)
      router.push(learningPath(id, `${kind}/${record.id}`));
    else if ("course_id" in record)
      router.push(learningPath(id, `enrollments/${record.id}`));
  };
  return (
    <PlatformPage title={title}>
      <PlatformButton
        title="Learning"
        secondary
        onPress={() => router.replace(learningBase(id))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : query.result ? (
        <>
          {kind === "author/courses" && (
            <PlatformButton
              title="Create course"
              onPress={() =>
                router.push(learningPath(id, "author/courses/create"))
              }
            />
          )}
          {query.result.data.length === 0 && (
            <PlatformText>No records on this page.</PlatformText>
          )}
          {query.result.data.map((record) => (
            <PlatformButton
              key={record.id}
              disabled={busy}
              title={
                "title" in record
                  ? `${kind === "courses" ? "Enroll: " : ""}${record.title}`
                  : "course_id" in record
                    ? `Course ${record.course_id} · ${record.status}`
                    : `Attempt ${record.number} · ${record.score}%`
              }
              onPress={() => void open(record)}
            />
          ))}
          {!!message && <PlatformText>{message}</PlatformText>}
          <PlatformText>
            Page {page} of {query.result.meta.last_page}
          </PlatformText>
          <PlatformButton
            title="Previous"
            secondary
            disabled={page === 1}
            onPress={() => setPage(page - 1)}
          />
          <PlatformButton
            title="Next"
            secondary
            disabled={page >= query.result.meta.last_page}
            onPress={() => setPage(page + 1)}
          />
        </>
      ) : query.error ? (
        <>
          <PlatformText>{query.error}</PlatformText>
          <PlatformButton title="Retry" onPress={query.retry} />
        </>
      ) : (
        <PlatformText>Loading {title}…</PlatformText>
      )}
    </PlatformPage>
  );
}
