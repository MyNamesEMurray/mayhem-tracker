import { useState, useEffect } from "react";
import { SwordsIcon, MinusIcon, MaximizeIcon, RestoreIcon, XIcon } from "./icons";

// 38px window title bar: brand lockup + version on the left, the three
// window controls on the right. The whole bar is a drag region except the
// interactive bits.
export default function TitleBar({ version }: { version: string }) {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.api.isWindowMaximized().then(setMaximized);
    return window.api.onMaximizedChanged(setMaximized);
  }, []);

  return (
    <div className="titlebar-drag h-[38px] shrink-0 flex items-center bg-lol-title-bar border-b border-lol-border/60">
      <span className="flex items-center gap-[7px] px-3.5 text-[13px] font-extrabold tracking-[0.03em] text-lol-gold-light">
        <SwordsIcon className="w-[15px] h-[15px] shrink-0 text-lol-gold" strokeWidth={2.4} />
        <span className="leading-none">
          MAYHEM
          <span className="text-lol-gold">TRACKER</span>
        </span>
      </span>
      {version && (
        <button
          onClick={() =>
            window.api.openUrl(
              `https://github.com/MyNamesEMurray/mayhem-tracker/releases/tag/v${version}`,
            )
          }
          title="View release notes"
          className="titlebar-no-drag text-[11px] text-lol-text/60 hover:text-lol-text transition-colors cursor-pointer"
        >
          v{version}
        </button>
      )}
      <div className="titlebar-no-drag ml-auto flex items-stretch self-stretch">
        <button
          onClick={() => window.api.minimizeWindow()}
          title="Minimize"
          className="w-11 flex items-center justify-center text-lol-text hover:bg-lol-card-hover hover:text-lol-text-bright transition-colors"
        >
          <MinusIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => window.api.toggleMaximizeWindow()}
          title={maximized ? "Restore" : "Maximize"}
          className="w-11 flex items-center justify-center text-lol-text hover:bg-lol-card-hover hover:text-lol-text-bright transition-colors"
        >
          {maximized ? (
            <RestoreIcon className="w-3 h-3" />
          ) : (
            <MaximizeIcon className="w-[13px] h-[13px]" />
          )}
        </button>
        <button
          onClick={() => window.api.closeWindow()}
          title="Close"
          className="w-11 flex items-center justify-center text-lol-text hover:bg-lol-loss hover:text-white transition-colors"
        >
          <XIcon className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
