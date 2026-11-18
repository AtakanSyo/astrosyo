import { useEffect, useMemo, useState } from "react";
import {
  blackHoleProperties,
  closestSizeComparison,
  MASS_UNITS,
  PRESETS,
  L_SUN,
  G_EARTH,
  CMB_TEMPERATURE_K,
  AGE_OF_UNIVERSE_YEARS,
} from "./blackHole";
import { BLACK_HOLE_TEST_COLUMNS, BLACK_HOLE_TEST_SOURCES, getBlackHoleTestRows } from "./blackHoleTests";
import "../../../styles/telescopeMagnificationCalculator.css";
import "../../../styles/telescopeTools.css";
import "../../../styles/calculators.css";
import CalculatorVote from "../../CalculatorVote.jsx";
import CalculatorTests from "../../CalculatorTests.jsx";
import { trackEvent } from "../../../lib/analytics/trackEvent";
import Katex from "../../Katex.jsx";

const AU_M = 149597870700;
const LY_M = 9.4607304725808e15;
const SECONDS_PER_YEAR = 365.25 * 86400;

function Sci({ n, digits = 2, unit = "" }) {
  if (!Number.isFinite(n)) return <>—</>;
  if (n !== 0 && (Math.abs(n) >= 1e6 || Math.abs(n) < 1e-3)) {
    const exp = Math.floor(Math.log10(Math.abs(n)));
    return (
      <>
        {(n / 10 ** exp).toFixed(digits)} × 10<sup>{exp}</sup>
        {unit && ` ${unit}`}
      </>
    );
  }
  return (
    <>
      {Math.abs(n) < 1 ? String(Number(n.toPrecision(digits + 1))) : Number(n.toPrecision(digits + 2)).toLocaleString("en-US")}
      {unit && ` ${unit}`}
    </>
  );
}

function Length({ m }) {
  if (!Number.isFinite(m)) return <>—</>;
  if (m < 1) return <Sci n={m} unit="m" />;
  if (m < 1000) return <Sci n={m} unit="m" />;
  if (m < 1e9) return <Sci n={m / 1000} unit="km" />;
  if (m < 1e4 * AU_M) return <Sci n={m / AU_M} unit="AU" />;
  return <Sci n={m / LY_M} unit="light-years" />;
}

function Duration({ s }) {
  if (!Number.isFinite(s)) return <>—</>;
  if (s < 60) return <Sci n={s} unit="s" />;
  if (s < 3600) return <Sci n={s / 60} unit="minutes" />;
  if (s < 86400 * 2) return <Sci n={s / 3600} unit="hours" />;
  if (s < SECONDS_PER_YEAR) return <Sci n={s / 86400} unit="days" />;
  return <Sci n={s / SECONDS_PER_YEAR} unit="years" />;
}

function readInitialFromUrl() {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  if (!p.has("m")) return null;
  return {
    mass: p.get("m"),
    unit: MASS_UNITS[p.get("u")] ? p.get("u") : "msun",
    spin: Number.isFinite(parseFloat(p.get("a"))) ? p.get("a") : "0",
  };
}

