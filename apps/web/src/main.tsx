import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts, bundled by Vite: no request leaves the app's origin.
import '@fontsource/vt323/400.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/tokens.css';
import './styles/app.css';
import ErrorBoundary from './components/ErrorBoundary.js';
import App from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
