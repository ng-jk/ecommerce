import type { createPlatformClient } from "@portfolio/api-client";
import { createContext, useContext } from "react";

type PlatformClient = ReturnType<typeof createPlatformClient>;
export type PlatformIdentity = Awaited<
  ReturnType<PlatformClient["me"]>
>["user"];
export type PlatformSession = {
  api: PlatformClient;
  user: PlatformIdentity | null;
  busy: boolean;
  loading: boolean;
  message: string;
  login(email: string, password: string, deviceName: string): Promise<boolean>;
  register(
    name: string,
    email: string,
    password: string,
    confirmation: string,
    deviceName: string,
  ): Promise<boolean>;
  logout(): Promise<boolean>;
  refresh(): Promise<void>;
  clearMessage(): void;
};

export const PlatformSessionContext = createContext<PlatformSession | null>(
  null,
);

export function usePlatformSession(): PlatformSession {
  const session = useContext(PlatformSessionContext);
  if (!session) throw new Error("Platform session is unavailable.");
  return session;
}
