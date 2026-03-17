import { useEffect, useMemo, useState } from "react";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
import "./app.css";
import { RACE_CATALOG, getRaceById } from "./races.generated";
import { DYNAMICS, LEVELS, estimateBikeMphFromPower, estimateFinish } from "./calc";

function groupRaces(races) {
  const groups = new Map();
  for (const r of races) {
    const k = r.distance;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  return Array.from(groups.entries()).sort((a, b) => (a[0] > b[0] ? -1 : 1));
}

function qsParse() {
  const p = new URLSearchParams(window.location.search);
  const o = {};
  for (const [k, v] of p.entries()) o[k] = v;
  return o;
}

function qsString(obj) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default function App() {
  const raceGroups = useMemo(() => groupRaces(RACE_CATALOG), []);

  const KM_PER_MILE = 1.60934;
  const MILES_PER_KM = 1 / KM_PER_MILE;
  const METERS_PER_YARD = 0.9144;

  const [raceId, setRaceId] = useState(RACE_CATALOG[0]?.id);
  const [levelKey, setLevelKey] = useState("beginner");
  const [units, setUnits] = useState("imperial"); // imperial | metric

  const [bikeModel, setBikeModel] = useState("speed"); // speed | power
  const [bikeWatts, setBikeWatts] = useState("180");
  const [athleteWeight, setAthleteWeight] = useState(units === "metric" ? "75" : "165");
  const [bikeWeight, setBikeWeight] = useState(units === "metric" ? "9" : "20");
  const [bikeSetup, setBikeSetup] = useState("tri"); // road | road_aerobars | tri
  const [aeroPos, setAeroPos] = useState("0.6"); // 0..1 (relaxed -> aggressive)
  const [advancedAero, setAdvancedAero] = useState(false);
  const [cdA, setCdA] = useState("0.28");
  const [crr, setCrr] = useState("0.004");

  // paces
  const [swim, setSwim] = useState("2:05"); // min:sec per 100yd
  const [bike, setBike] = useState("18.0"); // mph
  const [run, setRun] = useState("9:00"); // min:sec per mile

  // dynamics override (optional)
  const [dynOverride, setDynOverride] = useState(false);
  const [swimCurrent, setSwimCurrent] = useState("none");
  const [bikeTerrain, setBikeTerrain] = useState("flat");
  const [runTerrain, setRunTerrain] = useState("flat");
  const [heat, setHeat] = useState("warm");

  // init from querystring
  useEffect(() => {
    const q = qsParse();
    if (q.race) setRaceId(q.race);
    if (q.level) setLevelKey(q.level);
    if (q.units) setUnits(q.units);

    if (q.bm) setBikeModel(q.bm);
    if (q.w) setBikeWatts(q.w);
    if (q.aw) setAthleteWeight(q.aw);
    if (q.bw) setBikeWeight(q.bw);
    if (q.bs) setBikeSetup(q.bs);
    if (q.ap) setAeroPos(q.ap);
    if (q.adv === "1") setAdvancedAero(true);
    if (q.cda) setCdA(q.cda);
    if (q.crr) setCrr(q.crr);

    if (q.swim) setSwim(q.swim);
    if (q.bike) setBike(q.bike);
    if (q.run) setRun(q.run);
    if (q.dyn === "1") setDynOverride(true);
    if (q.cur) setSwimCurrent(q.cur);
    if (q.bt) setBikeTerrain(q.bt);
    if (q.rt) setRunTerrain(q.rt);
    if (q.heat) setHeat(q.heat);
  }, []);

  const race = useMemo(() => getRaceById(raceId), [raceId]);

  function formatMinSec(minFloat) {
    if (!Number.isFinite(minFloat) || minFloat <= 0) return "";
    const totalSec = Math.round(minFloat * 60);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  }

  function parseMinSecToMinutes(s) {
    const m = String(s).trim();
    if (!m) return NaN;
    if (m.includes(":")) {
      const [mm, ss] = m.split(":");
      const mins = Number(mm);
      const secs = Number(ss);
      return mins + secs / 60;
    }
    return Number(m);
  }

  function normalizePaceInput(raw) {
    // Goal: make mobile entry easy while still accepting m:ss.
    // - Allow digits and a single colon.
    // - If user types only digits, auto-insert a colon before the last 2 digits (e.g., 205 -> 2:05).
    const s = String(raw ?? "").trim();
    if (!s) return "";

    // keep only digits and colons
    let cleaned = s.replace(/[^0-9:]/g, "");

    // if user already typed a colon, normalize to one colon
    if (cleaned.includes(":")) {
      const parts = cleaned.split(":");
      const mm = (parts[0] ?? "").replace(/\D/g, "");
      const ss = (parts.slice(1).join("") ?? "").replace(/\D/g, "");
      const ss2 = ss.slice(0, 2);
      return ss2.length ? `${mm}:${ss2}` : `${mm}:`;
    }

    // digits-only: insert colon before last 2 digits when possible
    cleaned = cleaned.replace(/\D/g, "");
    if (cleaned.length <= 2) return cleaned; // let them type 2, 05, etc.

    const mm = cleaned.slice(0, -2);
    const ss = cleaned.slice(-2);
    return `${mm}:${ss}`;
  }

  function convertInputs(nextUnits) {
    // Convert existing input strings so the *performance* stays the same when toggling units.
    const swimMin = parseMinSecToMinutes(swim);
    const runMin = parseMinSecToMinutes(run);
    const bikeNum = Number(bike);
    const athleteNum = Number(athleteWeight);
    const bikeWeightNum = Number(bikeWeight);

    // swim: min/100yd <-> min/100m
    // 100yd = 91.44m; pace per 100m is slower by factor (100m / 91.44m) = 1.09361
    const SWIM_IMP_TO_MET = 1 / METERS_PER_YARD; // 1.09361
    const SWIM_MET_TO_IMP = METERS_PER_YARD; // 0.9144

    if (nextUnits === "metric" && units === "imperial") {
      if (Number.isFinite(swimMin)) setSwim(formatMinSec(swimMin * SWIM_IMP_TO_MET));
      if (Number.isFinite(runMin)) setRun(formatMinSec(runMin / KM_PER_MILE)); // min/mi -> min/km
      if (Number.isFinite(bikeNum)) setBike((bikeNum * KM_PER_MILE).toFixed(1)); // mph -> km/h
      if (Number.isFinite(athleteNum)) setAthleteWeight((athleteNum / 2.20462).toFixed(1)); // lb -> kg
      if (Number.isFinite(bikeWeightNum)) setBikeWeight((bikeWeightNum / 2.20462).toFixed(1)); // lb -> kg
    }

    if (nextUnits === "imperial" && units === "metric") {
      if (Number.isFinite(swimMin)) setSwim(formatMinSec(swimMin * SWIM_MET_TO_IMP));
      if (Number.isFinite(runMin)) setRun(formatMinSec(runMin * KM_PER_MILE)); // min/km -> min/mi
      if (Number.isFinite(bikeNum)) setBike((bikeNum * MILES_PER_KM).toFixed(1)); // km/h -> mph
      if (Number.isFinite(athleteNum)) setAthleteWeight((athleteNum * 2.20462).toFixed(0)); // kg -> lb
      if (Number.isFinite(bikeWeightNum)) setBikeWeight((bikeWeightNum * 2.20462).toFixed(0)); // kg -> lb
    }

    setUnits(nextUnits);
  }

  useEffect(() => {
    if (!race) return;
    // sync defaults from race when not overriding
    if (!dynOverride) {
      setSwimCurrent(race.dynamics.swimCurrent);
      setBikeTerrain(race.dynamics.bikeTerrain);
      setRunTerrain(race.dynamics.runTerrain);
      setHeat(race.dynamics.heat);
    }
  }, [raceId, dynOverride]);

  const parsed = useMemo(() => {
    const parseMinSec = (s) => {
      const m = String(s).trim();
      if (!m) return NaN;
      if (m.includes(":")) {
        const [mm, ss] = m.split(":");
        const mins = Number(mm);
        const secs = Number(ss);
        return mins + secs / 60;
      }
      return Number(m);
    };

    // Keep estimator math in imperial units internally.
    // Convert user inputs based on the selected unit system.
    const swimMinPer100 = parseMinSec(swim);
    const bikeSpeed = Number(bike);
    const runMinPer = parseMinSec(run);

    const athleteW = Number(athleteWeight);
    const bikeW = Number(bikeWeight);

    const swimMinPer100Yd = units === "metric" ? swimMinPer100 * 0.9144 : swimMinPer100; // per 100m -> per 100yd

    const runMinPerMile = units === "metric" ? runMinPer * KM_PER_MILE : runMinPer; // min/km -> min/mile

    const athleteKg = units === "metric" ? athleteW : athleteW / 2.20462;
    const bikeKg = units === "metric" ? bikeW : bikeW / 2.20462;

    // Preset-based aero/rolling assumptions with a single "position" slider.
    // These are intentionally conservative defaults.
    const preset = (() => {
      switch (bikeSetup) {
        case "road":
          return { cdAlo: 0.34, cdAhi: 0.38, crr: 0.0050 };
        case "road_aerobars":
          return { cdAlo: 0.28, cdAhi: 0.33, crr: 0.0045 };
        case "tri":
        default:
          return { cdAlo: 0.23, cdAhi: 0.29, crr: 0.0040 };
      }
    })();

    const pos = clamp(Number(aeroPos), 0, 1);
    const cdAEffective = advancedAero ? Number(cdA) : (preset.cdAhi + (preset.cdAlo - preset.cdAhi) * pos);
    const crrEffective = advancedAero ? Number(crr) : preset.crr;

    const elevationGainFt = race?.bikeElevationGainFt ?? 0;

    const bikeMph = bikeModel === "power"
      ? estimateBikeMphFromPower({
          powerWatts: Number(bikeWatts),
          athleteKg,
          bikeKg,
          cdA: cdAEffective,
          crr: crrEffective,
          bikeMiles: race?.bikeMiles ?? 0,
          elevationGainFt,
        })
      : (units === "metric" ? bikeSpeed * MILES_PER_KM : bikeSpeed);

    return {
      swimMinPer100Yd,
      bikeMph,
      runMinPerMile,
      athleteKg,
      bikeKg,
      elevationGainFt,
      cdAEffective,
      crrEffective,
    };
  }, [swim, bike, run, units, bikeModel, bikeWatts, athleteWeight, bikeWeight, bikeSetup, aeroPos, advancedAero, cdA, crr, race]);

  const result = useMemo(() => {
    if (!race) return null;
    if (![parsed.swimMinPer100Yd, parsed.bikeMph, parsed.runMinPerMile].every((x) => Number.isFinite(x) && x > 0)) {
      return null;
    }
    return estimateFinish({
      race,
      swimMinPer100Yd: parsed.swimMinPer100Yd,
      bikeMph: parsed.bikeMph,
      runMinPerMile: parsed.runMinPerMile,
      levelKey,
      overrides: dynOverride
        ? { swimCurrent, bikeTerrain, runTerrain, heat }
        : undefined,
    });
  }, [race, parsed, levelKey, dynOverride, swimCurrent, bikeTerrain, runTerrain, heat]);

  const shareUrl = useMemo(() => {
    const base = window.location.origin + window.location.pathname;
    const q = {
      race: raceId,
      level: levelKey,
      units,
      bm: bikeModel,
      w: bikeWatts,
      aw: athleteWeight,
      bw: bikeWeight,
      bs: bikeSetup,
      ap: aeroPos,
      adv: advancedAero ? "1" : "0",
      cda: cdA,
      crr,
      swim,
      bike,
      run,
      dyn: dynOverride ? "1" : "0",
      cur: swimCurrent,
      bt: bikeTerrain,
      rt: runTerrain,
      heat,
    };
    return base + qsString(q);
  }, [raceId, levelKey, units, bikeModel, bikeWatts, athleteWeight, bikeWeight, cdA, crr, swim, bike, run, dynOverride, swimCurrent, bikeTerrain, runTerrain, heat]);

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied.");
    } catch {
      prompt("Copy this link:", shareUrl);
    }
  }

  return (
    <div className="wrap">
      <header className="header">
        <div className="logo">IRONMAN TIME ESTIMATOR</div>
        <div className="tagline">old internet. new suffering.</div>
      </header>

      <main className="grid">
        <section className="card">
          <h2>1) Select your race and options</h2>
          <label className="label">
            Race
            <select value={raceId} onChange={(e) => setRaceId(e.target.value)}>
              {raceGroups.map(([dist, items]) => (
                <optgroup key={dist} label={`IRONMAN ${dist}`}
                >
                  {items.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <div className="row2">
            <label className="label">
              Units
              <select value={units} onChange={(e) => convertInputs(e.target.value)}>
                <option value="imperial">Imperial (yd/mi, mph, min/mi)</option>
                <option value="metric">Metric (m/km, km/h, min/km)</option>
              </select>
            </label>

            <label className="label">
              Level (transitions + fatigue)
              <select value={levelKey} onChange={(e) => setLevelKey(e.target.value)}>
                {Object.entries(LEVELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="row2">
            <label className="label">
              Bike input
              <select value={bikeModel} onChange={(e) => setBikeModel(e.target.value)}>
                <option value="speed">Speed</option>
                <option value="power">Power (watts)</option>
              </select>
            </label>
            <div />
          </div>

          {race && (
            <div className="tiny">
              {units === "metric" ? (
                <>
                  Swim {Math.round(race.swimYards * METERS_PER_YARD)} m • Bike {(race.bikeMiles * KM_PER_MILE).toFixed(1)} km • Run {(race.runMiles * KM_PER_MILE).toFixed(1)} km
                </>
              ) : (
                <>
                  Swim {race.swimYards} yd • Bike {race.bikeMiles} mi • Run {race.runMiles} mi
                </>
              )}
            </div>
          )}
        </section>

        <section className="card">
          <h2>2) Enter your race paces</h2>

          <div className="row3">
            <label className="label">
              {units === "metric" ? "Swim pace (100m)" : "Swim pace (100yd)"}
              <input
                value={swim}
                onChange={(e) => setSwim(normalizePaceInput(e.target.value))}
                placeholder="2:05"
                inputMode="numeric"
                pattern="[0-9:]*"
                autoComplete="off"
              />
              <div className="hint">format: m:ss</div>
            </label>
            <label className="label">
              {bikeModel === "power" ? "Bike power (watts)" : (units === "metric" ? "Bike speed (km/h)" : "Bike speed (mph)")}

              {bikeModel === "power" ? (
                <>
                  <input
                    value={bikeWatts}
                    onChange={(e) => setBikeWatts(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="180"
                    inputMode="decimal"
                    autoComplete="off"
                  />
                  <div className="hint">
                    Est. speed: {Number.isFinite(parsed.bikeMph) ? `${parsed.bikeMph.toFixed(1)} mph` : "–"}
                    {race?.bikeElevationGainFt ? ` • course gain: ${race.bikeElevationGainFt.toLocaleString()} ft` : ""}
                    {Number.isFinite(parsed.cdAEffective) ? ` • CdA ${parsed.cdAEffective.toFixed(2)}` : ""}
                    {Number.isFinite(parsed.crrEffective) ? ` • Crr ${parsed.crrEffective.toFixed(4)}` : ""}
                  </div>
                </>
              ) : (
                <>
                  <input
                    value={bike}
                    onChange={(e) => setBike(e.target.value)}
                    placeholder={units === "metric" ? "29.0" : "18.0"}
                    inputMode="decimal"
                  />
                  <div className="hint">avg speed</div>
                </>
              )}
            </label>
            <label className="label">
              {units === "metric" ? "Run pace (km)" : "Run pace (mile)"}
              <input
                value={run}
                onChange={(e) => setRun(normalizePaceInput(e.target.value))}
                placeholder={units === "metric" ? "5:35" : "9:00"}
                inputMode="numeric"
                pattern="[0-9:]*"
                autoComplete="off"
              />
              <div className="hint">format: m:ss</div>
            </label>
          </div>

          <div className="row2">
            {bikeModel === "power" ? (
              <label className="label">
                Athlete weight ({units === "metric" ? "kg" : "lb"})
                <input
                  value={athleteWeight}
                  onChange={(e) => setAthleteWeight(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder={units === "metric" ? "75" : "165"}
                  inputMode="decimal"
                  autoComplete="off"
                />
                <div className="hint">body weight</div>
              </label>
            ) : (
              <div />
            )}
            <div />
          </div>

          {bikeModel === "power" && (
            <>
              <div className="row2">
                <label className="label">
                  Bike setup
                  <select value={bikeSetup} onChange={(e) => setBikeSetup(e.target.value)}>
                    <option value="road">Road bike (hoods)</option>
                    <option value="road_aerobars">Road bike + aerobars</option>
                    <option value="tri">Tri bike (aero)</option>
                  </select>
                </label>

                <label className="label">
                  Position / aero
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={Number(aeroPos) || 0}
                    onChange={(e) => setAeroPos(String(e.target.value))}
                  />
                  <div className="hint">relaxed ↔ aggressive (affects CdA)</div>
                </label>
              </div>

              <div className="row2">
                <label className="label">
                  Bike weight ({units === "metric" ? "kg" : "lb"})
                  <input
                    value={bikeWeight}
                    onChange={(e) => setBikeWeight(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder={units === "metric" ? "9" : "20"}
                    inputMode="decimal"
                    autoComplete="off"
                  />
                  <div className="hint">bike + kit estimate</div>
                </label>

                <label className="label">
                  Advanced aero (optional)
                  <label className="check" style={{ marginTop: 6 }}>
                    <input type="checkbox" checked={advancedAero} onChange={(e) => setAdvancedAero(e.target.checked)} />
                    Manually set CdA/Crr
                  </label>
                  <div className="hint">use only if you know your numbers</div>
                </label>
              </div>

              {advancedAero && (
                <div className="row2">
                  <label className="label">
                    CdA
                    <input
                      value={cdA}
                      onChange={(e) => setCdA(e.target.value.replace(/[^0-9.]/g, ""))}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                    <div className="hint">lower = more aero</div>
                  </label>

                  <label className="label">
                    Crr
                    <input
                      value={crr}
                      onChange={(e) => setCrr(e.target.value.replace(/[^0-9.]/g, ""))}
                      inputMode="decimal"
                      autoComplete="off"
                    />
                    <div className="hint">rolling resistance</div>
                  </label>
                </div>
              )}
            </>
          )}
        </section>

        <section className="card">
          <h2>3) Race dynamics</h2>
          <label className="check">
            <input type="checkbox" checked={dynOverride} onChange={(e) => setDynOverride(e.target.checked)} />
            Let me override the race conditions
          </label>

          <div className={"row2 " + (!dynOverride ? "disabled" : "")}
               aria-disabled={!dynOverride}
          >
            <label className="label">
              Swim current
              <select disabled={!dynOverride} value={swimCurrent} onChange={(e) => setSwimCurrent(e.target.value)}>
                {Object.entries(DYNAMICS.swimCurrent).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </label>

            <label className="label">
              Heat
              <select disabled={!dynOverride} value={heat} onChange={(e) => setHeat(e.target.value)}>
                {Object.entries(DYNAMICS.heat).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </label>

            <label className="label">
              Bike terrain
              <select disabled={!dynOverride} value={bikeTerrain} onChange={(e) => setBikeTerrain(e.target.value)}>
                {Object.entries(DYNAMICS.bikeTerrain).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </label>

            <label className="label">
              Run terrain
              <select disabled={!dynOverride} value={runTerrain} onChange={(e) => setRunTerrain(e.target.value)}>
                {Object.entries(DYNAMICS.runTerrain).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </label>
          </div>

          {!dynOverride && race && (
            <div className="tiny">
              Using {race.name} defaults: current={race.dynamics.swimCurrent}, bike={race.dynamics.bikeTerrain}, run={race.dynamics.runTerrain}, heat={race.dynamics.heat}
            </div>
          )}
        </section>

        <section className="card result">
          <h2>Result</h2>
          {result ? (
            <>
              <div className="big">
                {result.splitsHMS.total}
              </div>
              <div className="receipt">
                <div><span>Swim</span><span>{result.splitsHMS.swim}</span></div>
                <div><span>T1</span><span>{result.splitsHMS.t1}</span></div>
                <div><span>Bike</span><span>{result.splitsHMS.bike}</span></div>
                <div><span>T2</span><span>{result.splitsHMS.t2}</span></div>
                <div><span>Run</span><span>{result.splitsHMS.run}</span></div>
                <div className="total"><span>Total</span><span>{result.splitsHMS.total}</span></div>
              </div>

              <div className="actions">
                <button onClick={copyShare}>Copy share link</button>
                <a className="ghost" href={shareUrl}>Open share link</a>
              </div>

              <div className="tiny">
                Estimate only. Your mileage may literally vary.
              </div>
            </>
          ) : (
            <div className="tiny">Enter valid paces to see your estimate.</div>
          )}
        </section>
      </main>

      <footer className="footer">
        <div className="tiny">
          v0.5 • {units === "metric" ? "metric units" : "imperial units"} • watts bike (fixed elevation math)
        </div>
      </footer>
    </div>
  );
}
