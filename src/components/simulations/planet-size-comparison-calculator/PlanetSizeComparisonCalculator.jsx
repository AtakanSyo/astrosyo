import { useEffect, useMemo, useState } from "react";
import { BODIES, BODY_BY_KEY, compare, bySize, densityGcc, surfaceGravity, pairPage } from "./bodies";
import { SIZE_TEST_COLUMNS, SIZE_TEST_SOURCES, getSizeTestRows } from "./bodiesTests";
import "../../../styles/telescopeMagnificationCalculator.css";
import "../../../styles/telescopeTools.css";
import "../../../styles/calculators.css";
import CalculatorVote from "../../CalculatorVote.jsx";
import CalculatorTests from "../../CalculatorTests.jsx";
import { trackEvent } from "../../../lib/analytics/trackEvent";

const PAIRS = [
  ["earth", "moon"],
  ["jupiter", "earth"],
  ["mars", "mercury"],
  ["sun", "earth"],
  ["neptune", "earth"],
  ["moon", "pluto"],
];

const GROUPS = [
  ["Star", (b) => b.kind === "star"],
  ["Planets", (b) => b.kind === "planet"],
  ["Dwarf planets", (b) => b.kind === "dwarf planet"],
  ["Moons", (b) => b.kind === "moon"],
];

function fmtNum(n, digits) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })} million`;
  const d = digits ?? (n >= 100 ? 0 : n >= 10 ? 1 : 2);
  return n.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });
}
function fmtMass(kg) {
  const exp = Math.floor(Math.log10(kg));
  return (
    <>
      {(kg / 10 ** exp).toFixed(2)} × 10<sup>{exp}</sup> kg
    </>
  );
}

function readInitialFromUrl() {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const a = p.get("a");
  const b = p.get("b");
  if (!BODY_BY_KEY[a] || !BODY_BY_KEY[b]) return null;
  return { a, b };
}

function Disc({ id, body, cx, cy, r }) {
  return (
    <g>
      {body.texture && r > 2 && (
        <defs>
          <pattern id={`${id}-tex`} patternUnits="objectBoundingBox" patternContentUnits="objectBoundingBox" width="1" height="1">
            <image href={body.texture} x="-0.5" y="0" width="2" height="1" preserveAspectRatio="none" />
          </pattern>
        </defs>
      )}
      {body.kind === "star" ? (
        <circle cx={cx} cy={cy} r={Math.max(r, 0.8)} fill="url(#psc-star)" />
      ) : (
        <circle cx={cx} cy={cy} r={Math.max(r, 0.8)} fill={body.texture && r > 2 ? `url(#${id}-tex)` : body.color} />
      )}
      {r > 2 && body.kind !== "star" && <circle cx={cx} cy={cy} r={r} fill="url(#psc-shade)" />}
    </g>
  );
}

