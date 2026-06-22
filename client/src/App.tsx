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

export function App() {
  const screen = useGame((s) => s.screen);
  const wallet = useNet((s) => s.wallet); // null until signed in with a wallet

  useEffect(() => {
    audio.init();
    useGame.getState().boot();
    startNet(); // connect to the server (resume session, or wait for wallet login)
  }, []);

  useEffect(() => {
    if (!wallet || screen === 'title' || screen === 'starter') audio.playMusic('bgm_title', 0.4);
  }, [screen, wallet]);

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
