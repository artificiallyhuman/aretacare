import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

const rootEl = document.getElementById('root');

// Use createRoot (not hydrateRoot) on the prerendered HTML. The prerender
// exists so crawlers and social-preview bots see real content and per-route
// meta tags without executing JS — it's not a hydration optimization.
// Hydration here would trip React 18 #418 because SessionContext /
// AdminContext / NetworkContext fire mount-time API calls that resolve
// mid-hydration and look like state mismatches to concurrent rendering.
// createRoot side-steps that: it discards the prerendered children on first
// render and produces an identical tree, so the swap is invisible.
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
