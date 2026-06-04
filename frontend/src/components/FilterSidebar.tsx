import { SlidersHorizontal } from "lucide-react";

import type { ListingStatusFilter, ListingsFilters } from "../api/types";
import { CATEGORY_OPTIONS } from "../constants";

interface FilterSidebarProps {
  filters: ListingsFilters;
  onChange: (filters: ListingsFilters) => void;
}

const statusOptions: Array<{ value: ListingStatusFilter; label: string }> = [
  { value: "all", label: "All listings" },
  { value: "listed", label: "Available now" },
  { value: "reserved", label: "Reserved" },
  { value: "sold", label: "Sold" },
  { value: "returned", label: "Returned" },
  { value: "draft", label: "Draft" },
];

function dollarsToCents(value: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.round(parsed * 100);
}

function centsToDollars(value: number | undefined): string {
  if (typeof value !== "number") {
    return "";
  }
  return String(Math.round(value / 100));
}

export function FilterSidebar({ filters, onChange }: FilterSidebarProps) {
  const update = (next: Partial<ListingsFilters>) => {
    onChange({ ...filters, ...next });
  };

  return (
    <aside className="filter-sidebar" aria-label="Listing filters">
      <div className="filter-sidebar__header">
        <div>
          <p className="eyebrow">Filters</p>
          <h2>Find inventory</h2>
        </div>
        <SlidersHorizontal size={18} aria-hidden="true" />
      </div>

      <fieldset className="filter-group">
        <legend>Price</legend>
        <div className="price-inputs">
          <label className="field">
            <span>Min</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={centsToDollars(filters.minPriceCents)}
              onChange={(event) =>
                update({ minPriceCents: dollarsToCents(event.target.value) })
              }
            />
          </label>
          <label className="field">
            <span>Max</span>
            <input
              type="number"
              min="0"
              inputMode="numeric"
              value={centsToDollars(filters.maxPriceCents)}
              onChange={(event) =>
                update({ maxPriceCents: dollarsToCents(event.target.value) })
              }
            />
          </label>
        </div>
      </fieldset>

      <fieldset className="filter-group">
        <legend>Category</legend>
        <div className="filter-chips">
          <button
            className={`chip-button ${filters.category === "" ? "is-active" : ""}`}
            type="button"
            onClick={() => update({ category: "" })}
          >
            All
          </button>
          {CATEGORY_OPTIONS.map((category) => (
            <button
              className={`chip-button ${
                filters.category === category ? "is-active" : ""
              }`}
              key={category}
              type="button"
              onClick={() => update({ category })}
            >
              {category}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="filter-group">
        <legend>Status</legend>
        <div className="status-options">
          {statusOptions.map((option) => (
            <label className="radio-row" key={option.value}>
              <input
                type="radio"
                name="listing-status"
                value={option.value}
                checked={filters.status === option.value}
                onChange={() => update({ status: option.value })}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </aside>
  );
}

