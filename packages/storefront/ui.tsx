import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "./context";

export function Copy({
  children,
  size = 15,
  muted = false,
  bold = false,
}: {
  children: React.ReactNode;
  size?: number;
  muted?: boolean;
  bold?: boolean;
}) {
  const { theme } = useStore();
  return (
    <Text
      style={{
        color: muted ? theme.muted : theme.ink,
        fontSize: size,
        lineHeight: size * 1.5,
        fontWeight: bold ? "600" : "400",
      }}
    >
      {children}
    </Text>
  );
}
export function Heading({ children }: { children: React.ReactNode }) {
  const { theme, shop } = useStore();
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontSize: 36,
        lineHeight: 44,
        fontWeight: shop === "fashion" ? "400" : "700",
        color: theme.ink,
        fontFamily:
          shop === "fashion" && Platform.OS === "web"
            ? "Georgia, serif"
            : undefined,
      }}
    >
      {children}
    </Text>
  );
}
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  const { theme, shop } = useStore();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        paddingVertical: 13,
        paddingHorizontal: 22,
        borderRadius: shop === "fashion" ? 3 : 12,
        borderWidth: 1,
        borderColor: secondary ? theme.line : theme.accent,
        backgroundColor: secondary ? "transparent" : theme.accent,
        opacity: disabled ? 0.45 : pressed ? 0.65 : 1,
        alignItems: "center",
        justifyContent: "center",
      })}
    >
      <Text
        style={{
          color: secondary
            ? theme.ink
            : shop === "fashion"
              ? "#fff"
              : "#162113",
          fontWeight: "600",
          fontSize: 14,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { theme } = useStore();
  return (
    <View style={{ gap: 7 }}>
      <Copy size={13} bold>
        {label}
      </Copy>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.muted}
        {...props}
        style={[
          {
            minHeight: 48,
            borderWidth: 1,
            borderColor: theme.line,
            borderRadius: 6,
            padding: 13,
            backgroundColor: theme.surface,
            color: theme.ink,
            fontSize: 16,
          },
          props.style,
        ]}
      />
    </View>
  );
}
export function Loading() {
  const { theme } = useStore();
  return (
    <ActivityIndicator
      color={theme.accent}
      style={{ padding: 40 }}
      accessibilityLabel="Loading"
    />
  );
}
export function Panel({ children }: { children: React.ReactNode }) {
  const { theme } = useStore();
  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.line,
        padding: 24,
        borderRadius: 12,
        gap: 18,
      }}
    >
      {children}
    </View>
  );
}
export function Page({
  children,
  scrollRef,
  onContentLayout,
}: {
  children: React.ReactNode;
  scrollRef?: React.RefObject<ScrollView | null>;
  onContentLayout?: (y: number) => void;
}) {
  const { theme, cart, user, message, setMessage, shop } = useStore();
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={{
            backgroundColor: theme.accent,
            padding: 8,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: shop === "fashion" ? "#fff" : "#162113",
              fontSize: 11,
              letterSpacing: 1,
            }}
          >
            A PORTFOLIO SHOP • DISCOVER SOMETHING GOOD
          </Text>
        </View>
        <View style={{ borderBottomWidth: 1, borderColor: theme.line }}>
          <View
            onLayout={(event) => onContentLayout?.(event.nativeEvent.layout.y)}
            style={{
              width: "100%",
              maxWidth: 1280,
              alignSelf: "center",
              paddingHorizontal: wide ? 48 : 20,
              paddingVertical: 22,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 18,
            }}
          >
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Home"
              onPress={() => router.push("/")}
            >
              <Text
                style={{
                  fontSize: 30,
                  fontWeight: shop === "fashion" ? "400" : "900",
                  letterSpacing: shop === "fashion" ? -1 : 2,
                  color: theme.ink,
                  fontFamily:
                    shop === "fashion" && Platform.OS === "web"
                      ? "Georgia, serif"
                      : undefined,
                }}
              >
                {theme.brand}
              </Text>
            </Pressable>
            {wide && (
              <Copy size={11} muted>
                {theme.label}
              </Copy>
            )}
            <View
              style={{
                flexDirection: "row",
                gap: wide ? 26 : 16,
                alignItems: "center",
              }}
            >
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push("/")}
              >
                <Copy size={13}>Shop</Copy>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push("/account")}
              >
                <Copy size={13}>{user ? "Account" : "Sign in"}</Copy>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                onPress={() => router.push("/cart")}
              >
                <Copy size={13} bold>
                  Bag ({cart.reduce((sum, line) => sum + line.quantity, 0)})
                </Copy>
              </Pressable>
            </View>
          </View>
        </View>
        <View
          style={{
            width: "100%",
            maxWidth: 1280,
            alignSelf: "center",
            padding: wide ? 48 : 20,
            gap: 28,
            flex: 1,
          }}
        >
          {!!message && (
            <View
              accessibilityRole="alert"
              style={{
                backgroundColor: theme.soft,
                padding: 18,
                borderRadius: 8,
                gap: 10,
              }}
            >
              <Copy>{message}</Copy>
              <Pressable
                accessibilityRole="button"
                onPress={() => setMessage("")}
              >
                <Copy size={12} bold>
                  Dismiss
                </Copy>
              </Pressable>
            </View>
          )}
          {children}
        </View>
        <View
          style={{
            borderTopWidth: 1,
            borderColor: theme.line,
            padding: 28,
            gap: 8,
            alignItems: "center",
          }}
        >
          <Copy bold>{theme.brand} / A little more intentional.</Copy>
          <Copy size={12} muted>
            Portfolio demonstration. Simulated payments. Prices in MYR.
          </Copy>
          <Copy size={12} muted>
            Designed & built by Ng Jun Kai · Laravel + Expo
          </Copy>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
export function SignInRequired() {
  return (
    <Panel>
      <Heading>Your space, your shop.</Heading>
      <Copy muted>Sign in to save your bag and keep track of your orders.</Copy>
      <Button
        title="Sign in to continue"
        onPress={() => router.push("/account")}
      />
    </Panel>
  );
}
