import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { usePlatformSolution } from "../logic/usePlatformSolutions";

export function PlatformSolutionPurchase() {
  const { id, purchaseId } = useLocalSearchParams<{
    id: string;
    purchaseId: string;
  }>();
  const model = usePlatformSolution(id, purchaseId);
  const result = model.purchase.result;
  return (
    <PlatformPage title="Solution purchase">
      <PlatformButton
        title="Purchases"
        secondary
        onPress={() =>
          router.replace(`/platform/organizations/${id}/solutions`)
        }
      />
      {!model.user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : result ? (
        <>
          <PlatformText>
            Purchase {result.purchase_id}:{" "}
            {result.options.status[result.status] ?? "Unsupported status"}
          </PlatformText>
          <PlatformText>Provisioning attempts: {result.attempts}</PlatformText>
          {result.status === "failed" && (
            <PlatformButton
              title="Retry provisioning"
              disabled={model.busy}
              onPress={() => void model.retry()}
            />
          )}
          {!!model.error && <PlatformText>{model.error}</PlatformText>}
          <PlatformButton
            title="Refresh status"
            secondary
            onPress={model.purchase.retry}
          />
        </>
      ) : model.purchase.error ? (
        <>
          <PlatformText>{model.purchase.error}</PlatformText>
          <PlatformButton title="Retry status" onPress={model.purchase.retry} />
        </>
      ) : (
        <PlatformText>Loading status…</PlatformText>
      )}
    </PlatformPage>
  );
}
