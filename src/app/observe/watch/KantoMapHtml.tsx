"use client";

/**
 * Kanto map — exact CSS/SVG replica of the ROM Town Map image.
 * Cities = red/blue squares with grey border; caves/waypoints = green circles.
 * Roads = grey with white/dark border; one diagonal green bike path.
 */

export type Region = { id: string; name: string; type: string; x: number; y: number };

const MAP_W = 536;
const MAP_H = 495;

/** Exact positions (pixels) from reference image — grid-like layout. */
const LAYOUT: Record<string, { x: number; y: number }> = {
  // Cities — red squares (Pewter, Pallet, Cinnabar vertically aligned at x: 118)
  indigo_plateau: { x: 50, y: 72 },
  pewter_city: { x: 118, y: 100 },
  viridian_city: { x: 118, y: 225 },
  cerulean_city: { x: 308, y: 100 },
  celadon_city: { x: 218, y: 218 },
  saffron_city: { x: 308, y: 218 },
  vermilion_city: { x: 308, y: 292 },
  fuchsia_city: { x: 250, y: 380 },
  // Cities — blue squares (Pallet, Cinnabar vertically aligned)
  pallet_town: { x: 118, y: 342 },
  cinnabar_island: { x: 118, y: 448 },
  lavender_town: { x: 424, y: 218 },
  // Green circles (caves / route waypoints) — placed along roads per reference
  viridian_forest: { x: 118, y: 168 },
  victory_road: { x: 50, y: 130 },
  mt_moon: { x: 218, y: 100 },
  cerulean_cave: { x: 278, y: 68 },
  power_plant: { x: 445, y: 135 },
  rock_tunnel: { x: 424, y: 100 },
  pokemon_tower: { x: 445, y: 205 },
  digletts_cave: { x: 368, y: 292 },
  digletts_cave_north: { x: 118, y: 138 },
  safari_zone: { x: 250, y: 348 },
  seafoam_islands: { x: 184, y: 448 },
  pokemon_mansion: { x: 138, y: 432 },
  // Route waypoints (green circles along roads)
  route_1: { x: 118, y: 315 },
  route_2b: { x: 118, y: 95 },
  route_3a: { x: 168, y: 80 },
  route_3b: { x: 268, y: 80 },
  route_4: { x: 425, y: 80 },
  route_5: { x: 288, y: 248 },
  route_6: { x: 325, y: 305 },
  route_7: { x: 278, y: 245 },
  route_8: { x: 385, y: 168 },
  route_9: { x: 438, y: 140 },
  route_10: { x: 452, y: 120 },
  route_11_end: { x: 424, y: 292 },
  route_12_end: { x: 424, y: 342 },
  route_13_end: { x: 368, y: 342 },
  route_14_end: { x: 368, y: 380 },
  route_16_end: { x: 178, y: 218 },
  route_17_end: { x: 178, y: 380 },
  route_19_turn: { x: 250, y: 448 },
  route_20: { x: 175, y: 448 },
  route_21: { x: 138, y: 418 },
  route_22_turn: { x: 50, y: 225 },
  route_22: { x: 95, y: 118 },
  route_23: { x: 78, y: 85 },
  route_24: { x: 308, y: 48 },
  route_25: { x: 368, y: 48 },
};

function pos(r: Region): { x: number; y: number } {
  const p = LAYOUT[r.id];
  if (p) return p;
  return { x: (r.x / 100) * MAP_W, y: (r.y / 100) * MAP_H };
}

