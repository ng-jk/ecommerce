import type { z } from "zod";
import { createTransport, type TransportOptions } from "../../transport";
import { createPlatformWorkspace } from "../../platform_workspace";
import { createCrmClient } from "../../crm";
import { createHelpdeskClient } from "../../helpdesk";
import { createInsightsClient } from "../../insights";
import { createLearningClient } from "../../learning";
import { createBuilderClient } from "../../builder";
import { createErpClient } from "../../erp";
import { createHrClient } from "../../hr";
import { createLendingClient } from "../../lending";
import { createPlatformSolutions } from "../../solutions";
import { assistantAdapter } from "../../assistant";
import {
  authenticatedIdentity,
  identityResult,
  loginInput,
  logoutResult,
  registerInput,
} from "../logic/contracts";

export function createPlatformClient(
  options: Omit<TransportOptions, "shop" | "platform">,
) {
  const request = createTransport({ ...options, platform: true });
  return {
    register: (input: z.input<typeof registerInput>) =>
      request(
        "auth/register",
        authenticatedIdentity,
        "POST",
        registerInput.parse(input),
      ),
    login: (input: z.input<typeof loginInput>) =>
      request(
        "auth/login",
        authenticatedIdentity,
        "POST",
        loginInput.parse(input),
      ),
    me: () => request("auth/me", identityResult),
    logout: () => request("auth/logout", logoutResult, "POST", {}),
    workspace: createPlatformWorkspace(request, "organizations"),
    solutions: createPlatformSolutions(request),
    crm: createCrmClient(request),
    helpdesk: createHelpdeskClient(request),
    learning: createLearningClient(request),
    insights: createInsightsClient(request),
    builder: createBuilderClient(request),
    erp: createErpClient(request),
    hr: createHrClient(request),
    lending: createLendingClient(request),
    assistant: assistantAdapter(
      request,
      options.storage,
      options.randomUUID,
      true,
    ),
  };
}
