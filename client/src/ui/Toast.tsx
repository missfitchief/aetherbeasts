import { useEffect } from 'react';
import { useGame } from '../state/store.js';

export function Toast() {
  const toast = useGame((s) => s.toast);
  const clear = useGame((s) => s.clearToast);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(clear, 2400);
    return () => clearTimeout(id);
  }, [toast, clear]);

  if (!toast) return null;
  return <div className="toast">{toast.text}</div>;
}
