import type { ReactNode } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  Pressable,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { usePlatformSession } from "../logic/context";

const ink = "#1c2935";
const accent = "#155e75";

export function PlatformPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { message } = usePlatformSession();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#f5f8fa" }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          width: "100%",
          maxWidth: 760,
          alignSelf: "center",
          padding: 24,
          gap: 18,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ color: ink, fontSize: 32, fontWeight: "700" }}
        >
          {title}
        </Text>
        {!!message && (
          <Text accessibilityRole="alert" style={{ color: "#a03232" }}>
            {message}
          </Text>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function PlatformText({ children }: { children: ReactNode }) {
  return (
    <Text style={{ color: ink, fontSize: 16, lineHeight: 24 }}>{children}</Text>
  );
}

export function PlatformField({
  label,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: ink, fontWeight: "600" }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#61717c"
        {...props}
        style={[
          {
            minHeight: 48,
            borderWidth: 1,
            borderColor: "#a8b8c2",
            borderRadius: 8,
            backgroundColor: "#fff",
            padding: 12,
            color: ink,
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function PlatformButton({
  title,
  onPress,
  disabled = false,
  secondary = false,
}: {
  title: string;
  onPress(): void;
  disabled?: boolean;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 48,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: accent,
        backgroundColor: secondary ? "#fff" : accent,
        opacity: disabled ? 0.5 : 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
      }}
    >
      <Text style={{ color: secondary ? accent : "#fff", fontWeight: "600" }}>
        {title}
      </Text>
    </Pressable>
  );
}
