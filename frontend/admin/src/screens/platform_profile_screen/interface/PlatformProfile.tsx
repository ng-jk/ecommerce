import { router } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { usePlatformProfile } from "../logic/usePlatformProfile";

export function PlatformProfile() {
  const session = usePlatformProfile();
  return (
    <PlatformPage title="Platform account">
      {session.loading ? (
        <PlatformText>Checking your account…</PlatformText>
      ) : session.user ? (
        <>
          <PlatformText>
            {session.user.name} · {session.user.email}
          </PlatformText>
          <PlatformButton
            title="Organizations"
            onPress={() => router.push("/platform/organizations")}
          />
          <PlatformButton
            title="Sign out"
            disabled={session.busy}
            secondary
            onPress={() => void session.signOut()}
          />
        </>
      ) : (
        <>
          <PlatformText>Sign in to view your organizations.</PlatformText>
          <PlatformButton
            title="Sign in"
            onPress={() => router.replace("/platform/login")}
          />
        </>
      )}
    </PlatformPage>
  );
}
