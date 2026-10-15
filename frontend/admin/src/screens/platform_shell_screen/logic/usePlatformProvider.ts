import { ApiError, errorMessage } from "@portfolio/api-client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPlatformSessionClient } from "../../../services/platform_session";
import type { PlatformIdentity, PlatformSession } from "./context";

export function usePlatformProvider(): PlatformSession {
  const { api, storage } = useMemo(() => createPlatformSessionClient(), []);
  const [user, setUser] = useState<PlatformIdentity | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    try {
      if (!(await storage.get("token"))) {
        setUser(null);
        return;
      }
      setUser((await api.me()).user);
      setMessage("");
    } catch (error) {
      setUser(null);
      if (
        error instanceof ApiError &&
        ["unauthenticated", "forbidden"].includes(error.kind)
      ) {
        await storage.clear?.();
      } else {
        setMessage(errorMessage(error));
      }
    } finally {
      setLoading(false);
    }
  }, [api, storage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  const login = async (
    email: string,
    password: string,
    deviceName: string,
  ): Promise<boolean> => {
    setBusy(true);
    setMessage("");
    try {
      const result = await api.login({
        email,
        password,
        device_name: deviceName,
      });
      await storage.set("token", result.token);
      setUser(result.user);
      return true;
    } catch (error) {
      setMessage(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    confirmation: string,
    deviceName: string,
  ): Promise<boolean> => {
    setBusy(true);
    setMessage("");
    try {
      const result = await api.register({
        name,
        email,
        password,
        password_confirmation: confirmation,
        device_name: deviceName,
      });
      await storage.set("token", result.token);
      setUser(result.user);
      return true;
    } catch (error) {
      setMessage(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const logout = async (): Promise<boolean> => {
    setBusy(true);
    setMessage("");
    try {
      await api.logout();
      await storage.clear?.();
      setUser(null);
      return true;
    } catch (error) {
      setMessage(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    api,
    user,
    busy,
    loading,
    message,
    login,
    register,
    logout,
    refresh,
    clearMessage: () => setMessage(""),
  };
}
