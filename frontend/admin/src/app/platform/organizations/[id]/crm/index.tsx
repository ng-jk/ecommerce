import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
} from "../../../../../screens/platform_shell_screen";

export default function CrmHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const base = `/platform/organizations/${id}/crm`;
  return (
    <PlatformPage title="CRM">
      <PlatformButton
        title="Organization"
        secondary
        onPress={() => router.replace(`/platform/organizations/${id}`)}
      />
      <PlatformButton
        title="Companies"
        onPress={() => router.push(`${base}/companies`)}
      />
      <PlatformButton
        title="Contacts"
        onPress={() => router.push(`${base}/contacts`)}
      />
      <PlatformButton
        title="Leads"
        onPress={() => router.push(`${base}/leads`)}
      />
      <PlatformButton
        title="Sales"
        onPress={() => router.push(`${base}/sales`)}
      />
    </PlatformPage>
  );
}
