import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Base layer first. Importing App before this would evaluate every component's
// stylesheet ahead of the base, and the base would then win every tie.
import './styles/global.css';
import App from './App';

// The browser must not restore a scroll position from a previous visit before
// the opening sequence has decided where the page starts.
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
