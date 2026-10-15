import { router } from "expo-router";
import { displayRows, nextChoice } from "@portfolio/storefront";
import {
  PlatformButton,
  PlatformField,
  PlatformPage,
  PlatformText,
  usePlatformSession,
} from "../../platform_shell_screen";
import { usePlatformAssistant } from "../logic/usePlatformAssistant";

export function PlatformAssistantScreen() {
  const { user } = usePlatformSession();
  return <PlatformAssistantSession key={user?.id ?? "guest"} />;
}

function PlatformAssistantSession() {
  const { user } = usePlatformSession();
  const model = usePlatformAssistant();
  const { reply, field, busy } = model;
  const options =
    field?.enum?.map(String) ??
    (field?.type === "boolean" ? ["false", "true"] : []);
  return (
    <PlatformPage title="Platform assistant">
      <PlatformButton
        title="Workspaces"
        secondary
        onPress={() => router.replace("/platform/organizations")}
      />
      {!user ? (
        <PlatformButton
          title="Sign in"
          onPress={() => router.replace("/platform/login")}
        />
      ) : (
        <>
          <PlatformText>
            Describe a request or choose an action. Review changes before
            confirming.
          </PlatformText>
          {reply && (
            <>
              <PlatformText>{reply.message}</PlatformText>
              {displayRows(reply.preview).map((row, index) => (
                <PlatformText key={`preview-${index}`}>{row}</PlatformText>
              ))}
              {reply.status === "completed" &&
                displayRows(reply.api_result).map((row, index) => (
                  <PlatformText key={`result-${index}`}>{row}</PlatformText>
                ))}
            </>
          )}
          {busy && (
            <PlatformText>Waiting for the platform worker…</PlatformText>
          )}
          {!!model.error && <PlatformText>{model.error}</PlatformText>}
          {model.pending && !busy ? (
            <PlatformButton
              title="Retry the same request"
              onPress={() => void model.retry()}
            />
          ) : reply?.status === "needs_confirmation" ? (
            <PlatformButton
              title="Confirm reviewed action"
              disabled={busy}
              onPress={() => void model.confirm()}
            />
          ) : (
            reply?.status !== "completed" && (
              <>
                {field && options.length > 0 ? (
                  <PlatformButton
                    title={`${field.field}: ${model.value ? (field.options?.[model.value] ?? model.value) : "Choose an option"}`}
                    disabled={busy}
                    onPress={() =>
                      model.setValue(nextChoice(options, model.value))
                    }
                  />
                ) : (
                  <PlatformField
                    label={field?.field ?? "Message"}
                    value={field ? model.value : model.message}
                    onChangeText={field ? model.setValue : model.setMessage}
                    editable={!busy}
                  />
                )}
                <PlatformButton
                  title="Send"
                  disabled={busy}
                  onPress={() => void model.submit()}
                />
              </>
            )
          )}
          <PlatformButton
            title="Available actions"
            secondary
            disabled={busy}
            onPress={() => void model.discover()}
          />
          {reply &&
            !reply.conversation_id &&
            reply.available_actions.map((action) => (
              <PlatformButton
                key={action.name}
                title={action.description}
                secondary
                disabled={busy}
                onPress={() => void model.choose(action.name)}
              />
            ))}
          <PlatformButton
            title="New request"
            secondary
            disabled={busy}
            onPress={model.reset}
          />
        </>
      )}
    </PlatformPage>
  );
}
