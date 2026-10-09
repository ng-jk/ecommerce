import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import WebView from "react-native-webview";
import type { WebViewMessageEvent } from "react-native-webview";
import type { MiniappClient, Launch } from "../../../services/miniapps";
import {
  createBridge,
  nativeBootstrap,
  nativeReplyScript,
} from "../../../services/miniapps";
import { useLaunch } from "../logic/useLaunch";

export function Frame({
  client,
  id,
  launch,
  origin,
}: {
  client: MiniappClient;
  id: string;
  launch: Launch;
  origin: string;
}) {
  const ref = useRef<WebView>(null);
  const bridge = useRef(
    createBridge(
      launch,
      async (name, input) =>
        (await client.invoke(id, launch.id, name, input)).response,
    ),
  );
  const loads = useRef(0);
  const [phase, setPhase] = useState<"checking" | "active" | "blocked">(
    "checking",
  );
  useEffect(() => {
    let live = true;
    const mountedBridge = bridge.current;
    const remaining = Date.parse(launch.expires_at) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      mountedBridge.close();
      void Promise.resolve().then(() => {
        if (live) setPhase("blocked");
      });
      return () => {
        live = false;
        mountedBridge.close();
      };
    }
    void Promise.resolve().then(() => {
      if (live) setPhase("active");
    });
    const timer =
      remaining < 2147483647
        ? setTimeout(() => {
            mountedBridge.close();
            setPhase("blocked");
          }, remaining)
        : null;
    return () => {
      live = false;
      if (timer !== null) clearTimeout(timer);
      mountedBridge.close();
    };
  }, [launch.expires_at]);
  const permitted = (url: string) => {
    try {
      const parsed = new URL(url);
      return (
        parsed.origin === new URL(origin).origin &&
        parsed.pathname.startsWith(`/miniapp-assets/${launch.digest}/`)
      );
    } catch {
      return false;
    }
  };
  const receive = (event: WebViewMessageEvent) => {
    if (phase !== "active" || !permitted(event.nativeEvent.url)) return;
    if (event.nativeEvent.data.length > 16384) return;
    let raw: unknown;
    try {
      raw = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    void bridge.current.receive(raw, (message) =>
      ref.current?.injectJavaScript(nativeReplyScript(message)),
    );
  };
  if (phase !== "active")
    return (
      <Text>
        {phase === "checking"
          ? "Checking MiniApp launch…"
          : "MiniApp navigation ended this session. Reopen it from the list."}
      </Text>
    );
  return (
    <WebView
      ref={ref}
      source={{ uri: launch.entry_url }}
      style={{ flex: 1, minHeight: 500 }}
      originWhitelist={[origin]}
      onShouldStartLoadWithRequest={(request) => permitted(request.url)}
      onLoadStart={() => {
        loads.current++;
        if (loads.current > 1) {
          bridge.current.close();
          setPhase("blocked");
        }
      }}
      onMessage={receive}
      injectedJavaScriptBeforeContentLoaded={nativeBootstrap(launch)}
      javaScriptEnabled
      domStorageEnabled={false}
      incognito
      cacheEnabled={false}
      thirdPartyCookiesEnabled={false}
      sharedCookiesEnabled={false}
      setSupportMultipleWindows={false}
    />
  );
}

export function MiniappHostScreen({
  client,
  id,
  scope,
  origin,
  onBack,
}: {
  client: MiniappClient;
  id: string;
  scope: string;
  origin: string;
  onBack: () => void;
}) {
  const state = useLaunch(client, id, scope, origin);
  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Pressable accessibilityRole="button" onPress={onBack}>
        <Text>← MiniApps</Text>
      </Pressable>
      {state.error ? (
        <Text>{state.error}</Text>
      ) : state.launch ? (
        <Frame
          key={`${scope}.${id}.${state.launch.id}.${state.launch.digest}`}
          client={client}
          id={id}
          launch={state.launch}
          origin={state.launch.origin}
        />
      ) : (
        <Text>Opening MiniApp…</Text>
      )}
    </View>
  );
}
