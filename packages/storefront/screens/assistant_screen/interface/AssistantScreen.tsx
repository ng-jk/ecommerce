import { displayRows, nextChoice ,
  assistantPaymentLinks,
  assistantResultRows,
} from "../../../services/assistant";
import { Link } from "expo-router";
import {
  Button,
  Copy,
  Field,
  Heading,
  Page,
  Panel,
 useStore } from "../../store_shell_screen";
import { useAssistant } from "../logic/useAssistant";

export function AssistantScreen({ admin = false }: { admin?: boolean }) {
  const { shop, user } = useStore();
  return (
    <AssistantSession
      key={`${shop}.${user?.id ?? "guest"}.${user?.role ?? "guest"}`}
      admin={admin}
    />
  );
}
function AssistantSession({ admin }: { admin: boolean }) {
  const model = useAssistant();
  const { reply, field, busy, pending } = model;
  const options =
    field?.enum?.map(String) ??
    (field?.type === "boolean" ? ["false", "true"] : []);
  const review = reply?.status === "needs_confirmation";
  const completed = reply?.status === "completed";
  const selectedAction = reply?.available_actions[0];
  return (
    <Page
      navigationPath={admin ? "/" : "/menu"}
      navigationTitle={admin ? "Dashboard" : "Menu"}
    >
      <Heading>Shop assistant</Heading>
      <Copy>
        Describe what you need, choose an available action, and review its
        details before confirming. Enter credentials only in the secure fields
        below.
      </Copy>
      {reply && (
        <Panel>
          <Copy bold>
            {review &&
            reply.message.startsWith(
              "Review the action and data, then send confirm: true",
            )
              ? "Review this action and its details. Confirm below to continue."
              : reply.message}
          </Copy>
          {review && selectedAction && (
            <>
              <Copy bold>{selectedAction.description}</Copy>
              <Copy>Action: {selectedAction.name}</Copy>
            </>
          )}
          {displayRows(reply.preview).map((row, i) => (
            <Copy key={i}>{row}</Copy>
          ))}
          {completed &&
            assistantResultRows(reply.api_result).map((row, i) => (
              <Copy key={i}>{row}</Copy>
            ))}
          {completed &&
            assistantPaymentLinks(reply.api_result).map((link, i) => (
              <Link key={i} href={link.url}>
                {link.label}
              </Link>
            ))}
          {displayRows(reply.choices).map((row, i) => (
            <Copy key={i}>{row}</Copy>
          ))}
        </Panel>
      )}
      {busy && (
        <Copy>Pending: waiting for the shop worker to finish this turn.</Copy>
      )}
      {!!model.error && <Copy>{model.error}</Copy>}
      {pending && !busy ? (
        <Button
          title="Retry the same turn"
          onPress={() => {
            void model.retry();
          }}
        />
      ) : review ? (
        <Button
          title="Confirm reviewed action"
          disabled={busy}
          onPress={() => {
            void model.confirm();
          }}
        />
      ) : (
        !completed && (
          <>
            {field ? (
              options.length > 0 ? (
                <Button
                  title={`${field.field}: ${model.value ? (field.options ? (field.options[model.value] ?? "Unavailable option") : model.value) : "Choose an option"}`}
                  disabled={busy}
                  onPress={() =>
                    model.setValue(nextChoice(options, model.value))
                  }
                />
              ) : (
                <Field
                  label={field.field
                    .replace(/^data\./, "")
                    .replaceAll("_", " ")}
                  value={model.value}
                  onChangeText={model.setValue}
                  secureTextEntry={/password/.test(field.field)}
                  editable={!busy}
                  keyboardType={
                    field.type === "integer" || field.type === "number"
                      ? "numeric"
                      : "default"
                  }
                  multiline={field.type === "array" || field.type === "object"}
                />
              )
            ) : (
              <Field
                label="Message"
                value={model.message}
                onChangeText={model.setMessage}
                editable={!busy}
                multiline
                maxLength={2000}
              />
            )}
            {field && (field.type === "array" || field.type === "object") && (
              <Copy>
                Enter the structured list as JSON, or start a new request
                describing the action in words.
              </Copy>
            )}
            <Button
              title={field ? "Provide this detail" : "Send message"}
              disabled={busy || !(field ? model.value : model.message).trim()}
              onPress={() => {
                void model.submit();
              }}
            />
            {!reply?.conversation_id &&
              reply?.available_actions.map((tool) => (
                <Button
                  key={tool.name}
                  title={tool.description}
                  disabled={busy}
                  onPress={() => {
                    void model.choose(tool.name);
                  }}
                />
              ))}
          </>
        )
      )}
      {!reply?.conversation_id && !pending && (
        <Button
          title="Discover available actions"
          disabled={busy}
          onPress={() => {
            void model.discover();
          }}
        />
      )}
      <Button
        title="New request"
        secondary
        disabled={busy || pending !== null}
        onPress={model.reset}
      />
    </Page>
  );
}
