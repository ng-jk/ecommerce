import { errorMessage } from "@portfolio/api-client";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { View } from "react-native";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import { learningPath } from "../logic/model";

export function LearningAssessmentRecord({
  author = false,
}: {
  author?: boolean;
}) {
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
          ? api.learning.authorAssessment(id, recordId)
          : api.learning.assessment(id, recordId),
      [api, id, recordId, author],
    ),
  );
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const assessment = query.result?.assessment;
  const submit = async (record: NonNullable<typeof assessment>) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await api.learning.submitAttempt(id, record.id, {
        answers: record.questions.map((_, index) => answers[index]!),
      });
      setMessage(
        `Score ${result.attempt.score}% · ${result.attempt.status}. Delivery is not proof of study.`,
      );
    } catch (reason) {
      setMessage(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PlatformPage title={author ? "Author assessment" : "Assessment"}>
      <PlatformButton
        title="Courses"
        secondary
        onPress={() => router.replace(learningPath(id, "courses"))}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : assessment ? (
        <>
          <PlatformText>{assessment.title}</PlatformText>
          <PlatformText>
            Pass score: {assessment.pass_score}% · Attempt limit:{" "}
            {assessment.attempt_limit}
          </PlatformText>
          {assessment.questions.map((question, questionIndex) => (
            <View key={questionIndex}>
              <PlatformText>
                {questionIndex + 1}. {question.prompt}
              </PlatformText>
              {question.options.map((option, optionIndex) =>
                author ? (
                  <PlatformText key={optionIndex}>
                    {"correct_index" in question &&
                    question.correct_index === optionIndex
                      ? "Correct: "
                      : ""}
                    {option}
                  </PlatformText>
                ) : (
                  <PlatformButton
                    key={optionIndex}
                    title={`${answers[questionIndex] === optionIndex ? "Selected: " : ""}${option}`}
                    secondary={answers[questionIndex] !== optionIndex}
                    onPress={() =>
                      setAnswers((current) => ({
                        ...current,
                        [questionIndex]: optionIndex,
                      }))
                    }
                  />
                ),
              )}
            </View>
          ))}
          {author ? (
            <PlatformButton
              title="Edit assessment"
              onPress={() =>
                router.push(
                  learningPath(id, `author/assessments/${assessment.id}/edit`),
                )
              }
            />
          ) : (
            <PlatformButton
              title="Submit answers"
              disabled={
                busy ||
                assessment.questions.some(
                  (_, index) => answers[index] === undefined,
                )
              }
              onPress={() => void submit(assessment)}
            />
          )}
          {!!message && <PlatformText>{message}</PlatformText>}
        </>
      ) : query.error ? (
        <>
          <PlatformText>{query.error}</PlatformText>
          <PlatformButton title="Retry" onPress={query.retry} />
        </>
      ) : (
        <PlatformText>Loading assessment…</PlatformText>
      )}
    </PlatformPage>
  );
}
