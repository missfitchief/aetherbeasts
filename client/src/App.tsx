import { useEffect } from 'react';
import { useGame } from './state/store.js';
import { audio } from './game/audio.js';
import { PhaserGame } from './game/PhaserGame.js';
import { TitleScreen } from './ui/TitleScreen.js';
import { StarterSelect } from './ui/StarterSelect.js';
import { Hud } from './ui/Hud.js';
import { Dialogue } from './ui/Dialogue.js';
import { Toast } from './ui/Toast.js';
import { Panels } from './ui/Panels.js';
import { ArenaOverlay } from './ui/pvp/ArenaOverlay.js';
import { LoginGate } from './ui/LoginGate.js';
import { startNet } from './net/net.js';
import { useNet } from './net/net.js';

// Show the quest board automatically ONCE per page session (a "login pop-up"),
// not on every socket reconnect.
let questPopupShown = false;

export function App() {
  const screen = useGame((s) => s.screen);
  const wallet = useNet((s) => s.wallet); // null until signed in with a wallet
  const questView = useNet((s) => s.questView);

  useEffect(() => {
    audio.init();
    useGame.getState().boot();
    startNet(); // connect to the server (resume session, or wait for wallet login)
  }, []);

  useEffect(() => {
    if (!wallet || screen === 'title' || screen === 'starter') audio.playMusic('bgm_title', 0.4);
  }, [screen, wallet]);

  // Pop the quest board on login when there are quests to do (any unclaimed daily,
  // weekly, or onboarding mission). Only when EVERYTHING is claimed does it stay quiet.
  useEffect(() => {
    if (questPopupShown || screen !== 'playing' || !questView) return;
    questPopupShown = true; // one-shot per session, evaluated at login
    const hasUnclaimed = questView.daily.some((q) => !q.claimed) || questView.weekly.some((q) => !q.claimed) || (questView.onboarding ?? []).some((q) => !q.claimed);
    if (!hasUnclaimed) return;
    const t = setTimeout(() => {
      const g = useGame.getState();
      if (!g.panel && !g.dialogue) g.openPanel('quests'); // don't clobber a panel or the intro
    }, 700);
    return () => clearTimeout(t);
  }, [screen, questView]);

  // Mandatory wallet login — nothing else renders until the player is signed in.
  if (!wallet) {
    return (
      <div className="app">
        <LoginGate />
        <Toast />
      </div>
    );
  }

  return (
    <div className="app">
      {screen === 'title' && <TitleScreen />}
      {screen === 'starter' && <StarterSelect />}
      {screen === 'playing' && (
        <>
          <PhaserGame />
          <Hud />
          <Panels />
          <Dialogue />
          <Toast />
          <ArenaOverlay />
        </>
      )}
    </div>
  );
}
