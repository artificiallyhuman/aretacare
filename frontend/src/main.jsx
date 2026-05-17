import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import App from './App';
import './styles/index.css';

const rootEl = document.getElementById('root');
const tree = (
  <React.StrictMode>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </React.StrictMode>
);

if (rootEl.hasChildNodes()) {
  ReactDOM.hydrateRoot(rootEl, tree);
} else {
  ReactDOM.createRoot(rootEl).render(tree);
}
