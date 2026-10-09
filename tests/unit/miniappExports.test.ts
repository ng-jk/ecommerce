import { expect, it, vi } from "vitest";
vi.mock("react-native", async () => import("./nativeUnitAdapters"));
import * as miniapps from "../../packages/miniapps/index";
import * as service from "../../packages/miniapps/services/miniapps/index";
import * as listing from "../../packages/miniapps/screens/miniapps_screen/index";
import * as host from "../../packages/miniapps/screens/miniapp_host_screen/index";
import * as admin from "../../packages/miniapps/screens/admin_miniapps_screen/index";
import * as create from "../../packages/miniapps/screens/miniapp_create_screen/index";
import * as edit from "../../packages/miniapps/screens/miniapp_edit_screen/index";
import * as form from "../../packages/miniapps/screens/miniapp_form_screen/index";

it("exposes every MiniApp capability through a stable public module entrypoint", () => {
  expect(miniapps.createMiniappClient).toBe(service.createMiniappClient);
  expect(typeof service.validateLaunch).toBe("function");
  expect(typeof service.createBridge).toBe("function");
  expect(typeof listing.MiniappsScreen).toBe("function");
  expect(typeof host.MiniappHostScreen).toBe("function");
  expect(typeof admin.AdminMiniappsScreen).toBe("function");
  expect(typeof create.MiniappCreateScreen).toBe("function");
  expect(typeof edit.MiniappEditScreen).toBe("function");
  expect(typeof form.MiniappForm).toBe("function");
});