/** Road segments — grid structure. routeId for filter. */
const ROAD_SEGMENTS: { from: string; to: string; routeId: string }[] = [
  // Pallet Town: only Route 1 up to Viridian, Route 21 down to Cinnabar
  { from: "pallet_town", to: "viridian_city", routeId: "route_1" },
  { from: "pallet_town", to: "cinnabar_island", routeId: "route_21" },
  // Viridian City: Route 2 up (Viridian Forest + green circle) → Pewter
  { from: "viridian_city", to: "viridian_forest", routeId: "route_2" },
  { from: "viridian_forest", to: "route_2b", routeId: "route_2" },
  { from: "route_2b", to: "pewter_city", routeId: "route_2" },
  // Viridian City: Route 22 left, turns up (90°) → Route 23 → Victory Road → Indigo Plateau
  { from: "viridian_city", to: "route_22_turn", routeId: "route_22" },
  { from: "route_22_turn", to: "victory_road", routeId: "route_23" },
  { from: "victory_road", to: "indigo_plateau", routeId: "route_23" },
  // Northern horizontal (y: 65): Pewter → Mt Moon → Cerulean, equal spacing
  { from: "pewter_city", to: "mt_moon", routeId: "route_3" },
  { from: "mt_moon", to: "cerulean_city", routeId: "route_4" },
  { from: "cerulean_city", to: "route_24", routeId: "route_24" },
  { from: "route_24", to: "route_25", routeId: "route_25" },
  { from: "cerulean_city", to: "rock_tunnel", routeId: "route_9" },
  { from: "rock_tunnel", to: "lavender_town", routeId: "route_10" },
  // Route 7: Celadon → Saffron only
  { from: "celadon_city", to: "saffron_city", routeId: "route_7" },
  // Saffron hub
  { from: "saffron_city", to: "vermilion_city", routeId: "route_6" },
  { from: "saffron_city", to: "lavender_town", routeId: "route_8" },
  // Route 11: Vermillion → Diglett's Cave (right of Vermillion) → route_11_end
  { from: "vermilion_city", to: "digletts_cave", routeId: "route_11" },
  { from: "digletts_cave", to: "route_11_end", routeId: "route_11" },
  // Lavender → Fuchsia: Route 12 down (passes through route_11_end), Route 13 left, Route 14 down, Route 15 to Fuchsia
  { from: "lavender_town", to: "route_11_end", routeId: "route_12" },
  { from: "route_11_end", to: "route_12_end", routeId: "route_12" },
  { from: "route_12_end", to: "route_13_end", routeId: "route_13" },
  { from: "route_13_end", to: "route_14_end", routeId: "route_14" },
  { from: "route_14_end", to: "fuchsia_city", routeId: "route_15" },
  // Celadon → Fuchsia: Route 16 left, Route 17 down, Route 18 right
  { from: "celadon_city", to: "route_16_end", routeId: "route_16" },
  { from: "route_16_end", to: "route_17_end", routeId: "route_17" },
  { from: "route_17_end", to: "fuchsia_city", routeId: "route_18" },
  // Cinnabar water route → Seafoam (Route 20)
  { from: "cinnabar_island", to: "route_20", routeId: "route_20" },
  { from: "route_20", to: "seafoam_islands", routeId: "route_20" },
  // Route 19: L-shaped, 90° turn at Cinnabar horizontal level (y: 448)
  { from: "seafoam_islands", to: "route_19_turn", routeId: "route_19" },
  { from: "route_19_turn", to: "fuchsia_city", routeId: "route_19" },
  // Cerulean → Saffron (underground)
  { from: "cerulean_city", to: "saffron_city", routeId: "route_5" },
];

/** Diglett's Cave tunnel: green line between north entrance (above Viridian Forest) and Route 11 entrance — drawn below roads/cities */
const DIGLETT_CAVE_PATH = {
  from: LAYOUT.digletts_cave_north,
  to: LAYOUT.digletts_cave,
};

function getPos(regions: Region[], id: string): { x: number; y: number } | null {
  const r = regions.find((x) => x.id === id);
  if (r) return pos(r);
  const p = LAYOUT[id];
  return p ?? null;
}

type Props = {
  regions: Region[];
  agentsByRegion: Record<string, unknown[]>;
  selectedRegionId: string | null;
  hoverRegion: Region | null;
  onSelectRegion: (id: string) => void;
  onHoverRegion: (r: Region | null) => void;
};

