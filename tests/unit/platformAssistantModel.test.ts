// @vitest-environment jsdom
import { act } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { mountHook } from "./reactHarness";
const state = vi.hoisted(() => ({ api: { assistant: vi.fn() }, user: { id: 11 } as { id: number } | null, refresh: vi.fn() }));
vi.mock("../../frontend/admin/src/screens/platform_shell_screen", () => ({ usePlatformSession: () => state }));
vi.mock("@portfolio/storefront", async () => ({...await import("../../packages/storefront/services/assistant"),...await import("../../packages/storefront/screens/assistant_screen/logic/useAssistantSession")}));
import { usePlatformAssistant } from "../../frontend/admin/src/screens/platform_assistant_screen/logic/usePlatformAssistant";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
beforeEach(() => {
  state.user = { id: 11 };
  state.refresh.mockReset();
  state.api.assistant.mockReset().mockResolvedValue({status: "completed", message: "Done", available_actions: [], required_input: [], executed_action: "platform.auth.me"});
});
it("uses independent platform identity and refreshes auth changes", async () => {
  const hook = await mountHook(usePlatformAssistant);
  await act(async () => { await hook.value.discover(); });
  expect(state.api.assistant).toHaveBeenCalledWith({discover: true}, 11);
  expect(state.refresh).toHaveBeenCalledOnce();
  state.api.assistant.mockResolvedValue({status: "completed", message: "Done", available_actions: [], required_input: [], executed_action: "crm.companies.list"});
  await act(async () => { await hook.value.choose("crmCompanies"); });
  expect(state.refresh).toHaveBeenCalledOnce();
  state.user = null;
  await hook.rerender();
  state.api.assistant.mockResolvedValue({status: "completed", message: "Done", available_actions: [], required_input: []});
  await act(async () => { await hook.value.discover(); });
  expect(state.api.assistant).toHaveBeenLastCalledWith({discover: true}, null);
  await hook.unmount();
});
