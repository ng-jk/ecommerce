// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ApiError } from "../../packages/api-client/services/contracts/logic/types";
import type { AssistantReply } from "../../packages/api-client/services/assistant/logic/types";
import { deferred, mountHook } from "./reactHarness";
const state = vi.hoisted(() => ({
  api: { assistant: vi.fn() as ReturnType<typeof vi.fn> | undefined },
  user: { id: 1 } as { id: number } | null,
  refreshSession: vi.fn(),
  refreshCart: vi.fn(),
}));
vi.mock("../../packages/storefront/screens/store_shell_screen", () => ({
  useStore: () => state,
}));
import { useAssistant } from "../../packages/storefront/screens/assistant_screen/logic/useAssistant";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
const id = "00000000-0000-4000-8000-000000000001";
const draft: AssistantReply = {
  status: "needs_input",
  message: "Email required",
  conversation_id: id,
  conversation_version: 1,
  available_actions: [],
  required_input: [{ field: "data.email", type: "string" }],
};
beforeEach(() => {
  state.api.assistant = vi.fn().mockResolvedValue(draft);
  state.user = { id: 1 };
  state.refreshSession.mockReset();
  state.refreshCart.mockReset();
});

it("discovers actions, collects typed fields, and confirms only the current preview", async () => {
  const hook = await mountHook(useAssistant);
  await act(async () => {
    await hook.value.discover();
  });
  expect(state.api.assistant).toHaveBeenLastCalledWith({ discover: true }, 1);
  expect(hook.value.field?.field).toBe("data.email");
  await act(async () => {
    hook.value.setValue("a@example.test");
  });
  const review: AssistantReply = {
    ...draft,
    status: "needs_confirmation",
    conversation_version: 2,
    required_input: [],
    available_actions: [
      {
        name: "login",
        description: "Sign in",
        method: "POST",
        path: "/auth/login",
        confirmation_required: true,
        natural_language_confirmation_required: true,
        allowed_roles: ["guest"],
        parameters: {},
      },
    ],
  };
  state.api.assistant?.mockResolvedValue(review);
  await act(async () => {
    await hook.value.submit();
  });
  expect(state.api.assistant).toHaveBeenLastCalledWith(
    {
      conversation_id: id,
      conversation_version: 1,
      data: { email: "a@example.test" },
    },
    1,
  );
  await act(async () => {
    await hook.value.confirm();
  });
  expect(state.api.assistant).toHaveBeenLastCalledWith(
    { conversation_id: id, conversation_version: 2, confirm: true },
    1,
  );
  await act(async () => {
    hook.value.reset();
  });
  expect(hook.value.reply).toBeNull();
  await act(async () => {
    await hook.value.confirm();
  });
  await hook.unmount();
});

it("sends natural language, handles invalid detail and confirmation, and retains ambiguous turns for safe retry", async () => {
  const hook = await mountHook(useAssistant);
  await act(async () => {
    hook.value.setMessage("Find shirts");
  });
  state.api.assistant?.mockRejectedValueOnce(
    new ApiError("Pending", 202, "timeout"),
  );
  await act(async () => {
    await hook.value.submit();
  });
  expect(hook.value.pending).toEqual({ message: "Find shirts" });
  await act(async () => {
    await hook.value.retry();
  });
  expect(state.api.assistant).toHaveBeenLastCalledWith(
    { message: "Find shirts" },
    1,
  );
  expect(hook.value.pending).toBeNull();
  await act(async () => {
    await hook.value.retry();
    await hook.value.confirm();
  });
  expect(hook.value.error).toContain("Review a current preview");
  state.api.assistant?.mockResolvedValue({
    ...draft,
    required_input: [{ field: "data.quantity", type: "integer" }],
  });
  await act(async () => {
    await hook.value.choose("updateCart");
  });
  await act(async () => {
    await hook.value.submit();
  });
  expect(hook.value.error).toContain("valid integer");
  await hook.unmount();
});

it("prevents duplicate presses and ignores responses after the conversation is unmounted", async () => {
  const waiting = deferred<AssistantReply>();
  state.api.assistant?.mockReturnValue(waiting.promise);
  const hook = await mountHook(useAssistant);
  let sending!: Promise<void>;
  await act(async () => {
    sending = hook.value.discover();
    await hook.value.discover();
    hook.value.reset();
  });
  expect(state.api.assistant).toHaveBeenCalledTimes(1);
  expect(hook.value.busy).toBe(true);
  await hook.unmount();
  await act(async () => {
    waiting.resolve(draft);
    await sending;
  });
});

it("clears definitive failures and reports an unavailable client", async () => {
  state.user = null;
  const hook = await mountHook(useAssistant);
  state.api.assistant?.mockRejectedValueOnce(
    new ApiError("Denied", 403, "forbidden"),
  );
  await act(async () => {
    await hook.value.choose("checkout");
  });
  expect(state.api.assistant).toHaveBeenLastCalledWith(
    { action: "checkout" },
    null,
  );
  expect(hook.value.error).toBe("Denied");
  expect(hook.value.pending).toBeNull();
  state.api.assistant = undefined;
  await act(async () => {
    await hook.value.discover();
  });
  expect(hook.value.error).toContain("unavailable");
  await hook.unmount();
});

it("reconciles successful authentication/cart commands and leaves queries unchanged", async () => {
  const hook = await mountHook(useAssistant);
  for (const action of [
    "auth.login",
    "cart.update",
    "checkout",
    "catalog",
    undefined,
  ]) {
    state.api.assistant?.mockResolvedValue({
      ...draft,
      status: "completed",
      executed_action: action,
    });
    await act(async () => {
      await hook.value.choose("action");
    });
  }
  expect(state.refreshSession).toHaveBeenCalledTimes(1);
  expect(state.refreshCart).toHaveBeenCalledTimes(2);
  await hook.unmount();
});

it("continues selected actions with typed details and discards late failures", async () => {
  state.api.assistant?.mockResolvedValue({
    ...draft,
    available_actions: [{ name: "login" }],
    required_input: [
      { field: "message", type: "string" },
      { field: "data.email", type: "string" },
    ],
  });
  const hook = await mountHook(useAssistant);
  await act(async () => {
    await hook.value.choose("login");
  });
  await act(async () => {
    hook.value.setValue("email");
  });
  await act(async () => {
    await hook.value.submit();
  });
  expect(state.api.assistant).toHaveBeenLastCalledWith(
    {
      conversation_id: id,
      conversation_version: 1,
      action: "login",
      data: { email: "email" },
    },
    1,
  );
  const waiting = deferred<AssistantReply>();
  state.api.assistant?.mockReturnValue(waiting.promise);
  let sending!: Promise<void>;
  await act(async () => {
    sending = hook.value.discover();
  });
  await hook.unmount();
  await act(async () => {
    waiting.reject(new Error("late"));
    await sending;
  });
});
