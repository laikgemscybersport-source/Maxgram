import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { isNativeApp } from './api.js';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);

// В Capacitor-обёртке ассеты и так лежат внутри APK, а офлайн-кэш сервиса
// конфликтует с обновлением сборки — поэтому service worker только для веба.
if ('serviceWorker' in navigator && !isNativeApp() && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
