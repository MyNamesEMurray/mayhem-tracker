import { ChampionIcon } from "mayhem-tracker";

// ChampionIcon is a bare <img> that hides itself if the CDN fetch fails, so
// each preview seats it in a fixed-size ringed slot: the slot shows the true
// size box even where CommunityDragon is unreachable (icons fill it at runtime).
const slot = (size: number): React.CSSProperties => ({
  width: size,
  height: size,
  borderRadius: "50%",
  background: "var(--color-lol-card)",
  boxShadow: "inset 0 0 0 1px var(--color-lol-border)",
  display: "inline-flex",
  overflow: "hidden",
  flexShrink: 0,
});

const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
  display: "flex",
  gap: 16,
  alignItems: "center",
  width: "fit-content",
};

const label: React.CSSProperties = { fontSize: 11, textAlign: "center" };

// A team row at the standard 32px table size, labeled with champion names
export function TeamRow() {
  const team: [number, string][] = [
    [22, "Ashe"],
    [222, "Jinx"],
    [90, "Malzahar"],
    [99, "Lux"],
    [115, "Ziggs"],
  ];
  return (
    <div style={canvas}>
      {team.map(([id, name]) => (
        <div key={id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={slot(32)}>
            <ChampionIcon championId={id} size={32} />
          </span>
          <span style={label}>{name}</span>
        </div>
      ))}
    </div>
  );
}

// The size prop: 24 (inline), 32 (tables), 48 (detail header)
export function SizeScale() {
  const sizes = [24, 32, 48];
  return (
    <div style={canvas}>
      {sizes.map((s) => (
        <div key={s} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <span style={slot(s)}>
            <ChampionIcon championId={22} size={s} />
          </span>
          <span style={label}>{s}px</span>
        </div>
      ))}
    </div>
  );
}
