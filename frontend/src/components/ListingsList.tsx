import type { Listing } from "../api/types";
import { ListingCard } from "./ListingCard";

interface ListingsListProps {
  listings: Listing[];
  isLoading: boolean;
  isError: boolean;
  currentBuyerId: string;
  pendingIds: ReadonlySet<string>;
  onReserve: (listingId: string) => void;
  onCurrentUserReservationExpired: (listingId: string) => void;
}

export function ListingsList({
  listings,
  isLoading,
  isError,
  currentBuyerId,
  pendingIds,
  onReserve,
  onCurrentUserReservationExpired,
}: ListingsListProps) {
  if (isLoading) {
    return <div className="result-state">Loading listings</div>;
  }

  if (isError) {
    return (
      <div className="result-state result-state--error">
        Listings could not be loaded.
      </div>
    );
  }

  if (listings.length === 0) {
    return <div className="result-state">No listings found.</div>;
  }

  return (
    <div className="listing-results" role="list" aria-label="Reservable listings">
      {listings.map((listing) => (
        <div role="listitem" key={listing.id}>
          <ListingCard
            listing={listing}
            currentBuyerId={currentBuyerId}
            isPending={pendingIds.has(listing.id)}
            onReserve={onReserve}
            onCurrentUserReservationExpired={onCurrentUserReservationExpired}
          />
        </div>
      ))}
    </div>
  );
}

