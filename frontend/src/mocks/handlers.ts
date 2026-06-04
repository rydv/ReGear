import { delay, http, HttpResponse } from "msw";

import type {
  BackendErrorBody,
  BackendReserveSuccess,
  Listing,
  ListingStatus,
  ListingsPage,
} from "../api/types";
import { cloneListings, createListingsFixture } from "./fixtures";

let mockListings = createListingsFixture();

interface StoredIdempotencyResult {
  listingId: string;
  status: number;
  body: BackendReserveSuccess | BackendErrorBody;
}

const idempotencyResults = new Map<string, StoredIdempotencyResult>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resetExpiredReservations(nowMs: number) {
  mockListings = mockListings.map((listing) => {
    if (
      listing.status !== "reserved" ||
      !listing.reservationExpiresAt ||
      new Date(listing.reservationExpiresAt).getTime() > nowMs
    ) {
      return listing;
    }

    return {
      ...listing,
      status: "listed",
      reservedByBuyerId: undefined,
      reservationId: undefined,
      reservationExpiresAt: undefined,
    };
  });
}

function getNumberParam(url: URL, name: string): number | undefined {
  const raw = url.searchParams.get(name);
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getStatusParam(url: URL): ListingStatus | undefined {
  const raw = url.searchParams.get("status");
  if (
    raw === "draft" ||
    raw === "listed" ||
    raw === "reserved" ||
    raw === "sold" ||
    raw === "returned"
  ) {
    return raw;
  }
  return undefined;
}

function listResponse(request: Request): ListingsPage {
  resetExpiredReservations(Date.now());

  const url = new URL(request.url);
  const page = Math.max(1, getNumberParam(url, "page") ?? 1);
  const pageSize = Math.max(1, getNumberParam(url, "pageSize") ?? 5);
  const category = url.searchParams.get("category") ?? "";
  const status = getStatusParam(url);
  const minPriceCents = getNumberParam(url, "minPriceCents");
  const maxPriceCents = getNumberParam(url, "maxPriceCents");

  const filtered = mockListings.filter((listing) => {
    if (category && listing.category !== category) {
      return false;
    }
    if (status && listing.status !== status) {
      return false;
    }
    if (typeof minPriceCents === "number" && listing.priceCents < minPriceCents) {
      return false;
    }
    if (typeof maxPriceCents === "number" && listing.priceCents > maxPriceCents) {
      return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    page,
    pageSize,
    totalItems: filtered.length,
    totalPages,
  };
}

function errorBody(
  code: string,
  message: string,
  details: Record<string, unknown>,
): BackendErrorBody {
  return {
    error: {
      code,
      message,
      details,
    },
  };
}

function idempotencyScope(buyerId: string, key: string): string {
  return `${buyerId}:${key}`;
}

function readReserveBody(body: unknown): { buyerId: string; idempotencyKey: string } {
  if (
    !isRecord(body) ||
    typeof body.buyer_id !== "string" ||
    typeof body.idempotency_key !== "string"
  ) {
    throw new Error("Invalid reserve body.");
  }

  return {
    buyerId: body.buyer_id,
    idempotencyKey: body.idempotency_key,
  };
}

function storeResult(
  buyerId: string,
  idempotencyKey: string,
  listingId: string,
  status: number,
  body: BackendReserveSuccess | BackendErrorBody,
) {
  idempotencyResults.set(idempotencyScope(buyerId, idempotencyKey), {
    listingId,
    status,
    body,
  });
}

async function reserveResponse(request: Request, listingId: string) {
  const { buyerId, idempotencyKey } = readReserveBody(await request.json());
  const existing = idempotencyResults.get(idempotencyScope(buyerId, idempotencyKey));
  if (existing) {
    if (existing.listingId !== listingId) {
      return HttpResponse.json(
        errorBody(
          "idempotency_key_conflict",
          "Idempotency key was already used for a different request.",
          { idempotency_key: idempotencyKey },
        ),
        { status: 409 },
      );
    }
    return HttpResponse.json(existing.body, { status: existing.status });
  }

  resetExpiredReservations(Date.now());
  const listing = mockListings.find((item) => item.id === listingId);

  if (!listing) {
    const body = errorBody("listing_not_found", "Listing not found.", {
      listing_id: listingId,
    });
    storeResult(buyerId, idempotencyKey, listingId, 404, body);
    return HttpResponse.json(body, { status: 404 });
  }

  if (listing.status === "reserved") {
    const body = errorBody("already_reserved", "Listing is already reserved.", {
      listing_id: listingId,
      reserved_until: listing.reservationExpiresAt,
    });
    storeResult(buyerId, idempotencyKey, listingId, 409, body);
    return HttpResponse.json(body, { status: 409 });
  }

  if (listing.status !== "listed") {
    const body = errorBody("listing_not_reservable", "Listing is not reservable.", {
      listing_id: listingId,
      status: listing.status,
    });
    storeResult(buyerId, idempotencyKey, listingId, 409, body);
    return HttpResponse.json(body, { status: 409 });
  }

  const reservationId = `reservation-${listingId}`;
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const body: BackendReserveSuccess = {
    reservation_id: reservationId,
    listing_id: listingId,
    buyer_id: buyerId,
    status: "active",
    expires_at: expiresAt,
    idempotent_replay: false,
  };

  mockListings = mockListings.map((item): Listing => {
    if (item.id !== listingId) {
      return item;
    }
    return {
      ...item,
      status: "reserved",
      reservedByBuyerId: buyerId,
      reservationId,
      reservationExpiresAt: expiresAt,
    };
  });
  storeResult(buyerId, idempotencyKey, listingId, 201, body);

  await delay(80);
  return HttpResponse.json(body, { status: 201 });
}

export function resetMockState(listings: Listing[] = createListingsFixture()) {
  mockListings = cloneListings(listings);
  idempotencyResults.clear();
}

export const handlers = [
  http.get("*/listings", ({ request }) => HttpResponse.json(listResponse(request))),
  http.post("*/listings/:listingId/reserve", ({ request, params }) => {
    const listingId = String(params.listingId);
    return reserveResponse(request, listingId);
  }),
];

