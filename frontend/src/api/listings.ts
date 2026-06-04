import { requestJson } from "./client";
import type {
  BackendReserveSuccess,
  ListingsPage,
  ListingsQuery,
  ReserveListingRequest,
  ReserveListingSuccess,
} from "./types";

function appendOptionalNumber(
  params: URLSearchParams,
  name: string,
  value: number | undefined,
) {
  if (typeof value === "number" && Number.isFinite(value)) {
    params.set(name, String(value));
  }
}

export function buildListingsPath(query: ListingsQuery): string {
  const params = new URLSearchParams();
  params.set("page", String(query.page));
  params.set("pageSize", String(query.pageSize));
  if (query.filters.category) {
    params.set("category", query.filters.category);
  }
  if (query.filters.status !== "all") {
    params.set("status", query.filters.status);
  }
  appendOptionalNumber(params, "minPriceCents", query.filters.minPriceCents);
  appendOptionalNumber(params, "maxPriceCents", query.filters.maxPriceCents);
  return `/listings?${params.toString()}`;
}

export async function fetchListings(query: ListingsQuery): Promise<ListingsPage> {
  return requestJson<ListingsPage>(buildListingsPath(query));
}

function mapReserveSuccess(response: BackendReserveSuccess): ReserveListingSuccess {
  return {
    reservationId: response.reservation_id,
    listingId: response.listing_id,
    buyerId: response.buyer_id,
    status: response.status,
    expiresAt: response.expires_at,
    idempotentReplay: response.idempotent_replay,
  };
}

export async function reserveListing(
  request: ReserveListingRequest,
): Promise<ReserveListingSuccess> {
  const response = await requestJson<BackendReserveSuccess>(
    `/listings/${request.listingId}/reserve`,
    {
      method: "POST",
      body: JSON.stringify({
        buyer_id: request.buyerId,
        idempotency_key: request.idempotencyKey,
      }),
    },
  );
  return mapReserveSuccess(response);
}

