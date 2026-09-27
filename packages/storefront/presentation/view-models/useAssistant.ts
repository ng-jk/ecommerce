import { useEffect, useRef, useState } from "react";
import type {
  AssistantReply,
  AssistantTurn,
} from "@portfolio/api-client/domain/assistant";
import { ApiError, errorMessage } from "@portfolio/api-client/domain/types";
import {
  confirmTurn,
  continuation,
  fieldData,
  inputFields,
} from "../../domain/assistant";
import { useStore } from "./context";

export function useAssistant() {
  const { api, user, refreshSession, refreshCart } = useStore();
  const [reply, setReply] = useState<AssistantReply | null>(null);
  const [message, setMessage] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<AssistantTurn | null>(null);
  const generation = useRef(0);
  const locked = useRef(false);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const fields = reply
    ? inputFields(
        reply.required_input.filter((field) => field.field !== "message"),
      )
    : [];
  const field = fields[0];
  async function send(turn: AssistantTurn) {
    if (locked.current) return;
    const current = generation.current;
    locked.current = true;
    setBusy(true);
    setError("");
    setPending(turn);
    try {
      if (!api.assistant)
        throw new Error("Assistant is unavailable in this client.");
      const result = await api.assistant(turn, user?.id ?? null);
      if (current === generation.current) {
        setReply(result);
        setPending(null);
        setMessage("");
        setValue("");
      }
      if (current === generation.current && result.status === "completed") {
        if (result.executed_action?.startsWith("auth.")) await refreshSession();
        else if (
          result.executed_action === "cart.update" ||
          result.executed_action === "checkout"
        )
          await refreshCart();
      }
    } catch (failure) {
      if (current === generation.current) {
        setError(errorMessage(failure));
        if (!(
          failure instanceof ApiError &&
          ["network", "timeout", "invalid_body"].includes(failure.kind)
        ))
          setPending(null);
      }
    } finally {
      if (current === generation.current) {
        setBusy(false);
        locked.current = false;
      }
    }
  }
  return {
    reply,
    message,
    setMessage,
    value,
    setValue,
    field,
    error,
    busy,
    pending,
    discover: () => send({ discover: true }),
    choose: (action: string) => send({ action }),
    submit: async () => {
      try {
        await send({
          ...continuation(reply),
          ...(field
            ? {
                data: fieldData(field, value),
                ...(reply?.available_actions[0]
                  ? { action: reply.available_actions[0].name }
                  : {}),
              }
            : { message }),
        });
      } catch (failure) {
        setError(errorMessage(failure));
      }
    },
    confirm: async () => {
      try {
        if (reply) await send(confirmTurn(reply));
      } catch (failure) {
        setError(errorMessage(failure));
      }
    },
    retry: () => (pending ? send(pending) : Promise.resolve()),
    reset: () => {
      if (!locked.current) {
        setReply(null);
        setMessage("");
        setValue("");
        setPending(null);
        setError("");
      }
    },
  };
}
