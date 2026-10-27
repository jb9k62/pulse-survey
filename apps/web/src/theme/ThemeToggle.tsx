/**
 * One button that flips between the light and dark theme. The DOM change
 * happens in the click handler, not in an effect, because it is a response to
 * the click and not a sync with something outside React.
 */

import { useState } from 'react';
import { applyTheme, currentTheme, type Theme } from './theme.js';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';

  return (
    <button
      className="button button-ghost"
      type="button"
      aria-label={`Switch to ${next} theme`}
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
    >
      <span aria-hidden="true">{next === 'dark' ? '☾' : '☀'}</span>{' '}
      {next === 'dark' ? 'Dark' : 'Light'}
    </button>
  );
}
