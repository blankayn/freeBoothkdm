import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ui/ErrorBoundary';

import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/landing.css';
import './styles/booth.css';
import './styles/editor.css';
import './styles/chooser.css';

// Global safety net: MediaPipe / WebGL promise rejections otherwise vanish.
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (import.meta.env.DEV) console.error('[unhandledrejection]', event.reason);
    // Let ErrorBoundary handle render errors; this just avoids silent worker failures.
    event.preventDefault();
  });
  window.addEventListener('error', (event) => {
    if (import.meta.env.DEV) console.error('[window.error]', event.error ?? event.message);
  });
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <ErrorBoundary label="App">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
