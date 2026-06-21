import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import { useGame } from './state/store.js';
import './styles.css';

if (import.meta.env.DEV) {
  (window as unknown as { __store: typeof useGame }).__store = useGame;
}

// NOTE: StrictMode intentionally omitted — its dev double-mount destroys the
// Phaser game mid-boot, leaving a zombie canvas / stuck Boot scene.
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
