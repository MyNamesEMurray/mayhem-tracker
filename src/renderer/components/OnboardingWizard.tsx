import { useCallback, useEffect, useState } from "react";
import { GlobeIcon, RefreshIcon, SwordsIcon, UsersIcon } from "./icons";
import Toggle from "./Toggle";

const DONE_KEY = "onboarding_done";
const STEPS = 4;

// First-launch walkthrough: what the app does, how tracking works, the
// community-stats opt-in, and finally the pointer to mayhemstats.com.
// Skippable at any point; never shown again once dismissed.
export default function OnboardingWizard() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [shareEnabled, setShareEnabled] = useState(false);

  useEffect(() => {
    window.api.getSetting(DONE_KEY).then((v) => {
      if (v === "1") return;
      window.api.getUploadStatus().then((s) => setShareEnabled(s.enabled));
      setVisible(true);
    });
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    void window.api.setSetting(DONE_KEY, "1");
  }, []);

  const toggleShare = useCallback(async () => {
    const next = !shareEnabled;
    setShareEnabled(next);
    await window.api.setUploadEnabled(next);
  }, [shareEnabled]);

  if (!visible) return null;

  const last = step === STEPS - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-lol-dark/85 backdrop-blur-sm">
      <div className="w-[520px] max-w-[calc(100vw-48px)] bg-lol-card border border-lol-border/60 rounded-xl p-7 shadow-[0_24px_60px_rgba(0,0,0,.5)]">
        {step === 0 && (
          <div className="text-center">
            <SwordsIcon width={44} height={44} className="mx-auto text-lol-gold" />
            <h2 className="text-[20px] font-extrabold text-lol-gold-light mt-4">
              Welcome to MayhemStats Tracker
            </h2>
            <p className="text-[13px] text-lol-text mt-2 leading-relaxed">
              Your ARAM Mayhem match history, recorded automatically. Keep the tracker running
              while you play — every game, augment pick, and build is saved the moment the match
              ends. No account, no setup.
            </p>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-[17px] font-extrabold text-lol-gold-light mb-4">How it works</h2>
            <div className="flex flex-col gap-3.5">
              <Row icon={<RefreshIcon width={18} height={18} />}>
                The tracker connects to your League client on its own — the dot in the top-right
                shows when it's linked. Games record automatically as you finish them.
              </Row>
              <Row icon={<SwordsIcon width={18} height={18} />}>
                Already been playing? <b className="text-lol-text-bright">Settings → Backfill</b>{" "}
                imports every ARAM Mayhem game the client still remembers.
              </Row>
              <Row icon={<UsersIcon width={18} height={18} />}>
                Explore your stats in the tabs above — matches, champions, augments, the friends
                you queue with, and community-wide rankings.
              </Row>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-[17px] font-extrabold text-lol-gold-light mb-2">
              Count your games in the community stats
            </h2>
            <p className="text-[13px] text-lol-text leading-relaxed">
              Riot's API doesn't expose Mayhem match data, so other sites substitute ARAM item
              stats and Arena augment stats. The tier lists on mayhemstats.com come from real
              Mayhem games instead — powered entirely by players who share theirs. Contributions
              are anonymous — champions, augments, items, and combat stats only.{" "}
              <b className="text-lol-text-bright">
                Never summoner names, Riot IDs, or anything that identifies you.
              </b>{" "}
              You can turn this off or delete your contributions anytime in Settings.
            </p>
            <div className="flex items-center justify-between mt-4 bg-lol-dark/50 border border-lol-border/50 rounded-lg px-4 py-3">
              <div>
                <p className="text-[13px] font-semibold text-lol-text-bright">
                  Share match data with mayhemstats.com
                </p>
                <p className="text-xs text-lol-text mt-0.5">
                  {shareEnabled ? "Thanks for contributing!" : "Off — your games stay local"}
                </p>
              </div>
              <Toggle checked={shareEnabled} onChange={toggleShare} />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="text-center">
            <GlobeIcon width={40} height={40} className="mx-auto text-lol-gold" />
            <h2 className="text-[20px] font-extrabold text-lol-gold-light mt-4">You're all set</h2>
            <p className="text-[13px] text-lol-text mt-2 leading-relaxed">
              Games record automatically from here on. And when you want the big picture — tier
              lists, win rates, and the best builds from every contributed game — the community
              site has it all.
            </p>
            <button
              onClick={() => window.api.openUrl("https://mayhemstats.com")}
              className="mt-5 inline-flex items-center gap-2 px-5 py-2 rounded-lg border border-lol-gold/50 bg-lol-gold/15 text-lol-gold text-[13px] font-semibold transition-colors hover:bg-lol-gold/25"
            >
              <GlobeIcon width={15} height={15} />
              Explore mayhemstats.com
            </button>
          </div>
        )}

        {/* Footer: back · dots · skip/next */}
        <div className="flex items-center mt-7">
          <button
            onClick={() => setStep(step - 1)}
            className={`text-xs text-lol-text hover:text-lol-text-bright transition-colors ${
              step === 0 ? "invisible" : ""
            }`}
          >
            ← Back
          </button>
          <div className="flex-1 flex justify-center gap-1.5">
            {Array.from({ length: STEPS }, (_, i) => (
              <span
                key={i}
                className={`h-1.5 w-1.5 rounded-full ${
                  i === step ? "bg-lol-gold" : "bg-lol-border"
                }`}
              />
            ))}
          </div>
          {last ? (
            <button
              onClick={dismiss}
              className="text-xs font-semibold text-lol-gold hover:text-lol-gold-light transition-colors"
            >
              Start tracking →
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <button
                onClick={dismiss}
                className="text-xs text-lol-text hover:text-lol-text-bright transition-colors"
              >
                Skip
              </button>
              <button
                onClick={() => setStep(step + 1)}
                className="px-4 py-1.5 rounded-lg border border-lol-gold/50 bg-lol-gold/15 text-lol-gold text-xs font-semibold transition-colors hover:bg-lol-gold/25"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="text-lol-gold mt-0.5 shrink-0">{icon}</span>
      <p className="text-[13px] text-lol-text leading-relaxed">{children}</p>
    </div>
  );
}
