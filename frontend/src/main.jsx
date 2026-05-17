import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

const rootEl = document.getElementById('root');
const tree = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Use createRoot (not hydrateRoot) on the prerendered HTML.
//
// The prerender exists so crawlers and social-preview bots see real content
// and per-route meta tags without executing JS — it's not a hydration
// optimization. Attempting hydration here causes React 18 #418 errors:
// SessionContext / AdminContext / NetworkContext fire mount-time API calls
// that resolve while React is still mid-hydration, and concurrent rendering
// treats the resulting state change as an "initial UI mismatch".
//
// createRoot side-steps the issue entirely. The prerendered shell displays
// instantly on first paint, then React replaces it with a fresh client
// render. Since both produce the same output, the swap is invisible.
if (rootEl.hasChildNodes()) {
  rootEl.innerHTML = '';
}
ReactDOM.createRoot(rootEl).render(tree);
