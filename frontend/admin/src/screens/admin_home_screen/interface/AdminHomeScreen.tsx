import { Button, Copy, Field } from "@portfolio/storefront";
import { router } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";
import { useAdminHome } from "../logic/useAdminHome";

export function AdminHomeScreen() {
  const {
    user,
    busy,
    shop,
    email,
    setEmail,
    password,
    setPassword,
    signIn,
    signOut,
    changeShop,
  } = useAdminHome();
  return (
    <AdminPage title="Commerce Studio">
      <Copy>{shop}</Copy>
      {!user ? (
        <>
          <Field label="Email" value={email} onChangeText={setEmail} />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <Button
            title="Sign in"
            disabled={busy}
            onPress={() => {
              void signIn();
            }}
          />
        </>
      ) : user.role === "admin" ? (
        <>
          <Button title="Products" onPress={() => router.push("/products")} />
          <Button title="Orders" onPress={() => router.push("/orders")} />
          <Button
            title="Sign out"
            onPress={() => {
              void signOut();
            }}
          />
        </>
      ) : (
        <>
          <Copy>Administrator access is required.</Copy>
          <Button
            title="Sign out"
            onPress={() => {
              void signOut();
            }}
          />
        </>
      )}
      <Button
        title="Switch shop"
        disabled={busy}
        onPress={() => {
          void changeShop();
        }}
      />
      <Button title="Assistant" onPress={() => router.push("/assistant")} />
    </AdminPage>
  );
}
