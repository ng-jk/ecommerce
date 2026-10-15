import { router } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { PlatformOrganizationForm } from "./OrganizationForm";

export function PlatformOrganizationCreate() {
  const { user } = usePlatformSession();
  return (
    <PlatformPage title="Create organization">
      {user ? (
        <PlatformOrganizationForm />
      ) : (
        <>
          <PlatformText>Sign in to create an organization.</PlatformText>
          <PlatformButton
            title="Sign in"
            onPress={() => router.replace("/platform/login")}
          />
        </>
      )}
    </PlatformPage>
  );
}
