import { useEffect, useState } from 'react';
import { loadSoundPreference, onSoundChange, toggleSound } from '../lib/audio';
import './sound.css';

const BARS = [0.35, 0.85, 0.55, 1, 0.45];

/**
 * Sound is opt-in, remembered, and never starts on its own. The bars animate
 * only while it is on, so the control states its own condition without a label.
 */
export default function SoundToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(loadSoundPreference());
    return onSoundChange(setOn);
  }, []);

  return (
    <button
      type="button"
      className="sound-toggle"
      data-on={on}
      aria-pressed={on}
      onClick={() => toggleSound()}
      data-cursor="text"
    >
      <span className="visually-hidden">{on ? 'Turn interface sound off' : 'Turn interface sound on'}</span>
      <span className="sound-bars" aria-hidden="true">
        {BARS.map((scale, i) => (
          <span key={i} style={{ '--bar-scale': scale, '--bar-index': i } as React.CSSProperties} />
        ))}
      </span>
      <span className="sound-label micro" aria-hidden="true">{on ? 'On' : 'Off'}</span>
    </button>
  );
}
