import { Copy, useStore } from "@portfolio/storefront";
import { AdminPage } from "../../admin_shell_screen";
import { Form } from "../../organization_form_screen";

export function Create() {
  const { user } = useStore();
  return (
    <AdminPage title="Create organization">
      {user ? <Form /> : <Copy>Sign in to create an organization.</Copy>}
    </AdminPage>
  );
}
