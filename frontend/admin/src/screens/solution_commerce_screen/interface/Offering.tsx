import { Button, Copy } from "@portfolio/storefront";
import { router, useLocalSearchParams } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { useOffering } from "../logic/useShopSolutions";

export function SolutionOffering() {
  const { offeringId } = useLocalSearchParams<{ offeringId: string }>();
  const model = useOffering(offeringId);
  const offering = model.result?.offering;
  return (
    <AdminPage title="Solution offering">
      <Button
        title="Solutions"
        secondary
        onPress={() => router.replace("/solutions/offerings")}
      />
      {offering ? (
        <>
          <Copy>
            Offering {offering.id} · {offering.application_key} · version{" "}
            {offering.version}
          </Copy>
          <Copy>
            Product {offering.product_id} · MYR{" "}
            {(offering.unit_amount / 100).toFixed(2)} before checkout shipping
          </Copy>
          {offering.deliverables.map((item, index) => (
            <Copy key={index}>• {item}</Copy>
          ))}
          <Copy>
            Buy the listed product through checkout with a verified payment
            method, then bind your order to an organization you own.
          </Copy>
          <Button
            title="Organizations"
            onPress={() => router.push("/organizations")}
          />
        </>
      ) : model.error ? (
        <>
          <Copy>{model.error}</Copy>
          <Button title="Retry" onPress={model.retry} />
        </>
      ) : (
        <Copy>Loading offering…</Copy>
      )}
    </AdminPage>
  );
}
