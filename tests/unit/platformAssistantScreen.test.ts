// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";
import type { usePlatformAssistant } from "../../frontend/admin/src/screens/platform_assistant_screen/logic/usePlatformAssistant";
const state = vi.hoisted(() => ({ user: {id: 1} as {id: number} | null, replace: vi.fn() }));
let model: ReturnType<typeof usePlatformAssistant>;
vi.mock("../../frontend/admin/src/screens/platform_assistant_screen/logic/usePlatformAssistant", () => ({ usePlatformAssistant: () => model }));
vi.mock("@portfolio/storefront", async () => ({...await import("../../packages/storefront/services/assistant"),...await import("../../packages/storefront/screens/assistant_screen/logic/useAssistantSession")}));
vi.mock("expo-router", () => ({router: {replace: state.replace}}));
vi.mock("../../frontend/admin/src/screens/platform_shell_screen", () => ({
  usePlatformSession: () => state,
  PlatformPage: ({children, title}: {children: ReactNode; title: string}) => createElement("main", {}, title, children),
  PlatformText: ({children}: {children: ReactNode}) => createElement("p", {}, children),
  PlatformButton: ({title, disabled, onPress}: {title: string; disabled?: boolean; onPress(): void}) => createElement("button", {disabled, onClick: onPress}, title),
  PlatformField: ({label,value,onChangeText}: {label: string;value:string;onChangeText(value:string):void}) => createElement("input", {"aria-label":label,value,onInput:(e:React.FormEvent<HTMLInputElement>)=>onChangeText(e.currentTarget.value)}),
}));
import Screen from "../../frontend/admin/src/app/platform/assistant";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
beforeEach(() => {
  state.user={id:1}; state.replace.mockReset();
  model={reply:null,field:undefined,message:"",value:"",error:"",busy:false,pending:null,setMessage:vi.fn(),setValue:vi.fn(),discover:vi.fn(async()=>{}),choose:vi.fn(async()=>{}),submit:vi.fn(async()=>{}),confirm:vi.fn(async()=>{}),retry:vi.fn(async()=>{}),reset:vi.fn()};
});
async function mount() {
  const container=document.createElement("div"); const root=createRoot(container);
  const render=async()=>{await act(async()=>root.render(createElement(Screen)));}; await render();
  const click=async(title:string)=>{const button=Array.from(container.querySelectorAll("button")).find(b=>b.textContent===title); expect(button).toBeDefined(); await act(async()=>button?.click());};
  return {container,render,click,unmount:async()=>{await act(async()=>root.unmount());}};
}
it("requires standalone sign-in and routes back to workspaces", async()=>{
  state.user=null; const ui=await mount(); await ui.click("Workspaces"); await ui.click("Sign in");
  expect(state.replace.mock.calls).toEqual([["/platform/organizations"],["/platform/login"]]); await ui.unmount();
});
it("sends messages, discovers actions and shows safe previews and results", async()=>{
  const ui=await mount(); const input=ui.container.querySelector("input")!;
  await act(async()=>{input.value="Show my companies"; input.dispatchEvent(new Event("input",{bubbles:true}));});
  expect(model.setMessage).toHaveBeenCalledWith("Show my companies"); await ui.click("Send"); await ui.click("Available actions"); await ui.click("New request");
  model.reply={status:"needs_input",message:"Choose",required_input:[],available_actions:[{name:"companies",description:"List companies",method:"GET",path:"/companies",confirmation_required:false,natural_language_confirmation_required:true,allowed_roles:["member"],parameters:{}}],preview:{name:"Safe",token:"hidden"}};
  await ui.render(); await ui.click("List companies"); expect(model.choose).toHaveBeenCalledWith("companies"); expect(ui.container.textContent).not.toContain("hidden");
  model.reply={...model.reply,status:"completed",api_result:{company:{name:"Example"}}}; await ui.render(); expect(ui.container.textContent).toContain("Example"); expect(ui.container.querySelector("input")).toBeNull(); await ui.unmount();
});
it("collects typed fields, labels model enums and confirms or retries separately", async()=>{
  model.field={field:"data.name",type:"string"}; model.value="Merchant"; model.error="Try again"; model.busy=true;
  const ui=await mount(); expect(ui.container.textContent).toContain("Waiting for the platform worker");
  const input=ui.container.querySelector("input")!; await act(async()=>{input.value="Changed";input.dispatchEvent(new Event("input",{bubbles:true}));}); expect(model.setValue).toHaveBeenCalledWith("Changed");
  model.busy=false; model.field={field:"data.status",type:"string",enum:["new","open"],options:{new:"New",open:"Open"}}; model.value="new"; await ui.render(); await ui.click("data.status: New"); expect(model.setValue).toHaveBeenCalledWith("open");
  model.value="open"; model.field={field:"data.status",type:"string",enum:["new","open"]}; await ui.render(); await ui.click("data.status: open");
  model.value=""; await ui.render(); await ui.click("data.status: Choose an option");
  model.field={field:"data.enabled",type:"boolean"}; await ui.render(); await ui.click("data.enabled: Choose an option");
  model.reply={status:"needs_confirmation",message:"Review",available_actions:[],required_input:[]}; await ui.render(); await ui.click("Confirm reviewed action"); expect(model.confirm).toHaveBeenCalledOnce();
  model.pending={discover:true}; await ui.render(); await ui.click("Retry the same request"); expect(model.retry).toHaveBeenCalledOnce(); await ui.unmount();
});
