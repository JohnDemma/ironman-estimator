const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export const LEVELS = {
  beginner: {
    label: "Beginner",
    t1Min: 8,
    t2Min: 6,
    fadeHalf: 1.06,
    fadeFull: 1.10,
  },
  intermediate: {
    label: "Intermediate",
    t1Min: 6,
    t2Min: 4,
    fadeHalf: 1.04,
    fadeFull: 1.07,
  },
  advanced: {
    label: "Advanced",
    t1Min: 4,
    t2Min: 3,
    fadeHalf: 1.02,
    fadeFull: 1.04,
  },
};

export const DYNAMICS = {
  swimCurrent: {
    none: { label: "None", factor: 1.0 },
    mild: { label: "Mild", factor: 0.97 },
    strong: { label: "Strong", factor: 0.92 },
    // factor multiplies swim time (lower is faster)
  },
  bikeTerrain: {
    flat: { label: "Flat", factor: 1.0 },
    rolling: { label: "Rolling", factor: 1.05 },
    hilly: { label: "Hilly", factor: 1.12 },
    // factor multiplies bike time
  },
  runTerrain: {
    flat: { label: "Flat", factor: 1.0 },
    rolling: { label: "Rolling", factor: 1.04 },
    hilly: { label: "Hilly", factor: 1.09 },
    // factor multiplies run time
  },
  heat: {
    cool: { label: "Cool", factorHalf: 1.0, factorFull: 1.01 },
    warm: { label: "Warm", factorHalf: 1.02, factorFull: 1.04 },
    hot: { label: "Hot", factorHalf: 1.05, factorFull: 1.08 },
  },
};

function paceToSecondsPerYard(swimMinPer100Yd) {
  return (swimMinPer100Yd * 60) / 100;
}

function runPaceToSecondsPerMile(runMinPerMile) {
  return runMinPerMile * 60;
}

export function estimateBikeMphFromPower({
  powerWatts,
  athleteKg,
  bikeKg,
  cdA,
  crr,
  bikeMiles,
  elevationGainFt = 0,
  drivetrainLoss = 0.03,
  airDensity = 1.226,
}) {
  // Simple physics-based average-speed estimator.
  // Uses a constant "effective grade" derived from total elevation gain / distance.
  // This is not as accurate as integrating a full GPX grade profile, but it is a meaningful
  // step toward course-specific power modeling and matches real-world intuition.

  const P = clamp(Number(powerWatts), 1, 2000) * (1 - clamp(drivetrainLoss, 0, 0.2));
  const m = clamp(Number(athleteKg) + Number(bikeKg), 20, 200);
  const g = 9.80665;
  const rho = clamp(Number(airDensity), 0.9, 1.4);
  const CdA = clamp(Number(cdA), 0.15, 0.6);
  const Crr = clamp(Number(crr), 0.001, 0.02);

  const distM = clamp(Number(bikeMiles), 1, 200) * 1609.34;
  const gainM = Math.max(0, Number(elevationGainFt)) * 0.3048;
  const grade = clamp(gainM / distM, 0, 0.2);

  // Solve P = (aero + rolling + climbing) power at steady v.
  // aero: 0.5*rho*CdA*v^3
  // rolling: Crr*m*g*v
  // climbing (effective): m*g*grade*v
  const f = (v) => 0.5 * rho * CdA * v ** 3 + (Crr * m * g + m * g * grade) * v;

  // binary search for v in [0.5 m/s, 25 m/s] (~1 mph to 56 mph)
  let lo = 0.5;
  let hi = 25;
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > P) hi = mid;
    else lo = mid;
  }
  const v = (lo + hi) / 2;
  const mph = (v * 3600) / 1609.34;
  return mph;
}

function formatHMS(totalSeconds) {
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(ss)}`;
}

export function estimateFinish({
  race,
  swimMinPer100Yd,
  bikeMph,
  runMinPerMile,
  levelKey,
  overrides,
}) {
  if (!race) throw new Error("race required");

  const level = LEVELS[levelKey] ?? LEVELS.beginner;

  const dyn = {
    swimCurrent: overrides?.swimCurrent ?? race.dynamics?.swimCurrent ?? "none",
    bikeTerrain: overrides?.bikeTerrain ?? race.dynamics?.bikeTerrain ?? "flat",
    runTerrain: overrides?.runTerrain ?? race.dynamics?.runTerrain ?? "flat",
    heat: overrides?.heat ?? race.dynamics?.heat ?? "warm",
  };

  const isFull = race.distance === "140.6";

  // Baselines
  const swimSec = paceToSecondsPerYard(swimMinPer100Yd) * race.swimYards;
  const bikeSec = (race.bikeMiles / clamp(bikeMph, 1, 60)) * 3600;
  const runSec = runPaceToSecondsPerMile(runMinPerMile) * race.runMiles;

  // Dynamics adjustments
  const swimAdj = swimSec * (DYNAMICS.swimCurrent[dyn.swimCurrent]?.factor ?? 1.0);
  const bikeAdj = bikeSec * (DYNAMICS.bikeTerrain[dyn.bikeTerrain]?.factor ?? 1.0);

  const heat = DYNAMICS.heat[dyn.heat] ?? DYNAMICS.heat.warm;
  const heatFactor = isFull ? heat.factorFull : heat.factorHalf;

  const fade = isFull ? level.fadeFull : level.fadeHalf;

  const runAdj =
    runSec *
    (DYNAMICS.runTerrain[dyn.runTerrain]?.factor ?? 1.0) *
    heatFactor *
    fade;

  // Transitions
  const t1 = level.t1Min * 60;
  const t2 = level.t2Min * 60;

  const total = swimAdj + t1 + bikeAdj + t2 + runAdj;

  return {
    inputs: { swimMinPer100Yd, bikeMph, runMinPerMile, levelKey },
    dynamics: dyn,
    splitsSeconds: {
      swim: swimAdj,
      t1,
      bike: bikeAdj,
      t2,
      run: runAdj,
    },
    totalSeconds: total,
    splitsHMS: {
      swim: formatHMS(swimAdj),
      t1: formatHMS(t1),
      bike: formatHMS(bikeAdj),
      t2: formatHMS(t2),
      run: formatHMS(runAdj),
      total: formatHMS(total),
    },
  };
}

export { formatHMS };
