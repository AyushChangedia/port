export interface ChapterMeta {
  index: number;
  id: string;
  label: string;
  /** Shown in the corner readout as the environment changes state. */
  state: string;
}

/**
 * The five chapters, which are also the five states of the WebGL environment.
 * Keeping them in one list is what keeps the DOM and the canvas in step.
 */
export const chapters: ChapterMeta[] = [
  { index: 0, id: 'origin', label: 'Origin', state: 'Field' },
  { index: 1, id: 'about', label: 'About', state: 'Horizon' },
  { index: 2, id: 'work', label: 'Work', state: 'Corridor' },
  { index: 3, id: 'system', label: 'System', state: 'Constellation' },
  { index: 4, id: 'contact', label: 'Contact', state: 'Ascent' },
];
