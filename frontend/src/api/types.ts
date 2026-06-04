export type ListingStatus = "draft" | "listed" | "reserved" | "sold" | "returned";
export type ListingStatusFilter = ListingStatus | "all";

export interface StoreSummary {
  id: string;
  name: string;
}

export interface Listing {
  id: string;
  title: string;
  subtitle: string;
  status: ListingStatus;
  priceCents: number;
  currency: "USD";
  category: string;
  store: StoreSummary;
  imageUrl: string;
  conditionGrade: "fair" | "good" | "very_good" | "excellent";
  details: string;
  includedAccessories: string[];
  reservedByBuyerId?: string;
  reservationId?: string;
  reservationExpiresAt?: string;
}

export interface ListingsFilters {
  category: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  status: ListingStatusFilter;
}

export interface ListingsQuery {
  page: number;
  pageSize: number;
  filters: ListingsFilters;
}

export interface ListingsPage {
  items: Listing[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface ReserveListingRequest {
  listingId: string;
  buyerId: string;
  idempotencyKey: string;
}

export interface ReserveListingSuccess {
  reservationId: string;
  listingId: string;
  buyerId: string;
  status: "active";
  expiresAt: string;
  idempotentReplay: boolean;
}

export type ApiErrorCode =
  | "already_reserved"
  | "listing_not_found"
  | "listing_not_reservable"
  | "idempotency_key_conflict"
  | "network_error"
  | "server_error"
  | "validation_error"
  | "unknown_error";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details: Record<string, unknown>;
  status?: number;
  transient: boolean;
}

export interface BackendErrorBody {
  error: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

export interface BackendReserveSuccess {
  reservation_id: string;
  listing_id: string;
  buyer_id: string;
  status: "active";
  expires_at: string;
  idempotent_replay: boolean;
}
