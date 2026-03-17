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
  // Physics-based average-speed estimator.
  // IMPORTANT: elevation gain is treated as *extra energy* (m*g*gain), not a constant positive grade.
  // Using gain/dist as "grade" over-penalizes rolling courses.
  //
  // Model:
  // - Assume constant wheel power P
  // - Average speed v = dist / t
  // - Total work required:
  //     W = W_aero + W_roll + W_climb
  //   where
  //     W_aero  = 0.5 * rho * CdA * v^3 * t
  //            = 0.5 * rho * CdA * dist^3 / t^2
  //     W_roll  = Crr * m * g * dist
  //     W_climb = m * g * gain
  // - Solve for t such that P*t = W

  const P = clamp(Number(powerWatts), 1, 2000) * (1 - clamp(drivetrainLoss, 0, 0.2));
  const m = clamp(Number(athleteKg) + Number(bikeKg), 20, 200);
  const g = 9.80665;
  const rho = clamp(Number(airDensity), 0.9, 1.4);
  const CdA = clamp(Number(cdA), 0.15, 0.6);
  const Crr = clamp(Number(crr), 0.001, 0.02);

  const distM = clamp(Number(bikeMiles), 1, 200) * 1609.34;
  const gainM = Math.max(0, Number(elevationGainFt)) * 0.3048;

  const Wroll = Crr * m * g * distM;
  const Wclimb = m * g * gainM;

  const Waero = (t) => 0.5 * rho * CdA * (distM ** 3) / (t ** 2);
  const F = (t) => P * t - (Waero(t) + Wroll + Wclimb);

  // Search for time t in seconds.
  // Lower bound: insanely fast (2 hours for 112mi).
  // Upper bound: very slow (12 hours).
  let lo = 2 * 3600;
  let hi = 12 * 3600;

  // Ensure bounds bracket a root by expanding if needed.
  // F(t) increases with t (aero term falls with t^2), so F(lo) might be negative and F(hi) positive.
  for (let k = 0; k < 5 && F(hi) < 0; k++) hi *= 1.5;

  for (let iter = 0; iter < 70; iter++) {
    const mid = (lo + hi) / 2;
    if (F(mid) >= 0) hi = mid;
    else lo = mid;
  }

  const t = (lo + hi) / 2;
  const v = distM / t;
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
