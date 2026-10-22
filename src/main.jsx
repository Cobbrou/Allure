import { Capacitor } from '@capacitor/core';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/global.css';

createRoot(document.getElementById('root')).render(<App />);

// Native shell hooks (Android back button, reminder taps), loaded only inside the app.
if (Capacitor.isNativePlatform()) {
  import('./lib/shell.js').then((m) => m.initShell());
  import('./lib/reminders.js').then((m) => m.openOnTap());
}
