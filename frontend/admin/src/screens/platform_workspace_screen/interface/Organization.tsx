import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { usePlatformOrganization } from "../logic/usePlatformOrganization";

export function PlatformOrganization() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = usePlatformOrganization(id);
  const detail = model.result;
  return (
    <PlatformPage title="Organization">
      <PlatformButton
        title="Organizations"
        secondary
        onPress={() => router.replace("/platform/organizations")}
      />
      {!model.user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : detail ? (
        <>
          <PlatformText>
            {detail.organization.name} · {detail.organization.code}
          </PlatformText>
          <PlatformText>
            Status:{" "}
            {detail.options.status[detail.organization.status] ??
              "Unsupported status"}
          </PlatformText>
          {detail.can_update && (
            <PlatformButton
              title="Edit name"
              onPress={() => router.push(`/platform/organizations/${id}/edit`)}
            />
          )}
          <PlatformButton
            title="Applications"
            onPress={() =>
              router.push(`/platform/organizations/${id}/applications`)
            }
          />
          <PlatformButton
            title="Members"
            onPress={() =>
              router.push(`/platform/organizations/${id}/memberships`)
            }
          />
          <PlatformButton
            title="Services"
            onPress={() =>
              router.push(`/platform/organizations/${id}/service-hub`)
            }
          />
          <PlatformButton
            title="Solution purchases"
            onPress={() =>
              router.push(`/platform/organizations/${id}/solutions`)
            }
          />
        </>
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading organization…</PlatformText>
      )}
    </PlatformPage>
  );
}