export default function BlackHoleCalculator() {
  const [mass, setMass] = useState("4.297e6");
  const [unit, setUnit] = useState("msun");
  const [spin, setSpin] = useState("0");
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const init = readInitialFromUrl();
    if (init) {
      setMass(init.mass);
      setUnit(init.unit);
      setSpin(init.spin);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const id = window.setTimeout(() => {
      const p = new URLSearchParams({ m: mass, u: unit, a: spin });
      window.history.replaceState(null, "", `${window.location.pathname}?${p}${window.location.hash}`);
    }, 300);
    return () => window.clearTimeout(id);
  }, [hydrated, mass, unit, spin]);

  const r = useMemo(() => {
    const kg = parseFloat(mass) * MASS_UNITS[unit].toKg;
    const a = parseFloat(spin);
    return blackHoleProperties(kg, Number.isFinite(a) ? a : 0);
  }, [mass, unit, spin]);

  const like = r ? closestSizeComparison(r.horizon / 1000) : null;

  // Concentric radii to scale, fitted to the largest one drawn.
  const rings = useMemo(() => {
    if (!r) return null;
    const list = [
      { key: "isco", label: "innermost stable orbit", m: r.isco, cls: "tmc-scope-pupil" },
      { key: "photon", label: "photon orbit", m: r.photonSphere, cls: "tmc-eye-pupil" },
      { key: "horizon", label: "event horizon", m: r.horizon, cls: "bh-horizon" },
    ];
    const max = Math.max(...list.map((x) => x.m));
    const spagVisible = r.spaghettificationM < max * 1.6 && r.spaghettificationM > r.horizon;
    const scaleMax = spagVisible ? Math.max(max, r.spaghettificationM) : max;
    const k = 120 / scaleMax;
    return { list: list.map((x) => ({ ...x, px: x.m * k })), spag: spagVisible ? r.spaghettificationM * k : null };
  }, [r]);

  const testRows = useMemo(() => getBlackHoleTestRows(), []);

  const copyLink = async () => {
    trackEvent("calculator-copy-link");
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API can fail silently — no-op.
    }
  };

  const applyPreset = (p) => {
    setMass(p.mass);
    setUnit(p.unit);
    setSpin(p.spin);
  };

  const row = (label, value, href) => (
    <tr>
      <td>{href ? <a href={href}>{label}</a> : label}</td>
      <td className="num">{value}</td>
    </tr>
  );

  return (
    <div className="tmc" aria-label="Black hole calculator">
      <div className="tmc-header">
        <p className="tmc-title">Black hole calculator</p>
        <div className="tmc-presets">
          {PRESETS.map((p) => (
            <button key={p.label} type="button" className="tmc-preset-btn" onClick={() => applyPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <p className="tmc-explainer">
        Enter a mass, and a spin if you know it. Everything else follows from those two numbers, starting with{" "}
        <Katex tex="r_s = 2GM/c^2" />.
      </p>

      <div className="tmc-fields">
        <div className="tmc-field">
          <label htmlFor="bh-m">Mass (<Katex tex="M" />)</label>
          <div className="tmc-input-row">
            <input id="bh-m" className="tmc-input" type="text" inputMode="decimal" value={mass} onChange={(e) => setMass(e.target.value)} />
          </div>
        </div>
        <div className="tmc-field">
          <label htmlFor="bh-u">Unit</label>
          <select id="bh-u" className="tmc-input" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {Object.entries(MASS_UNITS).map(([k, u]) => (
              <option key={k} value={k}>{u.label}</option>
            ))}
          </select>
        </div>
        <div className="tmc-field">
          <label htmlFor="bh-a">Spin (<Katex tex="a_*" />): {Number(parseFloat(spin) || 0).toFixed(3)}</label>
          <input id="bh-a" type="range" min="-0.998" max="0.998" step="0.001" value={spin} onChange={(e) => setSpin(e.target.value)} />
        </div>
      </div>

      {!r ? (
        <p className="tmc-note tmc-note--warn" role="alert">Enter a positive mass, for example 10 or 4.3e6.</p>
      ) : (
        <>
          <div className="tmc-headline-card tmc-tone-good">
            <div className="tmc-headline">
              Event horizon radius <Length m={r.horizon} />
            </div>
            <div className="tmc-headline-sub">
              <Sci n={r.massKg} unit="kg" /> · Schwarzschild radius <Length m={r.rs} />
              {Math.abs(r.spin) > 0 && <> · spin {r.spin.toFixed(3)}</>}
            </div>
            {like && (
              <div className="tmc-verdict">
                <span className="tmc-verdict-title">
                  About {like.ratio >= 0.7 && like.ratio <= 1.4 ? "the size of" : like.ratio > 1 ? `${like.ratio.toFixed(1)}× ` : `${(1 / like.ratio).toFixed(1)}× smaller than `}
                  {like.label}.
                </span>{" "}
                {r.spaghettifiedOutside
                  ? "Falling in feet first, a person would be pulled apart about "
                  : "A person falling in would cross the horizon without feeling the tidal stretch; the danger comes later, inside."}
                {r.spaghettifiedOutside && (
                  <>
                    <Length m={r.spaghettificationM - r.horizon} /> before reaching the horizon.
                  </>
                )}
              </div>
            )}
          </div>

          {rings && (
            <div className="chart-wrap">
              <svg className="tmc-pupil-svg" viewBox="0 0 640 280" role="img" aria-label="Event horizon, photon sphere and innermost stable orbit drawn to scale">
                {rings.spag && <circle cx="200" cy="140" r={rings.spag} className="tt-dim" fill="none" />}
                {[...rings.list].sort((x, y) => y.px - x.px).map((x) => (
                  <circle
                    key={x.key}
                    cx="200"
                    cy="140"
                    r={x.px}
                    className={x.cls === "bh-horizon" ? undefined : x.cls}
                    style={x.cls === "bh-horizon" ? { fill: "#000", stroke: "#ffb35c", strokeWidth: 1.5 } : { fillOpacity: x.key === "isco" ? 0.12 : 0.18 }}
                  />
                ))}
                {rings.list.map((x, i) => (
                  <g key={x.key}>
                    <line x1={200 + x.px * 0.71} y1={140 - x.px * 0.71} x2="400" y2={70 + i * 34} className="tt-dim" />
                    <text x="408" y={74 + i * 34} className="tmc-gauge-label">
                      {x.label}: {(x.m / r.rs).toFixed(2)} r_s
                    </text>
                  </g>
                ))}
                {rings.spag && (
                  <text x="408" y={74 + 3 * 34} className="tmc-gauge-label">
                    dashed: lethal tidal stretch for a person
                  </text>
                )}
              </svg>
              <p className="tmc-chart-caption">
                Radii to scale, in units of the Schwarzschild radius r_s. Spin pulls the horizon and the innermost stable orbit
                inward for orbits that turn the same way as the black hole.
              </p>
            </div>
          )}

          <div className="tt-table-wrap">
            <table className="tt-table">
              <thead>
                <tr>
                  <th>Size and orbits</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {row("Schwarzschild radius", <Length m={r.rs} />, "/posts/schwarzschild-radius-calculator")}
                {row("Event horizon (with spin)", <Length m={r.horizon} />)}
                {row("Photon orbit (equatorial)", <Length m={r.photonSphere} />)}
                {row("Innermost stable circular orbit", <Length m={r.isco} />, "/posts/black-hole-isco-calculator")}
                {row("Light crossing time (across 2 r_s)", <Duration s={r.lightCrossingS} />)}
              </tbody>
              <thead>
                <tr>
                  <th>Matter and light</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {row("Mean density inside r_s", <Sci n={r.density} unit="kg/m³" />)}
                {row("Accretion efficiency (mass → light)", `${(r.efficiency * 100).toFixed(1)}%`, "/posts/black-hole-isco-calculator")}
                {row("Eddington luminosity", <><Sci n={r.eddingtonW} unit="W" /> (<Sci n={r.eddingtonW / L_SUN} /> L☉)</>, "/posts/eddington-luminosity-calculator")}
              </tbody>
              <thead>
                <tr>
                  <th>Hawking radiation</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {row(
                  "Hawking temperature",
                  <>
                    <Sci n={r.hawkingK} unit="K" /> ({r.hawkingK > CMB_TEMPERATURE_K ? "hotter" : "colder"} than the 2.7 K CMB)
                  </>,
                  "/posts/hawking-temperature-calculator",
                )}
                {row(
                  "Evaporation time",
                  <>
                    <Duration s={r.evaporationYears * SECONDS_PER_YEAR} /> (<Sci n={r.evaporationYears / AGE_OF_UNIVERSE_YEARS} />× the universe's age)
                  </>,
                  "/posts/black-hole-evaporation-time-calculator",
                )}
              </tbody>
              <thead>
                <tr>
                  <th>Falling in</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {row("Head-to-foot stretch at the horizon (2 m person)", <><Sci n={r.stretchAtHorizon} unit="m/s²" /> (<Sci n={r.stretchAtHorizon / G_EARTH} /> g)</>)}
                {row("Stretch reaches a lethal ~10 g at", <Length m={r.spaghettificationM} />)}
                {row(
                  "A Sun-like star is torn apart at",
                  <>
                    <Length m={r.sunTidalRadius} /> ({r.sunSwallowedWhole ? "inside the horizon: swallowed whole" : "outside the horizon: a visible tidal disruption flare"})
                  </>,
                  "/posts/tidal-disruption-radius-calculator",
                )}
              </tbody>
            </table>
          </div>

          <p className="tmc-note">
            Linked rows open the dedicated calculator for that quantity. Hawking temperature and evaporation time use the
            non-spinning formulas; the orbits are for orbits in the black hole's equator.
          </p>
        </>
      )}

      <div className="tmc-footer-row">
        <CalculatorVote slug="black-hole-calculator" />
        <CalculatorTests title="Black Hole Calculator — Tests" columns={BLACK_HOLE_TEST_COLUMNS} rows={testRows} sources={BLACK_HOLE_TEST_SOURCES} />
        <button type="button" className="tmc-copy-btn" onClick={copyLink}>
          {copied ? "Link copied" : "Copy shareable link"}
        </button>
      </div>
    </div>
  );
}
