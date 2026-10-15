import { errorMessage } from "@portfolio/api-client";
import { useStore } from "@portfolio/storefront";
import { router } from "expo-router";
import { useCallback, useState } from "react";
import { useShopSolutionQuery } from "./useShopSolutionQuery";

export function useOfferings() {
  const { api, user } = useStore();
  const [page, setPage] = useState(1);
  const query = useShopSolutionQuery(
    useCallback(() => api.solutions.offerings(page), [api, page]),
  );
  return { user, page, setPage, query };
}

export function useOffering(id: string) {
  const { api } = useStore();
  return useShopSolutionQuery(
    useCallback(() => api.solutions.offering(id), [api, id]),
  );
}

export function usePublishOffering() {
  const { api, run, busy } = useStore();
  const [productId, setProductId] = useState("");
  const [applicationKey, setApplicationKey] = useState("crm");
  const [deliverables, setDeliverables] = useState("");
  const [error, setError] = useState("");
  async function save() {
    setError("");
    await run(async () => {
      try {
        const result = await api.solutions.publish({
          product_id: Number(productId),
          application_key: applicationKey,
          deliverables: deliverables
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
        });
        router.replace(`/solutions/offerings/${result.offering.id}`);
      } catch (reason) {
        setError(errorMessage(reason));
        throw reason;
      }
    });
  }
  return {
    productId,
    setProductId,
    applicationKey,
    setApplicationKey,
    deliverables,
    setDeliverables,
    busy,
    error,
    save,
  };
}

export function useSolutionPurchases(id: string) {
  const { api, user } = useStore();
  const [page, setPage] = useState(1);
  const query = useShopSolutionQuery(
    useCallback(() => api.solutions.purchases(id, page), [api, id, page]),
    !!user,
  );
  return { user, page, setPage, query };
}

export function useSolutionPurchase(id: string, purchaseId: string) {
  const { api, user, run, busy } = useStore();
  const query = useShopSolutionQuery(
    useCallback(
      () => api.solutions.purchase(id, purchaseId),
      [api, id, purchaseId],
    ),
    !!user,
  );
  const [error, setError] = useState("");
  async function retry() {
    setError("");
    await run(async () => {
      try {
        await api.solutions.retry(id, purchaseId);
        query.retry();
      } catch (reason) {
        setError(errorMessage(reason));
        throw reason;
      }
    });
  }
  return { user, query, busy, error, retry };
}

export function useBindSolution(id: string) {
  const { api, run, busy } = useStore();
  const [offeringId, setOfferingId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");
  async function save() {
    setError("");
    await run(async () => {
      try {
        const result = await api.solutions.bind(id, {
          offering_id: Number(offeringId),
          order_id: Number(orderId),
        });
        router.replace(
          `/organizations/${id}/solution-purchases/${result.purchase_id}`,
        );
      } catch (reason) {
        setError(errorMessage(reason));
        throw reason;
      }
    });
  }
  return { offeringId, setOfferingId, orderId, setOrderId, busy, error, save };
}
