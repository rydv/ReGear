import type { Listing } from "../api/types";
import { CURRENT_BUYER_ID } from "../constants";

export const OTHER_BUYER_ID = "22222222-2222-4222-8222-222222222222";

export function createListingsFixture(nowMs: number = Date.now()): Listing[] {
  const currentUserExpiry = new Date(nowMs + 30 * 60 * 1000).toISOString();
  const otherUserExpiry = new Date(nowMs + 20 * 60 * 1000).toISOString();

  return [
    {
      id: "listing-camera-1",
      title: "Canon EOS R6 Mirrorless Kit",
      subtitle: "Full-frame body with RF 24-105mm lens",
      status: "listed",
      priceCents: 89900,
      currency: "USD",
      category: "Cameras",
      store: { id: "store-sf", name: "San Francisco" },
      imageUrl:
        "https://images.unsplash.com/photo-1510127034890-ba27508e9f1c?auto=format&fit=crop&w=640&q=80",
      conditionGrade: "excellent",
      details: "Shutter verified, sensor cleaned, light cosmetic wear.",
      includedAccessories: ["Lens", "Battery", "Charger"],
    },
    {
      id: "listing-audio-1",
      title: "Fender Mustang LT25 Amp",
      subtitle: "Compact modeling amp for home practice",
      status: "listed",
      priceCents: 24900,
      currency: "USD",
      category: "Audio",
      store: { id: "store-seattle", name: "Seattle" },
      imageUrl:
        "https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=640&q=80",
      conditionGrade: "very_good",
      details: "Tested across presets, input jack replaced.",
      includedAccessories: ["Power cable", "Manual"],
    },
    {
      id: "listing-tools-1",
      title: "DeWalt 20V Drill Driver Set",
      subtitle: "Brushless driver with two battery packs",
      status: "listed",
      priceCents: 15900,
      currency: "USD",
      category: "Tools",
      store: { id: "store-denver", name: "Denver" },
      imageUrl:
        "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=640&q=80",
      conditionGrade: "good",
      details: "Torque tested, chuck cleaned, batteries above 85%.",
      includedAccessories: ["Case", "2 batteries", "Charger"],
    },
    {
      id: "listing-instrument-1",
      title: "Yamaha FG830 Acoustic Guitar",
      subtitle: "Solid-top dreadnought with fresh strings",
      status: "listed",
      priceCents: 49900,
      currency: "USD",
      category: "Instruments",
      store: { id: "store-austin", name: "Austin" },
      imageUrl:
        "https://images.unsplash.com/photo-1510915361894-db8b60106cb1?auto=format&fit=crop&w=640&q=80",
      conditionGrade: "very_good",
      details: "Neck relief adjusted, fretboard conditioned.",
      includedAccessories: ["Gig bag", "Clip tuner"],
    },
    {
      id: "listing-camera-2",
      title: "Sony A7 III Body",
      subtitle: "Refurbished full-frame body, no lens",
      status: "reserved",
      priceCents: 129900,
      currency: "USD",
      category: "Cameras",
      store: { id: "store-nyc", name: "New York" },
      imageUrl:
        "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?auto=format&fit=crop&w=640&q=80",
      conditionGrade: "excellent",
      details: "Low shutter count, ports inspected, firmware updated.",
      includedAccessories: ["Body cap", "Battery", "Strap"],
      reservedByBuyerId: CURRENT_BUYER_ID,
      reservationId: "reservation-current",
      reservationExpiresAt: currentUserExpiry,
    },
    {
      id: "listing-audio-2",
      title: "Audio-Technica AT-LP120XUSB",
      subtitle: "Direct-drive turntable with cartridge",
      status: "reserved",
      priceCents: 34900,
      currency: "USD",
      category: "Audio",
      store: { id: "store-la", name: "Los Angeles" },
      imageUrl:
        "https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=640&q=80",
      conditionGrade: "good",
      details: "Motor calibrated, dust cover has minor scuffs.",
      includedAccessories: ["Dust cover", "USB cable"],
      reservedByBuyerId: OTHER_BUYER_ID,
      reservationId: "reservation-other",
      reservationExpiresAt: otherUserExpiry,
    },
    {
      id: "listing-tools-2",
      title: "Makita Circular Saw 7-1/4 in.",
      subtitle: "Corded saw inspected for workshop resale",
      status: "sold",
      priceCents: 21900,
      currency: "USD",
      category: "Tools",
      store: { id: "store-chicago", name: "Chicago" },
      imageUrl:
        "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=640&q=80",
      conditionGrade: "fair",
      details: "Blade guard tested, housing shows job-site wear.",
      includedAccessories: ["Blade", "Guide"],
    },
    {
      id: "listing-camera-3",
      title: "Nikon Z fc Silver Body",
      subtitle: "Retro mirrorless body with inspected controls",
      status: "listed",
      priceCents: 54900,
      currency: "USD",
      category: "Cameras",
      store: { id: "store-portland", name: "Portland" },
      imageUrl:
        "https://images.unsplash.com/photo-1500634245200-e5245c7574ef?auto=format&fit=crop&w=640&q=80",
      conditionGrade: "very_good",
      details: "Dials cleaned, EVF verified, body only.",
      includedAccessories: ["Body cap", "Battery"],
    },
  ];
}

export function cloneListings(listings: Listing[]): Listing[] {
  return structuredClone(listings);
}
