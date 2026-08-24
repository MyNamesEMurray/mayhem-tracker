import { HashRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import CommunityGate from "./components/CommunityGate";
import Overview from "./pages/Overview";
import MatchHistory from "./pages/MatchHistory";
import Champions from "./pages/Champions";
import ChampionDetail from "./pages/ChampionDetail";
import Augments from "./pages/Augments";
import Friends from "./pages/Friends";
import FriendDetail from "./pages/FriendDetail";
import GlobalStats from "./pages/GlobalStats";
import GlobalChampionDetail from "./pages/GlobalChampionDetail";
import Settings from "./pages/Settings";

export default function App() {
  return (
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
          <Route
            path="/global"
            element={
              <CommunityGate>
                <GlobalStats />
              </CommunityGate>
            }
          />
          <Route
            path="/global/champion/:championId"
            element={
              <CommunityGate>
                <GlobalChampionDetail />
              </CommunityGate>
            }
          />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
