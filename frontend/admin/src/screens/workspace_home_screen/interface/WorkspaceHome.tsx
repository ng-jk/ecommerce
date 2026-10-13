import { Button, Copy, useStore } from "@portfolio/storefront";
import { router } from "expo-router";
import { AdminPage } from "../../admin_shell_screen";

export function WorkspaceHome() {
  const { user } = useStore();
  return <AdminPage title="Workspace">
    <Button title="Dashboard" onPress={() => router.replace("/")} />
    {!user ? <Copy>Sign in to view the workspace.</Copy> : <>
      <Button title="Organizations" onPress={() => router.push("/organizations")} />
      {user.role === "admin" && <>
        <Button title="Plugins" onPress={() => router.push("/plugins")} />
        <Button title="MiniApps" onPress={() => router.push("/miniapps")} />
      </>}
    </>}
  </AdminPage>;
}
