import { router } from "expo-router";
import { View } from "react-native";
import {
  Button,
  Copy,
  Field,
  Heading,
  Loading,
  Page,
  Panel,
} from "../../store_shell_screen";
import { useAccount } from "../logic/useAccount";
export function AccountScreen() {
  const {
    user,
    ready,
    busy,
    register,
    setRegister,
    name,
    setName,
    email,
    setEmail,
    password,
    setPassword,
    submit,
    signOut,
  } = useAccount();
  return (
    <Page>
      <View
        style={{
          maxWidth: 520,
          width: "100%",
          alignSelf: "center",
          gap: 24,
          paddingVertical: 20,
        }}
      >
        <Heading>
          {user
            ? `Hello, ${user.name.split(" ")[0]}.`
            : register
              ? "Make yourself at home."
              : "Good to see you."}
        </Heading>
        {!ready ? (
          <Loading />
        ) : user ? (
          <Panel>
            <Copy>{user.email}</Copy>
            <Button
              title="View my orders"
              onPress={() => router.push("/orders")}
            />
            <Button
              title="Continue shopping"
              secondary
              onPress={() => router.push("/")}
            />
            <Button
              title="Sign out"
              secondary
              disabled={busy}
              onPress={() => void signOut()}
            />
          </Panel>
        ) : (
          <Panel>
            <Copy muted>
              {register
                ? "Create an account for this shop."
                : "Sign in to your shop account."}
            </Copy>
            {register && (
              <Field
                label="Your name"
                value={name}
                onChangeText={setName}
                autoComplete="name"
              />
            )}
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete={register ? "new-password" : "current-password"}
            />
            {register && (
              <Copy size={12} muted>
                Use at least 10 characters.
              </Copy>
            )}
            <Button
              title={
                busy ? "Please wait…" : register ? "Create account" : "Sign in"
              }
              disabled={busy || !email || !password || (register && !name)}
              onPress={() => void submit()}
            />
            <Button
              secondary
              title={
                register
                  ? "Already a member? Sign in"
                  : "New here? Create account"
              }
              onPress={() => setRegister(!register)}
            />
          </Panel>
        )}
      </View>
    </Page>
  );
}
