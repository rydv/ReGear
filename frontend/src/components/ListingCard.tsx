import { Heart, MapPin, PackageCheck, ShoppingBag, Tag } from "lucide-react";

import type { Listing } from "../api/types";
import { ReservationCountdown } from "./ReservationCountdown";

interface ListingCardProps {
  listing: Listing;
  currentBuyerId: string;
  isPending: boolean;
  onReserve: (listingId: string) => void;
  onCurrentUserReservationExpired: (listingId: string) => void;
}

function formatCurrency(priceCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(priceCents / 100);
}

function statusLabel(listing: Listing, currentBuyerId: string): string {
  if (listing.status === "listed") {
    return "Available";
  }
  if (
    listing.status === "reserved" &&
    listing.reservedByBuyerId === currentBuyerId
  ) {
    return "Reserved by you";
  }
  if (listing.status === "reserved") {
    return "Reserved";
  }
  return listing.status.charAt(0).toUpperCase() + listing.status.slice(1);
}

function conditionLabel(condition: Listing["conditionGrade"]): string {
  return condition
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ListingCard({
  listing,
  currentBuyerId,
  isPending,
  onReserve,
  onCurrentUserReservationExpired,
}: ListingCardProps) {
  const isCurrentUserReservation =
    listing.status === "reserved" &&
    listing.reservedByBuyerId === currentBuyerId &&
    Boolean(listing.reservationExpiresAt);
  const canReserve = listing.status === "listed" && !isPending;

  return (
    <article className="listing-card" data-testid={`listing-card-${listing.id}`}>
      <div className="listing-media">
        <img src={listing.imageUrl} alt={listing.title} loading="lazy" />
      </div>

      <div className="listing-copy">
        <div className="listing-copy__top">
          <div>
            <p className="listing-category">{listing.category}</p>
            <h3>{listing.title}</h3>
            <p className="listing-subtitle">{listing.subtitle}</p>
            <p className="listing-id">{listing.id}</p>
          </div>
          <span className={`status-pill status-pill--${listing.status}`}>
            {statusLabel(listing, currentBuyerId)}
          </span>
        </div>

        <p className="listing-details">{listing.details}</p>

        <dl className="listing-meta">
          <div>
            <dt>
              <Tag size={15} aria-hidden="true" />
              Grade
            </dt>
            <dd>{conditionLabel(listing.conditionGrade)}</dd>
          </div>
          <div>
            <dt>
              <MapPin size={15} aria-hidden="true" />
              Store
            </dt>
            <dd>{listing.store.name}</dd>
          </div>
          <div>
            <dt>
              <PackageCheck size={15} aria-hidden="true" />
              Includes
            </dt>
            <dd>{listing.includedAccessories.join(", ")}</dd>
          </div>
        </dl>
      </div>

      <div className="listing-action-panel">
        <p className="listing-price">
          {formatCurrency(listing.priceCents, listing.currency)}
        </p>
        {isCurrentUserReservation && listing.reservationExpiresAt ? (
          <div className="hold-panel">
            <span>Hold expires</span>
            <ReservationCountdown
              expiresAt={listing.reservationExpiresAt}
              onExpire={() => onCurrentUserReservationExpired(listing.id)}
            />
          </div>
        ) : (
          <p className="muted">30 minute hold</p>
        )}

        <div className="listing-actions">
          <button
            className="icon-button"
            type="button"
            aria-label={`Save ${listing.title}`}
            title="Save listing"
          >
            <Heart size={18} aria-hidden="true" />
          </button>
          <button
            className="button button--primary"
            type="button"
            disabled={!canReserve}
            aria-busy={isPending}
            onClick={() => onReserve(listing.id)}
          >
            <ShoppingBag size={16} aria-hidden="true" />
            {isPending ? "Reserving" : "Reserve"}
          </button>
        </div>
      </div>
    </article>
  );
}
