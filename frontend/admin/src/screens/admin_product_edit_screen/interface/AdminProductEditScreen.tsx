import { AdminPage } from "../../admin_shell_screen";
import { ProductForm } from "../../product_form_screen";
import { useAdminProductEdit } from "../logic/useAdminProductEdit";

export function AdminProductEditScreen() {
  const { data } = useAdminProductEdit();
  return (
    <AdminPage title="Edit product">
      {data && (
        <ProductForm
          key={data.product.id}
          initial={data.product}
          options={data.options}
        />
      )}
    </AdminPage>
  );
}
