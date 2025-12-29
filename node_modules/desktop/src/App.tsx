import { useState, useEffect } from 'react';
import CallSession from './pages/CallSession';
import OverlayWindow from './pages/OverlayWindow';
import './App.css';

function App() {
  const [route, setRoute] = useState<string>('');

  useEffect(() => {
    // Parse hash route on load and changes
    const handleHashChange = () => {
      const hash = window.location.hash || '#/';
      const path = hash.split('?')[0].replace('#', '');
      setRoute(path);
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Route to overlay window if path is /overlay
  if (route === '/overlay') {
    return <OverlayWindow />;
  }

  // Default: main app
  return <CallSession />;
}

export default App;