export function KantoMapHtml({
  regions,
  agentsByRegion,
  selectedRegionId,
  hoverRegion,
  onSelectRegion,
  onHoverRegion,
}: Props) {
  const cities = regions.filter((r) => r.type === "city");
  const caves = regions.filter((r) => r.type === "cave");

  return (
    <div className="relative w-full rounded-xl border-2 border-stone-600 bg-stone-900">
      <div className="overflow-hidden rounded-[10px] w-full" style={{ aspectRatio: `${MAP_W} / ${MAP_H}` }}>
        <svg
          viewBox={`0 0 ${MAP_W} ${MAP_H}`}
          className="w-full h-full block"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Background: subtle neutral canvas (no water/land representation) */}
          <defs>
            <linearGradient id="map-bg" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3D3A36" />
              <stop offset="100%" stopColor="#2D2A26" />
            </linearGradient>
          </defs>
          <rect width={MAP_W} height={MAP_H} fill="url(#map-bg)" />

          {/* Diglett's Cave tunnel: green line below roads/cities (both entrances) */}
          <line
            x1={DIGLETT_CAVE_PATH.from.x}
            y1={DIGLETT_CAVE_PATH.from.y}
            x2={DIGLETT_CAVE_PATH.to.x}
            y2={DIGLETT_CAVE_PATH.to.y}
            stroke="#00AA00"
            strokeWidth="4"
            strokeLinecap="round"
          />

          {/* Roads: outer border, inner fill — land routes grey/white, sea routes (19, 20, 21) light blue */}
          {ROAD_SEGMENTS.map((seg, i) => {
            const A = getPos(regions, seg.from);
            const B = getPos(regions, seg.to);
            if (!A || !B) return null;
            const isSeaRoute = ["route_19", "route_20", "route_21"].includes(seg.routeId);
            const outerStroke = isSeaRoute ? "#5B9BD5" : "#A0A0A0";
            const innerStroke = isSeaRoute ? "#B0E0E6" : "#FFFFFF";
            return (
              <g key={`road-${i}`} fill="none" strokeLinecap="round" strokeLinejoin="round">
                <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={outerStroke} strokeWidth={14} />
                <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={innerStroke} strokeWidth={8} />
              </g>
            );
          })}

          {/* Invisible wide stroke for route hover/click */}
          {ROAD_SEGMENTS.map((seg, i) => {
            const A = getPos(regions, seg.from);
            const B = getPos(regions, seg.to);
            const routeRegion = regions.find((r) => r.id === seg.routeId);
            if (!A || !B || !routeRegion) return null;
            const isHover = hoverRegion?.id === seg.routeId;
            const isSelected = selectedRegionId === seg.routeId;
            return (
              <line
                key={`road-hit-${i}`}
                x1={A.x}
                y1={A.y}
                x2={B.x}
                y2={B.y}
                stroke={isHover || isSelected ? "rgba(251,191,36,0.4)" : "transparent"}
                strokeWidth={22}
                strokeLinecap="round"
                className="cursor-pointer"
                onMouseEnter={() => onHoverRegion(routeRegion)}
                onMouseLeave={() => onHoverRegion(null)}
                onClick={() => onSelectRegion(seg.routeId)}
              />
            );
          })}

          {/* Pokémon Tower: green circle below Lavender Town (drawn before cities so city square is on top) */}
          {(() => {
            const pt = LAYOUT.pokemon_tower;
            const r = regions.find((x) => x.id === "pokemon_tower");
            const isHover = hoverRegion?.id === "pokemon_tower";
            const isSelected = selectedRegionId === "pokemon_tower";
            const fill = isSelected ? "rgba(251,191,36,0.5)" : isHover ? "rgba(251,191,36,0.35)" : "#00AA00";
            const stroke = isHover || isSelected ? "#FBBF24" : "#606060";
            return (
              <g
                className="cursor-pointer"
                onMouseEnter={() => r && onHoverRegion(r)}
                onMouseLeave={() => onHoverRegion(null)}
                onClick={() => r && onSelectRegion(r.id)}
              >
                <circle cx={pt.x} cy={pt.y} r={14} fill={fill} stroke={stroke} strokeWidth={1.5} />
              </g>
            );
          })()}

          {/* Pokémon Mansion: green circle below Cinnabar Island (drawn before cities so city square is on top) */}
          {(() => {
            const pm = LAYOUT.pokemon_mansion;
            const r = regions.find((x) => x.id === "pokemon_mansion");
            const isHover = hoverRegion?.id === "pokemon_mansion";
            const isSelected = selectedRegionId === "pokemon_mansion";
            const fill = isSelected ? "rgba(251,191,36,0.5)" : isHover ? "rgba(251,191,36,0.35)" : "#00AA00";
            const stroke = isHover || isSelected ? "#FBBF24" : "#606060";
            return (
              <g
                className="cursor-pointer"
                onMouseEnter={() => r && onHoverRegion(r)}
                onMouseLeave={() => onHoverRegion(null)}
                onClick={() => r && onSelectRegion(r.id)}
              >
                <circle cx={pm.x} cy={pm.y} r={14} fill={fill} stroke={stroke} strokeWidth={1.5} />
              </g>
            );
          })()}

          {/* Cities: red or blue squares, ~30–35px, grey border — per reference */}
          {cities.map((r) => {
            const { x, y } = pos(r);
            const isHover = hoverRegion?.id === r.id;
            const isSelected = selectedRegionId === r.id;
            const size = 32;
            const isBlue = ["pallet_town", "lavender_town", "cinnabar_island"].includes(r.id);
            const fill = isSelected
              ? "rgba(251,191,36,0.6)"
              : isHover
                ? "rgba(251,191,36,0.4)"
                : isBlue
                  ? "#0066CC"
                  : "#CC0000";
            const stroke = isHover || isSelected ? "#FBBF24" : "#888888";
            return (
              <g
                key={r.id}
                className="cursor-pointer"
                onMouseEnter={() => onHoverRegion(r)}
                onMouseLeave={() => onHoverRegion(null)}
                onClick={() => onSelectRegion(r.id)}
              >
                <rect
                  x={x - size / 2}
                  y={y - size / 2}
                  width={size}
                  height={size}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={2}
                />
              </g>
            );
          })}

          {/* Caves / special: green circles, ~25–30px diam, grey outline — per reference (pokemon_tower, pokemon_mansion drawn below cities) */}
          {caves.filter((r) => r.id !== "pokemon_tower" && r.id !== "pokemon_mansion").map((r) => {
            const { x, y } = pos(r);
            const isHover = hoverRegion?.id === r.id;
            const isSelected = selectedRegionId === r.id;
            const radius = 14;
            const fill = isSelected
              ? "rgba(251,191,36,0.5)"
              : isHover
                ? "rgba(251,191,36,0.35)"
                : "#00AA00";
            const stroke = isHover || isSelected ? "#FBBF24" : "#606060";
            return (
              <g
                key={r.id}
                className="cursor-pointer"
                onMouseEnter={() => onHoverRegion(r)}
                onMouseLeave={() => onHoverRegion(null)}
                onClick={() => onSelectRegion(r.id)}
              >
                <circle cx={x} cy={y} r={radius} fill={fill} stroke={stroke} strokeWidth={1.5} />
              </g>
            );
          })}
          {/* Diglett's Cave north entrance (other end of tunnel) — green circle above Viridian Forest */}
          <circle
            cx={LAYOUT.digletts_cave_north.x}
            cy={LAYOUT.digletts_cave_north.y}
            r={14}
            fill="#00AA00"
            stroke="#606060"
            strokeWidth={1.5}
          />

        </svg>
      </div>

      {hoverRegion && (() => {
        const seg = hoverRegion.type === "route" ? ROAD_SEGMENTS.find((s) => s.routeId === hoverRegion.id) : null;
        const mid = seg && (() => {
          const A = getPos(regions, seg.from);
          const B = getPos(regions, seg.to);
          return A && B ? { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 } : null;
        })();
        const pt = mid ?? pos(hoverRegion);
        return (
          <div
            className="absolute px-2 py-1 rounded bg-stone-800 border border-stone-600 text-xs whitespace-nowrap z-10 shadow-lg pointer-events-none"
            style={{
              left: `${(pt.x / MAP_W) * 100}%`,
              top: `${(pt.y / MAP_H) * 100}%`,
              transform: "translate(-50%, -100%)",
              marginTop: "-4px",
            }}
          >
            <span className="font-medium text-stone-200">{hoverRegion.name}</span>
            <span className="text-stone-500 ml-1">
              — {(agentsByRegion[hoverRegion.id] ?? []).length} agent
              {(agentsByRegion[hoverRegion.id] ?? []).length !== 1 ? "s" : ""}
            </span>
          </div>
        );
      })()}
    </div>
  );
}
