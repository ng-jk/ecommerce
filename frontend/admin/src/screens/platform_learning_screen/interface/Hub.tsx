import { router, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { usePlatformQuery } from "../../platform_workspace_screen";
import { learningPath } from "../logic/model";

export function LearningHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user } = usePlatformSession();
  const organization = usePlatformQuery(
    !!user,
    useCallback(() => api.workspace.organization(id), [api, id]),
  );
  return (
    <PlatformPage title="Learning">
      <PlatformButton
        title="Organization"
        secondary
        onPress={() => router.replace(`/platform/organizations/${id}`)}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : organization.result ? (
        <>
          <PlatformButton
            title="Courses"
            onPress={() => router.push(learningPath(id, "courses"))}
          />
          <PlatformButton
            title="My enrollments"
            onPress={() => router.push(learningPath(id, "enrollments"))}
          />
          <PlatformButton
            title="My attempts"
            onPress={() => router.push(learningPath(id, "attempts"))}
          />
          {organization.result.can_update && (
            <PlatformButton
              title="Author courses"
              onPress={() => router.push(learningPath(id, "author/courses"))}
            />
          )}
        </>
      ) : organization.error ? (
        <>
          <PlatformText>{organization.error}</PlatformText>
          <PlatformButton title="Retry" onPress={organization.retry} />
        </>
      ) : (
        <PlatformText>Loading Learning…</PlatformText>
      )}
    </PlatformPage>
  );
}
