import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();

// The inline script in index.html applies the .dark class on <html> from
// localStorage before React mounts, so reading classList here gives a
// hydration-safe initial value (prerender = no class = false; client = whatever
// the inline script set).
const readInitialIsDark = () => {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
};

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(readInitialIsDark);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(prev => !prev);
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
