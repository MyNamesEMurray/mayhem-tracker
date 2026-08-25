import { HashRouter, Routes, Route } from "react-router-dom";
import { GameDataProvider } from "../shared/ui/GameData";
import { useAugmentData } from "./hooks/useChampions";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import MatchHistory from "./pages/MatchHistory";
import Champions from "./pages/Champions";
import ChampionDetail from "./pages/ChampionDetail";
import Augments from "./pages/Augments";
import Friends from "./pages/Friends";
import FriendDetail from "./pages/FriendDetail";
import Settings from "./pages/Settings";

export default function App() {
  // Loaded once here rather than by every augment icon that needs one, so the
  // shared components read it from context instead of reaching for the
  // Electron bridge themselves.
  const augments = useAugmentData();

  return (
    <GameDataProvider augments={augments}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Overview />} />
            <Route path="/matches" element={<MatchHistory />} />
            <Route path="/champions" element={<Champions />} />
            <Route path="/champions/:championId" element={<ChampionDetail />} />
            <Route path="/augments" element={<Augments />} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/friends/:key" element={<FriendDetail />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </HashRouter>
    </GameDataProvider>
  );
}
