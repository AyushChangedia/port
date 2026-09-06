import type { ElementType, ReactNode } from 'react';
import { useInView } from '../lib/hooks';
import './type.css';

interface MaskLinesProps {
  lines: readonly ReactNode[];
  as?: ElementType;
  className?: string;
  /** Seconds between each line. */
  stagger?: number;
  delay?: number;
  threshold?: number;
}

/**
 * The reveal used everywhere: each line clipped by its own box and pushed up
 * from below. Lines are passed explicitly rather than measured, so the mask
 * never lands mid-word at an unlucky viewport width.
 */
export function MaskLines({
  lines,
  as: Tag = 'div',
  className = '',
  stagger = 0.08,
  delay = 0,
  threshold = 0.25,
}: MaskLinesProps) {
  const [ref, seen] = useInView<HTMLDivElement>(threshold);

  return (
    <Tag className={className} ref={ref}>
      {lines.map((line, i) => (
        <span className={`line${seen ? ' is-in' : ''}`} key={i}>
          <span
            style={{
              transitionDelay: `${delay + i * stagger}s`,
              transitionProperty: 'transform',
              transitionDuration: '1.1s',
              transitionTimingFunction: 'var(--ease-out)',
            }}
          >
            {line}
          </span>
        </span>
      ))}
    </Tag>
  );
}

interface FadeProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** Distance travelled, in pixels. */
  y?: number;
  as?: ElementType;
  threshold?: number;
}

/** A quieter reveal for body copy and metadata. */
export function Fade({ children, className = '', delay = 0, y = 18, as: Tag = 'div', threshold = 0.2 }: FadeProps) {
  const [ref, seen] = useInView<HTMLDivElement>(threshold);
  return (
    <Tag
      ref={ref}
      className={`fade${seen ? ' is-in' : ''} ${className}`}
      style={{ '--fade-delay': `${delay}s`, '--fade-y': `${y}px` } as React.CSSProperties}
    >
      {children}
    </Tag>
  );
}

/** The small numbered label that opens every chapter. */
export function ChapterMark({ index, label }: { index: number; label: string }) {
  return (
    <Fade className="chapter-mark" y={10}>
      <span className="chapter-mark-index micro">{String(index).padStart(2, '0')}</span>
      <span className="chapter-mark-rule" aria-hidden="true" />
      <span className="chapter-mark-label micro">{label}</span>
    </Fade>
  );
}
