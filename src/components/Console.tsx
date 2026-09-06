import { useCallback, useEffect, useRef, useState } from 'react';
import { profile } from '../data/profile';
import { projects } from '../data/projects';
import { skills } from '../data/skills';
import { socials } from '../data/socials';
import { experience } from '../data/experience';
import { play } from '../lib/audio';
import './console.css';

interface Line {
  kind: 'in' | 'out' | 'note';
  text: string;
}

const BANNER: Line[] = [
  { kind: 'note', text: `${profile.fullName} — interactive profile` },
  { kind: 'note', text: 'Type `help` for commands, `exit` to close.' },
];

interface Props {
  onToggleMode: () => void;
}

/**
 * A console, opened by typing the owner's name anywhere on the page.
 *
 * Everything it prints is read from the same data the rest of the site uses,
 * so it can never drift out of date or state something the page does not.
 */
export default function Console({ onToggleMode }: Props) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>(BANNER);
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  const print = useCallback((entries: Line[]) => {
    setLines((prev) => [...prev, ...entries]);
  }, []);

  const run = useCallback(
    (raw: string) => {
      const input = raw.trim();
      if (!input) return;
      const [command, ...args] = input.toLowerCase().split(/\s+/);
      const out = (...texts: string[]): Line[] => texts.map((text) => ({ kind: 'out' as const, text }));

      print([{ kind: 'in', text: input }]);
      play('tick');

      switch (command) {
        case 'help':
          print(
            out(
              'whoami      identity',
              'status      current availability',
              'system      runtime and build',
              'work        projects, with links',
              'stack       technologies in use',
              'roles       internships',
              'contact     how to reach him',
              'invert      flip the colour mode',
              'clear       clear this log',
              'exit        close the console',
            ),
          );
          break;

        case 'whoami':
          print(
            out(
              profile.fullName,
              profile.role,
              `${profile.education.degree}, ${profile.education.institution}`,
              profile.location,
            ),
          );
          break;

        case 'status':
          print(
            out(
              `availability : ${profile.availability}`,
              `cgpa         : ${profile.education.cgpa}`,
              `enrolled     : ${profile.education.period}`,
              `internships  : ${experience.length}`,
              'state        : building',
            ),
          );
          break;

        case 'system':
          print(
            out(
              'renderer  : WebGL point field — one scene, five states',
              'motion    : GSAP ScrollTrigger + Lenis',
              'ui        : React + TypeScript, Vite',
              'sound     : synthesised, off by default',
              'data      : typed modules, no CMS',
            ),
          );
          break;

        case 'work':
        case 'projects':
          print(
            projects.flatMap((project) => {
              const link = project.links[0]?.href ?? 'source not public';
              return out(
                `${project.index}  ${project.title}  (${project.year})`,
                `    ${project.tech.join(' · ')}`,
                `    ${link}`,
              );
            }),
          );
          break;

        case 'stack': {
          const filter = args[0];
          const list = filter ? skills.filter((s) => s.group === filter) : skills;
          if (list.length === 0) {
            print(out(`no technologies in group "${filter}"`));
            break;
          }
          print(out(list.map((s) => s.name).join(', ')));
          break;
        }

        case 'roles':
          print(
            experience.flatMap((role) =>
              out(`${role.period}  ${role.title}`, `    ${role.org} · ${role.place}`),
            ),
          );
          break;

        case 'contact':
          print(out(...socials.map((s) => `${s.label.padEnd(9)} ${s.handle}`)));
          break;

        case 'invert':
          onToggleMode();
          print(out('colour mode inverted.'));
          break;

        case 'clear':
          setLines(BANNER);
          break;

        case 'exit':
        case 'close':
          setOpen(false);
          break;

        case 'sudo':
          print(out(`${profile.firstName} is not in the sudoers file. This incident has been logged.`));
          break;

        default:
          print(out(`command not found: ${command}`, 'type `help` for the list'));
      }
    },
    [onToggleMode, print],
  );

  // The trigger: his name, typed anywhere. Not advertised.
  useEffect(() => {
    const secret = profile.firstName.toUpperCase();
    let buffer = '';

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return;

      buffer = (buffer + e.key.toUpperCase()).slice(-secret.length);
      if (buffer === secret) {
        buffer = '';
        restoreFocus.current = document.activeElement as HTMLElement | null;
        setOpen(true);
        play('open');
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      restoreFocus.current?.focus?.();
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  if (!open) return null;

  return (
    <div className="console" role="dialog" aria-label="Console">
      <div className="console-bar">
        <span className="micro console-title">Console</span>
        <button type="button" className="micro console-close" onClick={() => setOpen(false)}>
          Esc
        </button>
      </div>

      <div className="console-log" ref={logRef} aria-live="polite">
        {lines.map((line, i) => (
          <p key={i} className={`console-line console-line--${line.kind}`}>
            {line.kind === 'in' && <span className="console-caret" aria-hidden="true">›</span>}
            {line.text}
          </p>
        ))}
      </div>

      <form
        className="console-input"
        onSubmit={(e) => {
          e.preventDefault();
          run(value);
          setValue('');
        }}
      >
        <span className="console-caret" aria-hidden="true">›</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          aria-label="Console command"
          placeholder="help"
        />
      </form>
    </div>
  );
}
