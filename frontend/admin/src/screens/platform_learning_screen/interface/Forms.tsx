import { ApiError, errorMessage } from "@portfolio/api-client";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import {
  PlatformButton,
  PlatformField,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import { learningPath } from "../logic/model";

function Failure({ reason }: { reason: unknown }) {
  if (!reason) return null;
  return (
    <>
      <PlatformText>{errorMessage(reason)}</PlatformText>
      {reason instanceof ApiError &&
        Object.entries(reason.validation_error).flatMap(([field, messages]) =>
          messages.map((message, index) => (
            <PlatformText key={`${field}.${index}`}>
              {field}: {message}
            </PlatformText>
          )),
        )}
    </>
  );
}

export function LearningCourseForm({ edit = false }: { edit?: boolean }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const query = usePlatformQuery(
    !!user && edit && !!recordId,
    useCallback(
      () => api.learning.authorCourse(id, recordId!),
      [api, id, recordId],
    ),
  );
  const record = query.result?.course;
  const [code, setCode] = useState("");
  const [title, setTitle] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState<"free" | "paid" | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<unknown>(null);
  const save = async () => {
    setBusy(true);
    setReason(null);
    try {
      const input = {
        title: title ?? record?.title ?? "",
        description: description ?? record?.description ?? "",
        access_mode: accessMode ?? record?.access_mode ?? "free",
      };
      const result =
        edit && record
          ? await api.learning.updateCourse(id, record.id, {
              ...input,
              expected_version: record.version,
            })
          : await api.learning.createCourse(id, {
              ...input,
              code: code.trim().toLowerCase(),
            });
      router.replace(learningPath(id, `author/courses/${result.course.id}`));
    } catch (error) {
      setReason(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title={edit ? "Edit course" : "Create course"}>
      <PlatformButton
        title="Author courses"
        secondary
        onPress={() => router.replace(learningPath(id, "author/courses"))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : edit && !record ? (
        query.error ? (
          <>
            <PlatformText>{query.error}</PlatformText>
            <PlatformButton title="Retry" onPress={query.retry} />
          </>
        ) : (
          <PlatformText>Loading course…</PlatformText>
        )
      ) : (
        <>
          {!edit && (
            <PlatformField
              label="Code"
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
            />
          )}
          <PlatformField
            label="Title"
            value={title ?? record?.title ?? ""}
            onChangeText={setTitle}
          />
          <PlatformField
            label="Description"
            value={description ?? record?.description ?? ""}
            onChangeText={setDescription}
            multiline
          />
          <PlatformButton
            title={`Access: ${accessMode ?? record?.access_mode ?? "free"}`}
            secondary
            onPress={() =>
              setAccessMode((current) =>
                (current ?? record?.access_mode ?? "free") === "free"
                  ? "paid"
                  : "free",
              )
            }
          />
          <Failure reason={reason} />
          <PlatformButton
            title="Save course"
            disabled={busy}
            onPress={() => void save()}
          />
        </>
      )}
    </PlatformPage>
  );
}

export function LearningLessonForm({ edit = false }: { edit?: boolean }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const detail = usePlatformQuery(
    !!user && edit && !!recordId,
    useCallback(
      () => api.learning.authorLesson(id, recordId!),
      [api, id, recordId],
    ),
  );
  const effectiveCourseId = edit
    ? String(detail.result?.lesson.course_id ?? "")
    : recordId;
  const course = usePlatformQuery(
    !!user && !!effectiveCourseId,
    useCallback(
      () => api.learning.authorCourse(id, effectiveCourseId),
      [api, id, effectiveCourseId],
    ),
  );
  const [title, setTitle] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [position, setPosition] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<unknown>(null);
  const record = detail.result?.lesson;
  const save = async () => {
    setBusy(true);
    setReason(null);
    try {
      const input = {
        title: title ?? record?.title ?? "",
        content: content ?? record?.content ?? "",
        position: Number(position ?? record?.position ?? 1),
      };
      const result =
        edit && record
          ? await api.learning.updateLesson(id, record.id, {
              ...input,
              expected_version: record.version,
            })
          : await api.learning.createLesson(id, {
              ...input,
              course_id: Number(effectiveCourseId),
              expected_version: course.result!.course.version,
            });
      router.replace(learningPath(id, `author/lessons/${result.lesson.id}`));
    } catch (error) {
      setReason(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title={edit ? "Edit lesson" : "Create lesson"}>
      <PlatformButton
        title="Author courses"
        secondary
        onPress={() => router.replace(learningPath(id, "author/courses"))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : edit && !record ? (
        detail.error ? (
          <>
            <PlatformText>{detail.error}</PlatformText>
            <PlatformButton title="Retry" onPress={detail.retry} />
          </>
        ) : (
          <PlatformText>Loading lesson…</PlatformText>
        )
      ) : !course.result ? (
        course.error ? (
          <>
            <PlatformText>{course.error}</PlatformText>
            <PlatformButton title="Retry" onPress={course.retry} />
          </>
        ) : (
          <PlatformText>Loading course…</PlatformText>
        )
      ) : (
        <>
          <PlatformField
            label="Title"
            value={title ?? record?.title ?? ""}
            onChangeText={setTitle}
          />
          <PlatformField
            label="Content"
            value={content ?? record?.content ?? ""}
            onChangeText={setContent}
            multiline
          />
          <PlatformField
            label="Position"
            value={position ?? String(record?.position ?? 1)}
            onChangeText={setPosition}
            keyboardType="number-pad"
          />
          <Failure reason={reason} />
          <PlatformButton
            title="Save lesson"
            disabled={busy || course.result.course.status !== "draft"}
            onPress={() => void save()}
          />
        </>
      )}
    </PlatformPage>
  );
}

type EditableQuestion = {
  prompt: string;
  options: string[];
  correct_index: number;
};
const blankQuestion = (): EditableQuestion => ({
  prompt: "",
  options: ["", ""],
  correct_index: 0,
});

export function LearningAssessmentForm({ edit = false }: { edit?: boolean }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const { api, user } = usePlatformSession();
  const detail = usePlatformQuery(
    !!user && edit && !!recordId,
    useCallback(
      () => api.learning.authorAssessment(id, recordId!),
      [api, id, recordId],
    ),
  );
  const record = detail.result?.assessment;
  const effectiveCourseId = edit ? String(record?.course_id ?? "") : recordId;
  const course = usePlatformQuery(
    !!user && !!effectiveCourseId,
    useCallback(
      () => api.learning.authorCourse(id, effectiveCourseId),
      [api, id, effectiveCourseId],
    ),
  );
  const [title, setTitle] = useState<string | null>(null);
  const [passScore, setPassScore] = useState<string | null>(null);
  const [attemptLimit, setAttemptLimit] = useState<string | null>(null);
  const [questions, setQuestions] = useState<EditableQuestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<unknown>(null);
  const shown = questions ?? record?.questions ?? [blankQuestion()];
  const changeQuestion = (
    index: number,
    change: (question: EditableQuestion) => EditableQuestion,
  ) =>
    setQuestions(
      shown.map((question, position) =>
        position === index ? change(question) : question,
      ),
    );
  const save = async () => {
    setBusy(true);
    setReason(null);
    try {
      const input = {
        title: title ?? record?.title ?? "",
        questions: shown,
        pass_score: Number(passScore ?? record?.pass_score ?? 80),
        attempt_limit: Number(attemptLimit ?? record?.attempt_limit ?? 3),
      };
      const result =
        edit && record
          ? await api.learning.updateAssessment(id, record.id, {
              ...input,
              expected_version: record.version,
            })
          : await api.learning.createAssessment(id, {
              ...input,
              course_id: Number(effectiveCourseId),
              expected_version: course.result!.course.version,
            });
      router.replace(
        learningPath(id, `author/assessments/${result.assessment.id}`),
      );
    } catch (error) {
      setReason(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title={edit ? "Edit assessment" : "Create assessment"}>
      <PlatformButton
        title="Author courses"
        secondary
        onPress={() => router.replace(learningPath(id, "author/courses"))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : edit && !record ? (
        detail.error ? (
          <>
            <PlatformText>{detail.error}</PlatformText>
            <PlatformButton title="Retry" onPress={detail.retry} />
          </>
        ) : (
          <PlatformText>Loading assessment…</PlatformText>
        )
      ) : !course.result ? (
        course.error ? (
          <>
            <PlatformText>{course.error}</PlatformText>
            <PlatformButton title="Retry" onPress={course.retry} />
          </>
        ) : (
          <PlatformText>Loading course…</PlatformText>
        )
      ) : (
        <>
          <PlatformField
            label="Title"
            value={title ?? record?.title ?? ""}
            onChangeText={setTitle}
          />
          <PlatformField
            label="Pass score (1–100)"
            value={passScore ?? String(record?.pass_score ?? 80)}
            onChangeText={setPassScore}
            keyboardType="number-pad"
          />
          <PlatformField
            label="Attempt limit (1–10)"
            value={attemptLimit ?? String(record?.attempt_limit ?? 3)}
            onChangeText={setAttemptLimit}
            keyboardType="number-pad"
          />
          {shown.map((question, index) => (
            <View key={index}>
              <PlatformText>Question {index + 1}</PlatformText>
              <PlatformField
                label="Prompt"
                value={question.prompt}
                onChangeText={(value) =>
                  changeQuestion(index, (old) => ({ ...old, prompt: value }))
                }
              />
              {question.options.map((option, optionIndex) => (
                <PlatformField
                  key={optionIndex}
                  label={`Option ${optionIndex + 1}${question.correct_index === optionIndex ? " (correct)" : ""}`}
                  value={option}
                  onChangeText={(value) =>
                    changeQuestion(index, (old) => ({
                      ...old,
                      options: old.options.map((item, position) =>
                        position === optionIndex ? value : item,
                      ),
                    }))
                  }
                />
              ))}
              <PlatformButton
                title="Next correct option"
                secondary
                onPress={() =>
                  changeQuestion(index, (old) => ({
                    ...old,
                    correct_index: (old.correct_index + 1) % old.options.length,
                  }))
                }
              />
              <PlatformButton
                title="Add option"
                secondary
                disabled={question.options.length >= 6}
                onPress={() =>
                  changeQuestion(index, (old) => ({
                    ...old,
                    options: [...old.options, ""],
                  }))
                }
              />
              <PlatformButton
                title="Remove last option"
                secondary
                disabled={question.options.length <= 2}
                onPress={() =>
                  changeQuestion(index, (old) => ({
                    ...old,
                    options: old.options.slice(0, -1),
                    correct_index: Math.min(
                      old.correct_index,
                      old.options.length - 2,
                    ),
                  }))
                }
              />
            </View>
          ))}
          <PlatformButton
            title="Add question"
            secondary
            disabled={shown.length >= 20}
            onPress={() => setQuestions([...shown, blankQuestion()])}
          />
          <PlatformButton
            title="Remove last question"
            secondary
            disabled={shown.length <= 1}
            onPress={() => setQuestions(shown.slice(0, -1))}
          />
          <Failure reason={reason} />
          <PlatformButton
            title="Save assessment"
            disabled={busy || course.result.course.status !== "draft"}
            onPress={() => void save()}
          />
        </>
      )}
    </PlatformPage>
  );
}
