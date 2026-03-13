import { useEffect, useMemo, useState } from "react";
import "./app.css";
import { RACE_CATALOG, getRaceById } from "./races.generated";
import { DYNAMICS, LEVELS, estimateFinish } from "./calc";

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

    // swim: min/100yd <-> min/100m
    // 100yd = 91.44m; pace per 100m is slower by factor (100m / 91.44m) = 1.09361
    const SWIM_IMP_TO_MET = 1 / METERS_PER_YARD; // 1.09361
    const SWIM_MET_TO_IMP = METERS_PER_YARD; // 0.9144

    if (nextUnits === "metric" && units === "imperial") {
      if (Number.isFinite(swimMin)) setSwim(formatMinSec(swimMin * SWIM_IMP_TO_MET));
      if (Number.isFinite(runMin)) setRun(formatMinSec(runMin / KM_PER_MILE)); // min/mi -> min/km
      if (Number.isFinite(bikeNum)) setBike((bikeNum * KM_PER_MILE).toFixed(1)); // mph -> km/h
    }

    if (nextUnits === "imperial" && units === "metric") {
      if (Number.isFinite(swimMin)) setSwim(formatMinSec(swimMin * SWIM_MET_TO_IMP));
      if (Number.isFinite(runMin)) setRun(formatMinSec(runMin * KM_PER_MILE)); // min/km -> min/mi
      if (Number.isFinite(bikeNum)) setBike((bikeNum * MILES_PER_KM).toFixed(1)); // km/h -> mph
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

    const MILES_PER_KM = 0.621371;
    const KM_PER_MILE = 1.60934;
    const YARDS_PER_METER = 1 / 0.9144;

    const swimMinPer100Yd = units === "metric"
      ? swimMinPer100 * (100 / (100 * YARDS_PER_METER)) // per 100m -> per 100yd (multiply by 0.9144)
      : swimMinPer100;

    const bikeMph = units === "metric"
      ? bikeSpeed * MILES_PER_KM // km/h -> mph
      : bikeSpeed;

    const runMinPerMile = units === "metric"
      ? runMinPer * KM_PER_MILE // min/km -> min/mile
      : runMinPer;

    return {
      swimMinPer100Yd,
      bikeMph,
      runMinPerMile,
    };
  }, [swim, bike, run, units]);

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
  }, [raceId, levelKey, units, swim, bike, run, dynOverride, swimCurrent, bikeTerrain, runTerrain, heat]);

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
          <h2>1) Select your race</h2>
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
              {units === "metric" ? "Bike speed (km/h)" : "Bike speed (mph)"}
              <input value={bike} onChange={(e) => setBike(e.target.value)} placeholder={units === "metric" ? "29.0" : "18.0"} inputMode="decimal" />
              <div className="hint">avg speed</div>
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
          v0.2 • {units === "metric" ? "metric units" : "imperial units"} • adjust multipliers later when reality yells at us
        </div>
      </footer>
    </div>
  );
}
