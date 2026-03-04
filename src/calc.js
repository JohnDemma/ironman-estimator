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
