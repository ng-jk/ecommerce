import type { ReactNode } from "react";
import { PlatformSessionContext } from "../logic/context";
import { usePlatformProvider } from "../logic/usePlatformProvider";

export function PlatformProvider({ children }: { children: ReactNode }) {
  const session = usePlatformProvider();
  return (
    <PlatformSessionContext.Provider value={session}>
      {children}
    </PlatformSessionContext.Provider>
  );
}
