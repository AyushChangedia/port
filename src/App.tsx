import { useCallback, useEffect, useState } from 'react';
import Environment from './components/Environment';
import Intro from './components/Intro';
import Nav from './components/Nav';
import Cursor from './components/Cursor';
import Console from './components/Console';
import Colophon from './components/Colophon';
import Hero from './components/chapters/Hero';
import About from './components/chapters/About';
import Work from './components/chapters/Work';
import System from './components/chapters/System';
import Contact from './components/chapters/Contact';
import { bootRuntime } from './lib/runtime';
import { measureChapters } from './lib/scroll';
import { play } from './lib/audio';

const MODE_KEY = 'ac.mode';

export default function App() {
  const [ready, setReady] = useState(false);
  const [colophon, setColophon] = useState(false);
  const [themeKey, setThemeKey] = useState(0);

  useEffect(() => bootRuntime(), []);

  // Stable: the opening sequence keys its timeline off this callback, and a
  // fresh identity each render would tear the sequence down and replay it.
  const handleIntroComplete = useCallback(() => setReady(true), []);

  // Chapter positions settle after the layout has, which is after the intro
  // releases the scroll lock and the webfonts land.
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(measureChapters, 120);
    return () => window.clearTimeout(timer);
  }, [ready]);

  // The inverted colour mode, remembered once found.
  const toggleMode = useCallback(() => {
    const root = document.documentElement;
    const next = root.dataset.mode === 'paper' ? 'night' : 'paper';
    if (next === 'paper') root.dataset.mode = 'paper';
    else delete root.dataset.mode;
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* storage unavailable — the mode still applies for this session */
    }
    setThemeKey((k) => k + 1);
    play('signal');
  }, []);

  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === 'paper') {
        document.documentElement.dataset.mode = 'paper';
        setThemeKey((k) => k + 1);
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <>
      <a className="skip-link" href="#origin">
        Skip to content
      </a>

      <Environment reveal={ready ? 1 : 0} themeKey={themeKey} />
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <Nav visible={ready} onSecretMode={toggleMode} />

      <main id="experience">
        <Hero ready={ready} />
        <About />
        <Work />
        <System />
        <Contact onColophon={() => setColophon(true)} />
      </main>

      <Cursor />
      <Console onToggleMode={toggleMode} />
      <Colophon open={colophon} onClose={() => setColophon(false)} />

      <Intro onComplete={handleIntroComplete} />
    </>
  );
}
