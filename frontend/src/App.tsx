import { useMemo, useState } from "react";

import type { ListingsFilters } from "./api/types";
import { ErrorBanner } from "./components/ErrorBanner";
import { FilterSidebar } from "./components/FilterSidebar";
import { ListingsList } from "./components/ListingsList";
import { Pagination } from "./components/Pagination";
import { CURRENT_BUYER_ID, PAGE_SIZE } from "./constants";
import { useExpireCurrentUserReservation } from "./hooks/useExpireCurrentUserReservation";
import { useListings } from "./hooks/useListings";
import {
  type ReserveActionError,
  useReserveListing,
} from "./hooks/useReserveListing";
import "./styles.css";

const initialFilters: ListingsFilters = {
  category: "",
  status: "all",
};

export function App() {
  const [filters, setFilters] = useState<ListingsFilters>(initialFilters);
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<ReserveActionError | null>(
    null,
  );

  const listingsQuery = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      filters,
    }),
    [filters, page],
  );
  const listings = useListings(listingsQuery);
  const expireCurrentUserReservation =
    useExpireCurrentUserReservation(CURRENT_BUYER_ID);
  const reserveFlow = useReserveListing({
    currentBuyerId: CURRENT_BUYER_ID,
    onActionError: setActionError,
  });

  const handleFiltersChange = (nextFilters: ListingsFilters) => {
    setFilters(nextFilters);
    setPage(1);
  };

  const currentPage = listings.data;

  return (
    <main className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">ReGear marketplace ops</p>
          <h1>Reservable refurbished gear</h1>
        </div>
        <span className="buyer-chip">Buyer {CURRENT_BUYER_ID.slice(0, 8)}</span>
      </header>

      {actionError ? (
        <ErrorBanner
          message={actionError.message}
          canRetry={actionError.canRetry}
          onRetry={
            actionError.canRetry
              ? () => reserveFlow.reserve(actionError.listingId)
              : undefined
          }
          onDismiss={() => setActionError(null)}
        />
      ) : null}

      <div className="marketplace-layout">
        <FilterSidebar filters={filters} onChange={handleFiltersChange} />

        <section className="listings-section" aria-labelledby="listings-heading">
          <div className="section-header">
            <div>
              <p className="eyebrow">Marketplace listings</p>
              <h2 id="listings-heading">Available unique units</h2>
            </div>
            {listings.isFetching && !listings.isLoading ? (
              <span className="refetching">Refreshing</span>
            ) : null}
          </div>

          <ListingsList
            listings={currentPage?.items ?? []}
            isLoading={listings.isLoading}
            isError={listings.isError}
            currentBuyerId={CURRENT_BUYER_ID}
            pendingIds={reserveFlow.pendingIds}
            onReserve={reserveFlow.reserve}
            onCurrentUserReservationExpired={expireCurrentUserReservation}
          />

          <Pagination
            page={page}
            totalItems={currentPage?.totalItems ?? 0}
            totalPages={currentPage?.totalPages ?? 1}
            onPageChange={setPage}
          />
        </section>
      </div>
    </main>
  );
}

export default App;
