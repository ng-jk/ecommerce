import type { LendingApplication, LendingProduct } from "@portfolio/api-client";
import { router, useLocalSearchParams } from "expo-router";
import {
  PlatformButton,
  PlatformPage,
  PlatformText,
} from "../../platform_shell_screen";
import { lendingPath, statusLabel } from "../logic/model";
import { useLendingRecord, useLendingSchedule } from "../logic/queries";
import { useLendingAction } from "../logic/actions";
import { FrozenTerms } from "./FrozenTerms";

export function LendingProductDetail() {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const model = useLendingRecord(id, "products", recordId);
  const detail = model.result;
  const product = detail?.product;
  return (
    <PlatformPage title="Lending product">
      <PlatformButton
        title="Products"
        secondary
        onPress={() => router.replace(lendingPath(id, "products"))}
      />
      {!model.user ? (
        <PlatformText>Sign in to view this product.</PlatformText>
      ) : product && detail ? (
        <ProductContent
          organizationId={id}
          product={product}
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

function ProductContent({
  organizationId,
  product,
  options,
}: {
  organizationId: string;
  product: LendingProduct;
  options: Record<string, string>;
}) {
  return (
    <>
      <PlatformText>
        {product.code} · {product.name} · {statusLabel(options, product.status)}
      </PlatformText>
      <PlatformText>
        {product.jurisdiction_label} · {product.currency} (
        {product.minor_unit_digits} minor digits)
      </PlatformText>
      <PlatformText>
        Principal: {product.principal_min_minor}–{product.principal_max_minor}{" "}
        minor units
      </PlatformText>
      <PlatformText>{product.terms_text}</PlatformText>
      <PlatformText>
        Flat whole-term rate: {product.term_rate_numerator}/
        {product.term_rate_denominator}; {product.installment_count}{" "}
        installments every {product.interval_days} days.
      </PlatformText>
      <PlatformButton
        title="Edit product"
        onPress={() =>
          router.push(
            `${lendingPath(organizationId, "products", product.id)}/edit`,
          )
        }
      />
      {product.status === "active" && (
        <PlatformButton
          title="Apply"
          onPress={() =>
            router.push(
              `${lendingPath(organizationId, "applications")}/create?productId=${product.id}`,
            )
          }
        />
      )}
    </>
  );
}

function ApplicationContent({
  organizationId,
  record,
  options,
  reload,
  review,
}: {
  organizationId: string;
  record: LendingApplication;
  options: Record<string, string>;
  reload: () => void;
  review: boolean;
}) {
  const action = useLendingAction(organizationId, reload);
  return (
    <>
      <PlatformText>
        Application #{record.id} · {statusLabel(options, record.status)}
      </PlatformText>
      <PlatformText>
        Product #{record.product_id}; principal {record.principal_minor} minor
        units; first due {record.first_due_date}
      </PlatformText>
      {!!record.purpose && (
        <PlatformText>Purpose: {record.purpose}</PlatformText>
      )}
      <FrozenTerms terms={record.terms_snapshot} />
      {review ? (
        record.status === "submitted" && (
          <PlatformButton
            title="Decide"
            onPress={() =>
              router.push(
                `${lendingPath(organizationId, "reviews", record.id)}/decide`,
              )
            }
          />
        )
      ) : (
        <>
          {record.status === "draft" && (
            <>
              <PlatformButton
                title="Edit draft"
                onPress={() =>
                  router.push(
                    `${lendingPath(organizationId, "applications", record.id)}/edit`,
                  )
                }
              />
              <PlatformButton
                title="Submit"
                disabled={action.busy}
                onPress={() => void action.submit(record)}
              />
            </>
          )}
          {(record.status === "draft" || record.status === "submitted") && (
            <PlatformButton
              title="Withdraw"
              disabled={action.busy}
              onPress={() => void action.withdraw(record)}
            />
          )}
          {record.status === "approved" && (
            <PlatformButton
              title="Schedule"
              onPress={() =>
                router.push(
                  `${lendingPath(organizationId, "applications", record.id)}/schedule`,
                )
              }
            />
          )}
        </>
      )}
      {!!action.message && <PlatformText>{action.message}</PlatformText>}
    </>
  );
}

function ApplicationDetail({ review }: { review: boolean }) {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const kind = review ? "reviews" : "applications";
  const model = useLendingRecord(id, kind, recordId);
  const detail = model.result;
  const record = detail?.application;
  return (
    <PlatformPage title={review ? "Application review" : "My application"}>
      <PlatformButton
        title={review ? "Reviews" : "Applications"}
        secondary
        onPress={() => router.replace(lendingPath(id, kind))}
      />
      {!model.user ? (
        <PlatformText>Sign in to view this application.</PlatformText>
      ) : record && detail ? (
        <ApplicationContent
          organizationId={id}
          record={record}
          options={detail.options}
          reload={model.retry}
          review={review}
        />
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

export const LendingApplicationDetail = () => (
  <ApplicationDetail review={false} />
);
export const LendingReviewDetail = () => <ApplicationDetail review />;

export function LendingSchedulePage() {
  const { id, recordId } = useLocalSearchParams<{
    id: string;
    recordId: string;
  }>();
  const model = useLendingSchedule(id, recordId);
  return (
    <PlatformPage title="Approved schedule">
      <PlatformButton
        title="Application"
        secondary
        onPress={() =>
          router.replace(lendingPath(id, "applications", recordId))
        }
      />
      {!model.user ? (
        <PlatformText>Sign in to view this schedule.</PlatformText>
      ) : model.result ? (
        <>
          <PlatformText>
            {model.result.currency}: principal {model.result.principal_minor},
            whole-term charge {model.result.charge_minor}, total{" "}
            {model.result.total_minor} minor units.
          </PlatformText>
          {model.result.installments.map((row) => (
            <PlatformText key={row.number}>
              #{row.number} {row.due_date}: principal {row.principal_minor},
              charge {row.charge_minor}, total {row.total_minor}
            </PlatformText>
          ))}
        </>
      ) : model.error ? (
        <>
          <PlatformText>{model.error}</PlatformText>
          <PlatformButton title="Retry" onPress={model.retry} />
        </>
      ) : (
        <PlatformText>Loading schedule…</PlatformText>
      )}
    </PlatformPage>
  );
}
