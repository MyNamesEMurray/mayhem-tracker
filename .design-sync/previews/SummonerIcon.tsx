import { SummonerIcon } from "mayhem-tracker";

// Teammates-list dark canvas
const canvas: React.CSSProperties = {
  background: "var(--color-lol-dark)",
  color: "var(--color-lol-text)",
  padding: 20,
  borderRadius: 12,
  width: "fit-content",
};

const label: React.CSSProperties = {
  fontSize: 10,
  opacity: 0.65,
  marginTop: 6,
  textAlign: "center",
};

const cell: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

// Profile icon at the sizes the app uses (28 is the teammates-list default).
// NOTE: images come from the CommunityDragon CDN — offline the component
// falls back to its neutral circle, which is what a sandbox capture shows.
export function Sizes() {
  return (
    <div style={{ ...canvas, display: "flex", gap: 20, alignItems: "flex-end" }}>
      <div style={cell}>
        <SummonerIcon iconId={4568} size={24} />
        <div style={label}>24</div>
      </div>
      <div style={cell}>
        <SummonerIcon iconId={4568} />
        <div style={label}>28 (default)</div>
      </div>
      <div style={cell}>
        <SummonerIcon iconId={5205} size={40} />
        <div style={label}>40</div>
      </div>
      <div style={cell}>
        <SummonerIcon iconId={6296} size={64} />
        <div style={label}>64</div>
      </div>
    </div>
  );
}

// Players we've never seen a profileIcon for get the neutral placeholder,
// keeping the avatar column aligned
export function UnknownPlayer() {
  return (
    <div style={{ ...canvas, display: "flex", gap: 20, alignItems: "flex-end" }}>
      <div style={cell}>
        <SummonerIcon iconId={null} />
        <div style={label}>no icon</div>
      </div>
      <div style={cell}>
        <SummonerIcon iconId={null} size={40} />
        <div style={label}>no icon, 40</div>
      </div>
    </div>
  );
}
