import { CHAMPION_ICON_URL } from "../lib/dragon";

export default function ChampionIcon({
  championId,
  size = 32,
  className = "",
}: {
  championId: number;
  size?: number;
  className?: string;
}) {
  return (
    <img
      src={CHAMPION_ICON_URL(championId)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={`rounded-full shrink-0 ${className}`}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
