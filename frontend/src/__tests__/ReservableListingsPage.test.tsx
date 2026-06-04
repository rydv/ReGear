import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import type { BackendReserveSuccess, Listing } from "../api/types";
import { CURRENT_BUYER_ID } from "../constants";
import { createListingsFixture } from "../mocks/fixtures";
import { resetMockState } from "../mocks/handlers";
import { server } from "../mocks/server";

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

function listedListing(id: string): Listing {
  return {
    id,
    title: "Canon EOS R6 Mirrorless Kit",
    subtitle: "Full-frame body with RF 24-105mm lens",
    status: "listed",
    priceCents: 89900,
    currency: "USD",
    category: "Cameras",
    store: { id: "store-test", name: "Test Store" },
    imageUrl:
      "https://images.unsplash.com/photo-1510127034890-ba27508e9f1c?auto=format&fit=crop&w=640&q=80",
    conditionGrade: "excellent",
    details: "Shutter verified, sensor cleaned, light cosmetic wear.",
    includedAccessories: ["Lens", "Battery", "Charger"],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function idempotencyKeyFromBody(body: unknown): string {
  if (!isRecord(body) || typeof body.idempotency_key !== "string") {
    return "";
  }
  return body.idempotency_key;
}

afterEach(() => {
  vi.useRealTimers();
});

function cardScope(listingId: string) {
  return within(screen.getByTestId(`listing-card-${listingId}`));
}

describe("Reservable listings page", () => {
  it("rolls back an optimistic reserve when the listing is already reserved", async () => {
    resetMockState([listedListing("listing-camera-1")]);
    server.use(
      http.post("*/listings/:listingId/reserve", async ({ params }) => {
        await delay(100);
        return HttpResponse.json(
          {
            error: {
              code: "already_reserved",
              message: "Listing is already reserved.",
              details: { listing_id: String(params.listingId) },
            },
          },
          { status: 409 },
        );
      }),
    );

    renderApp();
    const user = userEvent.setup();

    await screen.findByText("listing-camera-1");
    await user.click(screen.getByRole("button", { name: /reserve/i }));

    expect(cardScope("listing-camera-1").getByText("Reserved by you")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Listing was reserved by someone else.")).toBeInTheDocument();
    });
    expect(cardScope("listing-camera-1").getByText("Available")).toBeInTheDocument();
  });

  it("reuses the same idempotency key when retrying after a transient failure", async () => {
    resetMockState([listedListing("listing-camera-1")]);
    const seenKeys: string[] = [];

    server.use(
      http.post("*/listings/:listingId/reserve", async ({ request, params }) => {
        const body = await request.json();
        seenKeys.push(idempotencyKeyFromBody(body));

        if (seenKeys.length === 1) {
          return HttpResponse.json(
            {
              error: {
                code: "server_error",
                message: "Temporary service issue.",
                details: {},
              },
            },
            { status: 500 },
          );
        }

        const response: BackendReserveSuccess = {
          reservation_id: "reservation-retry",
          listing_id: String(params.listingId),
          buyer_id: CURRENT_BUYER_ID,
          status: "active",
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          idempotent_replay: false,
        };
        resetMockState([
          {
            ...listedListing("listing-camera-1"),
            status: "reserved",
            reservedByBuyerId: CURRENT_BUYER_ID,
            reservationId: response.reservation_id,
            reservationExpiresAt: response.expires_at,
          },
        ]);
        return HttpResponse.json(response, { status: 201 });
      }),
    );

    renderApp();
    const user = userEvent.setup();

    await screen.findByText("listing-camera-1");
    await user.click(screen.getByRole("button", { name: /reserve/i }));
    await screen.findByText("Temporary service issue. Retry will reuse the same reserve key.");

    await user.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(seenKeys).toHaveLength(2);
      expect(seenKeys[0]).toBe(seenKeys[1]);
    });
    await waitFor(() => {
      expect(cardScope("listing-camera-1").getByText("Reserved by you")).toBeInTheDocument();
    });
  });

  it("returns a current-user reservation to available when the countdown expires", async () => {
    resetMockState([
      {
        ...listedListing("listing-camera-1"),
        status: "reserved",
        reservedByBuyerId: CURRENT_BUYER_ID,
        reservationId: "reservation-short",
        reservationExpiresAt: new Date(Date.now() + 500).toISOString(),
      },
    ]);

    renderApp();

    await screen.findByText("Reserved by you");
    expect(screen.getByText("00:01")).toBeInTheDocument();

    await waitFor(() => {
      expect(cardScope("listing-camera-1").getByText("Available")).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it("filters listings and pages through results", async () => {
    resetMockState(createListingsFixture());
    renderApp();
    const user = userEvent.setup();

    await screen.findByText("listing-camera-1");

    await user.click(screen.getByRole("button", { name: /next page/i }));
    await screen.findByText("listing-audio-2");

    await user.click(screen.getByRole("button", { name: "Audio" }));
    await screen.findByText("listing-audio-1");

    const results = screen.getByRole("list", { name: "Reservable listings" });
    expect(within(results).queryByText("listing-camera-1")).not.toBeInTheDocument();
  });
});
