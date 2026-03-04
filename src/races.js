// Minimal race catalog (expandable). Distances in miles / yards.
// Notes: These are approximate; users should treat as estimates.

export const RACE_CATALOG = [
  // 140.6
  {
    id: "im-maryland-1406",
    brand: "IRONMAN",
    name: "IRONMAN Maryland",
    distance: "140.6",
    swimYards: 4224,
    bikeMiles: 112,
    runMiles: 26.2,
    dynamics: {
      // Choptank River / Chesapeake region — typically some current.
      swimCurrent: "mild",
      bikeTerrain: "flat",
      runTerrain: "flat",
      heat: "warm",
    },
  },
  {
    id: "im-florida-1406",
    brand: "IRONMAN",
    name: "IRONMAN Florida",
    distance: "140.6",
    swimYards: 4224,
    bikeMiles: 112,
    runMiles: 26.2,
    dynamics: {
      swimCurrent: "none",
      bikeTerrain: "flat",
      runTerrain: "flat",
      heat: "warm",
    },
  },
  {
    id: "im-lake-placid-1406",
    brand: "IRONMAN",
    name: "IRONMAN Lake Placid",
    distance: "140.6",
    swimYards: 4224,
    bikeMiles: 112,
    runMiles: 26.2,
    dynamics: {
      swimCurrent: "none",
      bikeTerrain: "hilly",
      runTerrain: "rolling",
      heat: "warm",
    },
  },
  {
    id: "im-cozumel-1406",
    brand: "IRONMAN",
    name: "IRONMAN Cozumel",
    distance: "140.6",
    swimYards: 4224,
    bikeMiles: 112,
    runMiles: 26.2,
    dynamics: {
      swimCurrent: "mild",
      bikeTerrain: "flat",
      runTerrain: "flat",
      heat: "hot",
    },
  },

  // 70.3
  {
    id: "im-703-north-carolina",
    brand: "IRONMAN",
    name: "IRONMAN 70.3 North Carolina",
    distance: "70.3",
    swimYards: 2112,
    bikeMiles: 56,
    runMiles: 13.1,
    dynamics: {
      swimCurrent: "mild",
      bikeTerrain: "flat",
      runTerrain: "flat",
      heat: "warm",
    },
  },
  {
    id: "im-703-maine",
    brand: "IRONMAN",
    name: "IRONMAN 70.3 Maine",
    distance: "70.3",
    swimYards: 2112,
    bikeMiles: 56,
    runMiles: 13.1,
    dynamics: {
      // Source: IRONMAN race page — "swift swim down the Kennebec River".
      swimCurrent: "strong",
      bikeTerrain: "hilly", // IRONMAN page: Bike: Hilly
      runTerrain: "rolling", // IRONMAN page: Run: Rolling
      heat: "warm", // July, listed high ~84F
    },
  },
  {
    id: "im-703-augusta",
    brand: "IRONMAN",
    name: "IRONMAN 70.3 Augusta",
    distance: "70.3",
    swimYards: 2112,
    bikeMiles: 56,
    runMiles: 13.1,
    dynamics: {
      // Downstream-assisted swim.
      swimCurrent: "strong",
      bikeTerrain: "rolling",
      runTerrain: "flat",
      heat: "warm",
    },
  },
  {
    id: "im-703-oceanside",
    brand: "IRONMAN",
    name: "IRONMAN 70.3 Oceanside",
    distance: "70.3",
    swimYards: 2112,
    bikeMiles: 56,
    runMiles: 13.1,
    dynamics: {
      swimCurrent: "none",
      bikeTerrain: "hilly",
      runTerrain: "flat",
      heat: "cool",
    },
  },
  {
    id: "im-703-chattanooga",
    brand: "IRONMAN",
    name: "IRONMAN 70.3 Chattanooga",
    distance: "70.3",
    swimYards: 2112,
    bikeMiles: 56,
    runMiles: 13.1,
    dynamics: {
      swimCurrent: "mild",
      bikeTerrain: "rolling",
      runTerrain: "flat",
      heat: "warm",
    },
  },
  {
    id: "im-703-st-george",
    brand: "IRONMAN",
    name: "IRONMAN 70.3 St. George",
    distance: "70.3",
    swimYards: 2112,
    bikeMiles: 56,
    runMiles: 13.1,
    dynamics: {
      swimCurrent: "none",
      bikeTerrain: "hilly",
      runTerrain: "hilly",
      heat: "warm",
    },
  },
];

export function getRaceById(id) {
  return RACE_CATALOG.find((r) => r.id === id) ?? null;
}
