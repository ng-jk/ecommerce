import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  PlatformButton,
  PlatformField,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { lendingPath } from "../logic/model";
import { useLendingDirectory, useLendingRecord } from "../logic/queries";
import { useLendingAction } from "../logic/actions";
import { ProductForm } from "./ProductForm";
import { ApplicationForm } from "./ApplicationForm";
import { FrozenTerms } from "./FrozenTerms";

export function LendingProductCreatePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const model = useLendingDirectory(id, "products");
  return (
    <PlatformPage title="Create lending product">
      {!model.user ? (
        <PlatformText>Sign in to create a product.</PlatformText>
      ) : model.result ? (
        <ProductForm organizationId={id} options={model.result.meta.options} />
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading product options…</PlatformText>
      )}
    </PlatformPage>
  );
}

export function LendingProductEditPage() {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const model = useLendingRecord(id, "products", recordId);
  const detail = model.result;
  return (
    <PlatformPage title="Edit lending product">
      {!model.user ? (
        <PlatformText>Sign in to edit a product.</PlatformText>
      ) : detail?.product ? (
        <ProductForm
          organizationId={id}
          initial={detail.product}
          options={detail.options}
        />
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading product…</PlatformText>
      )}
    </PlatformPage>
  );
}

export function LendingApplicationCreatePage() {
  const { id, productId } = useLocalSearchParams<{
    id: string;
    productId?: string;
  }>();
  const model = useLendingDirectory(id, "products");
  return (
    <PlatformPage title="Start application">
      {!model.user ? (
        <PlatformText>Sign in to apply.</PlatformText>
      ) : model.result ? (
        <>
          <PlatformText>
            Choose an active product from Products, then enter its ID and terms.
          </PlatformText>
          <ApplicationForm
            organizationId={id}
            {...(productId ? { selectedProductId: productId } : {})}
          />
        </>
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading products…</PlatformText>
      )}
    </PlatformPage>
  );
}

export function LendingApplicationEditPage() {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const model = useLendingRecord(id, "applications", recordId);
  const detail = model.result;
  return (
    <PlatformPage title="Edit application draft">
      {!model.user ? (
        <PlatformText>Sign in to edit your application.</PlatformText>
      ) : detail?.application ? (
        detail.application.status === "draft" ? (
          <ApplicationForm organizationId={id} initial={detail.application} />
        ) : (
          <PlatformText>Submitted terms are immutable.</PlatformText>
        )
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading application…</PlatformText>
      )}
    </PlatformPage>
  );
}

export function LendingReviewDecisionPage() {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const model = useLendingRecord(id, "reviews", recordId);
  const action = useLendingAction(id);
  const [note, setNote] = useState("");
  const detail = model.result;
  const record = detail?.application;
  return (
    <PlatformPage title="Decide application">
      <PlatformButton
        title="Review"
        secondary
        onPress={() => router.replace(lendingPath(id, "reviews", recordId))}
      />
      {!model.user ? (
        <PlatformText>Sign in to review applications.</PlatformText>
      ) : record ? (
        record.status === "submitted" && record.terms_snapshot ? (
          <>
            <PlatformText>
              Application #{record.id}; principal {record.principal_minor} minor
              units; first due {record.first_due_date}.
            </PlatformText>
            <FrozenTerms terms={record.terms_snapshot} />
            <PlatformField
              label="Decision note"
              value={note}
              onChangeText={setNote}
            />
            {action.fieldErrors.decision_note?.map((text, index) => (
              <PlatformText key={index}>{text}</PlatformText>
            ))}
            <PlatformButton
              title="Approve"
              disabled={action.busy}
              onPress={() => void action.decide(record, "approved", note)}
            />
            <PlatformButton
              title="Reject"
              disabled={action.busy}
              onPress={() => void action.decide(record, "rejected", note)}
            />
            {!!action.message && <PlatformText>{action.message}</PlatformText>}
          </>
        ) : (
          <PlatformText>
            {record.status === "submitted"
              ? "Submitted terms unavailable; decision disabled."
              : "Only submitted applications can be decided."}
          </PlatformText>
        )
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading review…</PlatformText>
      )}
    </PlatformPage>
  );
}
