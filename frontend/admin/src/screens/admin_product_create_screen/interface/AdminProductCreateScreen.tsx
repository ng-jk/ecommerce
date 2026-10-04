import { AdminPage } from "../../admin_shell_screen";
import { ProductForm } from "../../product_form_screen";
import { useAdminProductCreate } from "../logic/useAdminProductCreate";

export function AdminProductCreateScreen() {
  const { user, options } = useAdminProductCreate();
  return (
    <AdminPage title="Add product">
      {user?.role === "admin" && (
        <ProductForm initial={{ active: true }} options={options} />
      )}
    </AdminPage>
  );
}
