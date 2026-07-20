import { useState, useEffect } from "react";
import { MinusIcon, MaximizeIcon, RestoreIcon, XIcon } from "./icons";

export default function StatusBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    window.api.isWindowMaximized().then(setMaximized);
    return window.api.onMaximizedChanged(setMaximized);
  }, []);

  return (
    <div className="titlebar-drag h-9 border-b border-lol-border/60 shrink-0 flex items-center justify-end">
      <div className="titlebar-no-drag flex items-stretch self-stretch">
        <button
          onClick={() => window.api.minimizeWindow()}
          title="Minimize"
          className="w-11 flex items-center justify-center text-lol-text hover:bg-white/5 hover:text-lol-text-bright transition-colors"
        >
          <MinusIcon className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => window.api.toggleMaximizeWindow()}
          title={maximized ? "Restore" : "Maximize"}
          className="w-11 flex items-center justify-center text-lol-text hover:bg-white/5 hover:text-lol-text-bright transition-colors"
        >
          {maximized ? <RestoreIcon className="w-3 h-3" /> : <MaximizeIcon className="w-3 h-3" />}
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
