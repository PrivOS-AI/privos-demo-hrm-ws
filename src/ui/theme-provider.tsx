/**
 * Theme provider — syncs with Privos host theme or allows manual override.
 * Modes: 'auto' (follow host dark/light), 'light', 'dark'.
 * Sets data-theme attribute on <html> for CSS targeting.
 * Background colors are defined in CSS per theme — no inline overrides.
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

type ThemeMode = 'auto' | 'light' | 'dark';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'auto',
  resolved: 'light',
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

interface ThemeProviderProps {
  children: ReactNode;
  /** Host theme from Privos (via usePrivosContext().theme) */
  hostTheme: string;
}

export function ThemeProvider({ children, hostTheme }: ThemeProviderProps) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    try { return (localStorage.getItem('theme-mode') as ThemeMode) || 'auto'; }
    catch { return 'auto'; }
  });

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    try { localStorage.setItem('theme-mode', m); } catch {}
  }, []);

  const hostIsDark = hostTheme === 'dark' || hostTheme === 'high-contrast';
  const resolved: ResolvedTheme = mode === 'auto'
    ? (hostIsDark ? 'dark' : 'light')
    : mode;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
  }, [resolved]);

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

/** Small theme toggle button */
export function ThemeToggle() {
  const { mode, setMode } = useTheme();
  const options: { value: ThemeMode; label: string }[] = [
    { value: 'auto', label: 'Auto' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  return (
    <div className="theme-toggle">
      {options.map((o) => (
        <button
          key={o.value}
          className={`theme-toggle-btn ${mode === o.value ? 'active' : ''}`}
          onClick={() => setMode(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
