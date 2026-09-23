import { AdminPage } from "../../components/AdminPage";
import { useEditProduct } from "../../view-models/useEditProduct";
import { Form } from "./Form";
export default function Edit() {
  const { data } = useEditProduct();
  return (
    <AdminPage title="Edit product">
      {data && (
        <Form
          key={data.product.id}
          initial={data.product}
          options={data.options}
        />
      )}
    </AdminPage>
  );
}
