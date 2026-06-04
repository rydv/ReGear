import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import type { ListingsPage } from "../api/types";
import { listingsKeys } from "./useListings";

export function useExpireCurrentUserReservation(currentBuyerId: string) {
  const queryClient = useQueryClient();

  return useCallback(
    (listingId: string) => {
      const cachedPages = queryClient.getQueriesData<ListingsPage>({
        queryKey: listingsKeys.root,
      });

      cachedPages.forEach(([queryKey, page]) => {
        if (!page) {
          return;
        }

        queryClient.setQueryData<ListingsPage>(queryKey, {
          ...page,
          items: page.items.map((listing) => {
            if (
              listing.id !== listingId ||
              listing.reservedByBuyerId !== currentBuyerId
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
          }),
        });
      });

      void queryClient.invalidateQueries({ queryKey: listingsKeys.root });
    },
    [currentBuyerId, queryClient],
  );
}

