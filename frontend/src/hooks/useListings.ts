import { useQuery } from "@tanstack/react-query";

import { fetchListings } from "../api/listings";
import type { ListingsQuery } from "../api/types";

export const listingsKeys = {
  root: ["listings"] as const,
  page: (query: ListingsQuery) => ["listings", query] as const,
};

export function useListings(query: ListingsQuery) {
  return useQuery({
    queryKey: listingsKeys.page(query),
    queryFn: () => fetchListings(query),
    staleTime: 20_000,
  });
}

