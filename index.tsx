import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary';
import { reportError } from './services/telemetry';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
window.addEventListener('error', (event) => reportError(event.error ?? event.message, 'Window error'));
window.addEventListener('unhandledrejection', (event) => reportError(event.reason, 'Unhandled promise rejection'));
root.render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>
);
