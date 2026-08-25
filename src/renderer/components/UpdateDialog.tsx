import { useEffect, useState } from "react";
import type { UpdateInfo } from "../lib/types";
import { RefreshIcon } from "../../shared/ui/icons";

export default function UpdateDialog({
  update,
  onClose,
}: {
  update: UpdateInfo;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return window.api.onUpdateProgress(setProgress);
  }, []);

  const handleUpdate = async () => {
    if (!update.assetUrl) {
      setError("No download found for this release");
      return;
    }
    setDownloading(true);
    setError(null);
    const result = await window.api.downloadUpdate(update.assetUrl);
    if (!result.success) {
      setDownloading(false);
      setError(result.error ?? "Update failed");
    }
    // On success the app restarts itself, no further action needed
  };

  const sizeMb = update.assetSize ? (update.assetSize / 1024 / 1024).toFixed(1) : null;

  // Release notes are simple markdown bullets; render them as text lines so
  // nothing needs a markdown dependency
  const noteLines = (update.notes ?? "")
    .split("\n")
    .map((l) => l.replace(/\*\*([^*]+)\*\*/g, "$1").trimEnd())
    .filter((l, i, arr) => l.trim() !== "" || (i > 0 && arr[i - 1].trim() !== ""));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={downloading ? undefined : onClose}
    >
      <div
        className="w-96 rounded-lg border border-lol-border bg-lol-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[15px] font-bold text-lol-text-bright">Update Available</h2>
        <p className="mt-2 text-[13px] text-lol-text">
          Version <span className="text-lol-gold">v{update.latest}</span> is available (you have v
          {update.current}).
        </p>
        {noteLines.length > 0 && (
          <div className="mt-3 max-h-64 overflow-y-auto rounded-md border border-lol-border/60 bg-lol-dark/50 px-3 py-2 text-[12px] leading-relaxed text-lol-text">
            {noteLines.map((line, i) =>
              line.startsWith("- ") ? (
                <div key={i} className="flex gap-1.5">
                  <span className="text-lol-gold shrink-0">•</span>
                  <span>{line.slice(2)}</span>
                </div>
              ) : line.startsWith("#") ? (
                <div key={i} className="font-semibold text-lol-text-bright mt-1">
                  {line.replace(/^#+\s*/, "")}
                </div>
              ) : (
                <div key={i}>{line}</div>
              ),
            )}
          </div>
        )}
        <button
          onClick={() => window.api.openUrl(update.url!)}
          className="mt-1.5 text-[12px] text-lol-gold hover:text-lol-gold-light transition-colors cursor-pointer"
        >
          View all release notes
        </button>

        {downloading && (
          <div className="mt-4">
            <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-lol-gold transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-lol-text">
              Downloading... {progress}%{sizeMb ? ` of ${sizeMb} MB` : ""}
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 text-[12px] text-lol-loss">
            {error}
            {update.url && (
              <button
                onClick={() => window.api.openUrl(update.url!)}
                className="ml-1.5 text-lol-gold hover:text-lol-gold-light transition-colors cursor-pointer"
              >
                Download manually
              </button>
            )}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={downloading}
            className="text-xs px-3 py-1.5 rounded-md border border-lol-border text-lol-text hover:bg-white/5 disabled:opacity-50 transition-colors"
          >
            Not Now
          </button>
          <button
            onClick={handleUpdate}
            disabled={downloading || !update.assetUrl}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-lol-gold/25 bg-lol-gold/10 text-lol-gold hover:bg-lol-gold/20 disabled:opacity-50 transition-colors"
          >
            <RefreshIcon className={`w-3 h-3 ${downloading ? "animate-spin" : ""}`} />
            {downloading ? "Updating..." : "Update & Restart"}
          </button>
        </div>
      </div>
    </div>
  );
}
