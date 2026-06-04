import {
  type QueryKey,
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { normalizeUnknownError } from "../api/client";
import { reserveListing } from "../api/listings";
import type { ApiErrorCode, Listing, ListingsPage } from "../api/types";
import { RESERVATION_TTL_MS } from "../constants";
import { listingsKeys } from "./useListings";
import { useStableIdempotencyKey } from "./useStableIdempotencyKey";

interface CacheSnapshot {
  queryKey: QueryKey;
  data: ListingsPage | undefined;
}

interface ReserveVariables {
  listingId: string;
  idempotencyKey: string;
}

interface ReserveContext {
  snapshots: CacheSnapshot[];
}

export interface ReserveActionError {
  code: ApiErrorCode;
  message: string;
  listingId: string;
  canRetry: boolean;
}

interface UseReserveListingOptions {
  currentBuyerId: string;
  onActionError: (error: ReserveActionError) => void;
}

function mapPageListing(
  page: ListingsPage,
  listingId: string,
  mapper: (listing: Listing) => Listing,
): ListingsPage {
  return {
    ...page,
    items: page.items.map((listing) =>
      listing.id === listingId ? mapper(listing) : listing,
    ),
  };
}

function updateListingAcrossCaches(
  queryClient: QueryClient,
  listingId: string,
  mapper: (listing: Listing) => Listing,
) {
  const cachedPages = queryClient.getQueriesData<ListingsPage>({
    queryKey: listingsKeys.root,
  });

  cachedPages.forEach(([queryKey, page]) => {
    if (!page) {
      return;
    }
    queryClient.setQueryData(queryKey, mapPageListing(page, listingId, mapper));
  });
}

function restoreSnapshots(queryClient: QueryClient, snapshots: CacheSnapshot[]) {
  snapshots.forEach((snapshot) => {
    queryClient.setQueryData(snapshot.queryKey, snapshot.data);
  });
}

function toUserMessage(code: ApiErrorCode): string {
  switch (code) {
    case "already_reserved":
      return "Listing was reserved by someone else.";
    case "listing_not_reservable":
      return "Listing is no longer reservable.";
    case "listing_not_found":
      return "Listing is no longer available.";
    case "idempotency_key_conflict":
      return "This reserve attempt cannot be retried with the current key.";
    case "network_error":
      return "Network request failed. Retry will reuse the same reserve key.";
    case "server_error":
      return "Temporary service issue. Retry will reuse the same reserve key.";
    case "validation_error":
      return "Reserve request validation failed.";
    case "unknown_error":
      return "Reserve request failed.";
  }
}

export function useReserveListing({
  currentBuyerId,
  onActionError,
}: UseReserveListingOptions) {
  const queryClient = useQueryClient();
  const { getKey, clearKey } = useStableIdempotencyKey(
    `reserve-${currentBuyerId}`,
  );
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());

  const mutation = useMutation({
    mutationFn: (variables: ReserveVariables) =>
      reserveListing({
        listingId: variables.listingId,
        buyerId: currentBuyerId,
        idempotencyKey: variables.idempotencyKey,
      }),
    onMutate: async (variables): Promise<ReserveContext> => {
      setPendingIds((previous) => new Set(previous).add(variables.listingId));
      await queryClient.cancelQueries({ queryKey: listingsKeys.root });
      const snapshots = queryClient
        .getQueriesData<ListingsPage>({ queryKey: listingsKeys.root })
        .map(([queryKey, data]) => ({ queryKey, data }));

      const optimisticExpiresAt = new Date(Date.now() + RESERVATION_TTL_MS).toISOString();
      updateListingAcrossCaches(queryClient, variables.listingId, (listing) => ({
        ...listing,
        status: "reserved",
        reservedByBuyerId: currentBuyerId,
        reservationExpiresAt: optimisticExpiresAt,
      }));

      return { snapshots };
    },
    onSuccess: (reservation, variables) => {
      clearKey(variables.listingId);
      updateListingAcrossCaches(queryClient, variables.listingId, (listing) => ({
        ...listing,
        status: "reserved",
        reservationId: reservation.reservationId,
        reservedByBuyerId: currentBuyerId,
        reservationExpiresAt: reservation.expiresAt,
      }));
      void queryClient.invalidateQueries({ queryKey: listingsKeys.root });
    },
    onError: (error, variables, context) => {
      if (context) {
        restoreSnapshots(queryClient, context.snapshots);
      }

      const apiError = normalizeUnknownError(error);
      if (!apiError.transient) {
        clearKey(variables.listingId);
      }

      onActionError({
        code: apiError.code,
        message: toUserMessage(apiError.code),
        listingId: variables.listingId,
        canRetry: apiError.transient,
      });
    },
    onSettled: (_data, _error, variables) => {
      if (!variables) {
        return;
      }
      setPendingIds((previous) => {
        const next = new Set(previous);
        next.delete(variables.listingId);
        return next;
      });
    },
  });

  const reserve = useCallback(
    (listingId: string) => {
      const idempotencyKey = getKey(listingId);
      mutation.mutate({ listingId, idempotencyKey });
    },
    [getKey, mutation],
  );

  return {
    reserve,
    pendingIds,
  };
}

