import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { usePlatformServices } from "../logic/usePlatformServices";

export function PlatformServices() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, page, setPage, catalog, result, services, path } =
    usePlatformServices(id);
  const base = `/platform/organizations/${id}` as const;
  return (
    <PlatformPage title="Services">
      <PlatformButton
        title="Organization"
        secondary
        onPress={() => router.replace(base)}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : result ? (
        <>
          {services.length === 0 && (
            <PlatformText>No active services on this page.</PlatformText>
          )}
          {services.map((item) => (
            <PlatformButton
              key={item.application_key}
              title={item.name}
              onPress={() =>
                router.push(`${base}/${path(item.application_key)}`)
              }
            />
          ))}
          <PlatformText>
            Page {page} of {result.meta.last_page}
          </PlatformText>
          <PlatformButton
            title="Previous page"
            secondary
            disabled={page === 1}
            onPress={() => setPage(page - 1)}
          />
          <PlatformButton
            title="Next page"
            secondary
            disabled={page >= result.meta.last_page}
            onPress={() => setPage(page + 1)}
          />
        </>
      ) : catalog.error ? (
        <>
          <PlatformText>{catalog.error}</PlatformText>
          <PlatformButton title="Retry" onPress={catalog.retry} />
        </>
      ) : (
        <PlatformText>Loading services…</PlatformText>
      )}
    </PlatformPage>
  );
}
