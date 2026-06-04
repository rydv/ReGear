import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: PaginationProps) {
  const boundedTotalPages = Math.max(1, totalPages);

  return (
    <nav className="pagination" aria-label="Listings pagination">
      <span>
        Page {page} of {boundedTotalPages} | {totalItems} listings
      </span>
      <div className="pagination__buttons">
        <button
          className="icon-button"
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= boundedTotalPages}
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