export default function PlanetSizeComparisonCalculator() {
  const [a, setA] = useState("jupiter");
  const [b, setB] = useState("earth");
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const init = readInitialFromUrl();
    if (init) {
      setA(init.a);
      setB(init.b);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const p = new URLSearchParams({ a, b });
    window.history.replaceState(null, "", `${window.location.pathname}?${p}${window.location.hash}`);
  }, [hydrated, a, b]);

  const A = BODY_BY_KEY[a];
  const B = BODY_BY_KEY[b];
  const [big, small] = bySize(A, B);
  const same = a === b;
  const c = useMemo(() => compare(big, small), [big, small]);
  const page = same ? null : pairPage(a, b);

  // Drawing: both discs whole when the ratio is modest; otherwise the big
  // body becomes a curved horizon so the small one stays visible at scale.
  const W = 640;
  const H = 260;
  const cy = H / 2 - 10;
  const draw = useMemo(() => {
    if (c.diameter <= 12) {
      const R = 105;
      const r = R / c.diameter;
      const gap = 40;
      const total = 2 * R + gap + 2 * r;
      const x0 = (W - total) / 2;
      return { limb: false, bigCx: x0 + R, R, smallCx: x0 + 2 * R + gap + r, r };
    }
    // A smaller scale keeps the big body's edge visibly curved.
    const r = Math.max(2.5, Math.min(10, 700 / c.diameter));
    const R = r * c.diameter;
    const limbX = W * 0.55;
    return { limb: true, bigCx: limbX - R, R, smallCx: limbX + 40 + r, r };
  }, [c]);

  const testRows = useMemo(() => getSizeTestRows(), []);

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

  const select = (id, label, value, setter) => (
    <div className="tmc-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="tmc-input" value={value} onChange={(e) => setter(e.target.value)}>
        {GROUPS.map(([g, test]) => (
          <optgroup key={g} label={g}>
            {BODIES.filter(test).map((x) => (
              <option key={x.key} value={x.key}>
                {x.name}
                {x.parent ? ` (${x.parent})` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );

  const rows = [A, B];

  return (
    <div className="tmc" aria-label="Planet size comparison calculator">
      <div className="tmc-header">
        <p className="tmc-title">Planet size comparison</p>
        <div className="tmc-presets">
          {PAIRS.map(([x, y]) => (
            <button
              key={`${x}-${y}`}
              type="button"
              className="tmc-preset-btn"
              onClick={() => {
                setA(x);
                setB(y);
              }}
            >
              {BODY_BY_KEY[x].name} vs {BODY_BY_KEY[y].name}
            </button>
          ))}
        </div>
      </div>

      <div className="tmc-fields">
        {select("psc-a", "Compare", a, setA)}
        {select("psc-b", "with", b, setB)}
      </div>
      <div className="tt-row">
        <button
          type="button"
          className="tt-seg-btn"
          onClick={() => {
            setA(b);
            setB(a);
          }}
        >
          ⇄ Swap
        </button>
      </div>

      {same ? (
        <p className="tmc-note tmc-note--warn" role="alert">Pick two different bodies.</p>
      ) : (
        <>
          <div className="tmc-headline-card tmc-tone-good">
            <div className="tmc-headline">
              {big.name} is {fmtNum(c.diameter, c.diameter < 100 ? 2 : 0)}× as wide as {small.name}
            </div>
            <div className="tmc-headline-sub">
              {big.name} {fmtNum(big.radiusKm * 2, 0)} km across · {small.name} {fmtNum(small.radiusKm * 2, 0)} km across
            </div>
            <div className="tmc-verdict">
              <span className="tmc-verdict-title">
                {fmtNum(c.volume)} {small.name === "Moon" ? "Moons" : `${small.name}s`} would fit inside {big.name}
              </span>{" "}
              by volume, or about {fmtNum(c.fitPacked, 0)} if they had to stay whole spheres (packing leaves gaps).{" "}
              {small.name} is {fmtNum(c.percentSmaller, 0)}% smaller across, and {big.name} has{" "}
              {fmtNum(c.mass)}× its mass.
            </div>
          </div>

          <div className="chart-wrap">
            <svg className="tmc-gauge-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${big.name} and ${small.name} drawn to the same scale`}>
              <defs>
                <radialGradient id="psc-shade" cx="0.35" cy="0.35" r="0.75">
                  <stop offset="0.45" stopColor="#000" stopOpacity="0" />
                  <stop offset="1" stopColor="#000" stopOpacity="0.6" />
                </radialGradient>
                <radialGradient id="psc-star" cx="0.5" cy="0.5" r="0.5">
                  <stop offset="0" stopColor="#fff6d6" />
                  <stop offset="0.85" stopColor="#ffc35c" />
                  <stop offset="1" stopColor="#f08a24" />
                </radialGradient>
                <clipPath id="psc-clip">
                  <rect x="0" y="0" width={W} height={H} />
                </clipPath>
              </defs>
              <g clipPath="url(#psc-clip)">
                <Disc id="psc-big" body={big} cx={draw.bigCx} cy={draw.limb ? cy + draw.R * 0.0 : cy} r={draw.R} />
                <Disc id="psc-small" body={small} cx={draw.smallCx} cy={cy} r={draw.r} />
              </g>
              <text x={draw.limb ? W * 0.55 + 10 : draw.bigCx} y={H - 12} className="tmc-gauge-label" textAnchor={draw.limb ? "start" : "middle"}>
                {big.name}
                {draw.limb ? " (edge, to the left)" : ""}
              </text>
              <text x={draw.smallCx} y={draw.limb ? cy + draw.r + 18 : H - 12} className="tmc-gauge-label" textAnchor={draw.limb ? "start" : "middle"}>
                {small.name}
              </text>
            </svg>
            <p className="tmc-chart-caption">
              Drawn to the same scale.
              {draw.limb && ` ${big.name} is too big to fit, so only part of its edge is shown.`}
              {big.key === "saturn" && " Saturn's rings are left out; they span about 2.3× its diameter."}
            </p>
          </div>

          <div className="tt-table-wrap">
            <table className="tt-table">
              <thead>
                <tr>
                  <th></th>
                  {rows.map((x) => (
                    <th key={x.key}>{x.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Diameter</td>
                  {rows.map((x) => (
                    <td key={x.key} className="num">{fmtNum(x.radiusKm * 2, 0)} km</td>
                  ))}
                </tr>
                <tr>
                  <td>Mass</td>
                  {rows.map((x) => (
                    <td key={x.key} className="num">{fmtMass(x.massKg)}</td>
                  ))}
                </tr>
                <tr>
                  <td>Mean density</td>
                  {rows.map((x) => (
                    <td key={x.key} className="num">{densityGcc(x.radiusKm, x.massKg).toFixed(2)} g/cm³</td>
                  ))}
                </tr>
                <tr>
                  <td>Surface gravity</td>
                  {rows.map((x) => {
                    const g = surfaceGravity(x.radiusKm, x.massKg);
                    return (
                      <td key={x.key} className="num">
                        {g.toFixed(g >= 10 ? 1 : 2)} m/s² ({(g / 9.80665).toFixed(2)} g)
                      </td>
                    );
                  })}
                </tr>
                <tr>
                  <td>Type</td>
                  {rows.map((x) => (
                    <td key={x.key}>
                      {x.kind}
                      {x.parent ? ` of ${x.parent}` : ""}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {page && (
            <p className="tmc-note">
              See {A.name} and {B.name} side by side as rotating 3D globes in the{" "}
              <a href={page}>
                {A.name} and {B.name} size comparison
              </a>
              .
            </p>
          )}
        </>
      )}

      <div className="tmc-footer-row">
        <CalculatorVote slug="planet-size-comparison-calculator" />
        <CalculatorTests title="Planet Size Comparison — Tests" columns={SIZE_TEST_COLUMNS} rows={testRows} sources={SIZE_TEST_SOURCES} />
        <button type="button" className="tmc-copy-btn" onClick={copyLink}>
          {copied ? "Link copied" : "Copy shareable link"}
        </button>
      </div>
    </div>
  );
}
