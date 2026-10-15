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
import { learningPath } from "../logic/model";

export function LearningCourseRecord({ author = false }: { author?: boolean }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const query = usePlatformQuery(
    !!user,
    useCallback(
      () =>
        author
          ? api.learning.authorCourse(id, recordId, page)
          : api.learning.course(id, recordId, page),
      [api, id, recordId, page, author],
    ),
  );
  const course = query.result?.course;
  const act = async (
    record: NonNullable<typeof course>,
    action: "publish" | "archive" | "enroll",
  ) => {
    setBusy(true);
    setMessage("");
    try {
      if (action === "enroll") {
        const result = await api.learning.enroll(id, { course_id: record.id });
        router.replace(learningPath(id, `enrollments/${result.enrollment.id}`));
      } else {
        await (action === "publish"
          ? api.learning.publishCourse(id, record.id, {
              expected_version: record.version,
            })
          : api.learning.archiveCourse(id, record.id, {
              expected_version: record.version,
            }));
        query.retry();
      }
    } catch (reason) {
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title={author ? "Author course" : "Course"}>
      <PlatformButton
        title={author ? "Author courses" : "Courses"}
        secondary
        onPress={() =>
          router.replace(
            learningPath(id, author ? "author/courses" : "courses"),
          )
        }
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : course && query.result ? (
        <>
          <PlatformText>{course.title}</PlatformText>
          <PlatformText>{course.description ?? ""}</PlatformText>
          <PlatformText>
            Access: {course.access_mode} ·{" "}
            {query.result.options[course.status] ?? course.status}
          </PlatformText>
          {author ? (
            <>
              {course.status === "draft" && (
                <>
                  <PlatformButton
                    title="Edit course"
                    onPress={() =>
                      router.push(
                        learningPath(id, `author/courses/${course.id}/edit`),
                      )
                    }
                  />
                  <PlatformButton
                    title="Add lesson"
                    onPress={() =>
                      router.push(
                        learningPath(
                          id,
                          `author/courses/${course.id}/lessons/create`,
                        ),
                      )
                    }
                  />
                  <PlatformButton
                    title="Add assessment"
                    onPress={() =>
                      router.push(
                        learningPath(
                          id,
                          `author/courses/${course.id}/assessments/create`,
                        ),
                      )
                    }
                  />
                  <PlatformButton
                    title="Publish"
                    disabled={busy}
                    onPress={() => void act(course, "publish")}
                  />
                </>
              )}
              {course.status === "published" && (
                <PlatformButton
                  title="Archive"
                  disabled={busy}
                  onPress={() => void act(course, "archive")}
                />
              )}
            </>
          ) : (
            <PlatformButton
              title="My enrollment"
              disabled={busy}
              onPress={() => void act(course, "enroll")}
            />
          )}
          <PlatformText>Lessons</PlatformText>
          {query.result.lessons.data.map((lesson) => (
            <PlatformButton
              key={lesson.id}
              title={`${lesson.position}. ${lesson.title}`}
              onPress={() =>
                router.push(
                  learningPath(
                    id,
                    author
                      ? `author/lessons/${lesson.id}`
                      : `lessons/${lesson.id}`,
                  ),
                )
              }
            />
          ))}
          <PlatformText>Assessments</PlatformText>
          {query.result.assessments.data.map((assessment) => (
            <PlatformButton
              key={assessment.id}
              title={assessment.title}
              onPress={() =>
                router.push(
                  learningPath(
                    id,
                    author
                      ? `author/assessments/${assessment.id}`
                      : `assessments/${assessment.id}`,
                  ),
                )
              }
            />
          ))}
          <PlatformText>
            Page {page} of{" "}
            {Math.max(
              query.result.lessons.meta.last_page,
              query.result.assessments.meta.last_page,
            )}
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
            disabled={
              page >=
              Math.max(
                query.result.lessons.meta.last_page,
                query.result.assessments.meta.last_page,
              )
            }
            onPress={() => setPage(page + 1)}
          />
          {!!message && <PlatformText>{message}</PlatformText>}
        </>
      ) : query.error ? (
        <>
          <PlatformText>{query.error}</PlatformText>
          <PlatformButton title="Retry" onPress={query.retry} />
        </>
      ) : (
        <PlatformText>Loading course…</PlatformText>
      )}
    </PlatformPage>
  );
}

export function LearningEnrollmentRecord() {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const query = usePlatformQuery(
    !!user,
    useCallback(
      () => api.learning.enrollment(id, recordId),
      [api, id, recordId],
    ),
  );
  return (
    <PlatformPage title="Enrollment">
      <PlatformButton
        title="My enrollments"
        secondary
        onPress={() => router.replace(learningPath(id, "enrollments"))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : query.result ? (
        <>
          <PlatformText>Status: {query.result.enrollment.status}</PlatformText>
          <PlatformText>
            Lessons delivered: {query.result.progress.lessons_delivered}/
            {query.result.progress.lessons_total}
          </PlatformText>
          <PlatformText>
            Assessments passed: {query.result.progress.assessments_passed}/
            {query.result.progress.assessments_total}
          </PlatformText>
          <PlatformText>Delivery is not proof of study.</PlatformText>
          <PlatformButton
            title="Course"
            onPress={() =>
              router.push(
                learningPath(
                  id,
                  `courses/${query.result!.enrollment.course_id}`,
                ),
              )
            }
          />
        </>
      ) : query.error ? (
        <>
          <PlatformText>{query.error}</PlatformText>
          <PlatformButton title="Retry" onPress={query.retry} />
        </>
      ) : (
        <PlatformText>Loading enrollment…</PlatformText>
      )}
    </PlatformPage>
  );
}

export function LearningLessonRecord({ author = false }: { author?: boolean }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const query = usePlatformQuery(
    !!user,
    useCallback(
      () =>
        author
          ? api.learning.authorLesson(id, recordId)
          : api.learning.readLesson(id, recordId),
      [api, id, recordId, author],
    ),
  );
  const lesson = query.result?.lesson;
  return (
    <PlatformPage title={author ? "Author lesson" : "Lesson"}>
      <PlatformButton
        title="Learning"
        secondary
        onPress={() => router.replace(learningPath(id, "courses"))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : lesson ? (
        <>
          <PlatformText>{lesson.title}</PlatformText>
          <PlatformText>{lesson.content}</PlatformText>
          {author && (
            <PlatformButton
              title="Edit lesson"
              onPress={() =>
                router.push(
                  learningPath(id, `author/lessons/${lesson.id}/edit`),
                )
              }
            />
          )}
          {!author && "progress" in query.result! && (
            <PlatformText>
              Lesson delivered. Delivery is not proof of study.
            </PlatformText>
          )}
        </>
      ) : query.error ? (
        <>
          <PlatformText>{query.error}</PlatformText>
          <PlatformButton title="Retry" onPress={query.retry} />
        </>
      ) : (
        <PlatformText>Loading lesson…</PlatformText>
      )}
    </PlatformPage>
  );
}
