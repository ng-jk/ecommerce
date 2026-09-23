import { AdminPage } from "../../components/AdminPage";
import { useCreateProduct } from "../../view-models/useCreateProduct";
import { Form } from "./Form";
export default function Create() {
  const { user, options } = useCreateProduct();
  return (
    <AdminPage title="Add product">
      {user?.role === "admin" && (
        <Form initial={{ active: true }} options={options} />
      )}
    </AdminPage>
  );
}
