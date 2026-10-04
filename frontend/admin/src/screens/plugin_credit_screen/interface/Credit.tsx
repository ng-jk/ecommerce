import { Button, Copy, Field, useStore } from "@portfolio/storefront";
import { router } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { usePluginCredit } from "../logic/usePluginCredit";
export function PluginCreditScreen() {
  const { shop, user } = useStore();
  return <CreditSession key={`${shop}.${user?.id ?? "guest"}`} />;
}
function CreditSession() {
  const model = usePluginCredit();
  return (
    <AdminPage title="Credit loyalty points">
      <Button title="Plugins" onPress={() => router.replace("/plugins")} />
      {model.user?.role === "admin" && model.available ? (
        <>
          <Field
            label="Customer ID"
            value={model.userId}
            onChangeText={model.setUserId}
            keyboardType="numeric"
          />
          <Field
            label="Points"
            value={model.points}
            onChangeText={model.setPoints}
            keyboardType="numeric"
          />
          <Field
            label="Reason"
            value={model.reason}
            onChangeText={model.setReason}
            maxLength={200}
          />
          <Button
            title="Credit points"
            disabled={model.busy}
            onPress={() => void model.submit()}
          />
          {model.balance !== null && (
            <Copy>Updated balance: {model.balance} points</Copy>
          )}
        </>
      ) : (
        <Copy>Loyalty credit is unavailable for this account or shop.</Copy>
      )}
    </AdminPage>
  );
}
