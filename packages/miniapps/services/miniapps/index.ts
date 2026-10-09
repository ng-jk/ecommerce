import { createMiniappClient } from "./data/client";
import { validateLaunch, validateInput, capability } from "./logic/types";
import { createBridge, mountWebFrame } from "./logic/bridge";
import { nativeBootstrap, nativeReplyScript } from "./logic/nativeBootstrap";
export {
  createMiniappClient,
  validateLaunch,
  validateInput,
  capability,
  createBridge,
  mountWebFrame,
  nativeBootstrap,
  nativeReplyScript,
};
export type { Capability, Miniapp, Launch, AdminListing } from "./logic/types";
export type MiniappClient = ReturnType<
  typeof import("./data/client").createMiniappClient
>;
