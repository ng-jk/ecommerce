import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { lendingPath } from "../logic/model";

export function LendingHub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PlatformPage title="Lending">
      <PlatformButton
        title="Services"
        secondary
        onPress={() =>
          router.replace(`/platform/organizations/${id}/service-hub`)
        }
      />
      <PlatformText>
        Whole-term flat charge products and applications. Approval requires a
        distinct reviewer. No disbursement or repayment tracking is provided.
      </PlatformText>
      <PlatformButton
        title="Products"
        onPress={() => router.push(lendingPath(id, "products"))}
      />
      <PlatformButton
        title="My applications"
        onPress={() => router.push(lendingPath(id, "applications"))}
      />
      <PlatformButton
        title="Reviews"
        onPress={() => router.push(lendingPath(id, "reviews"))}
      />
    </PlatformPage>
  );
}
