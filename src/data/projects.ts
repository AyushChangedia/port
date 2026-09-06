/**
 * Project data. Descriptions and metrics come from the résumé and the current
 * portfolio — no invented clients, numbers, or links.
 *
 * `visual` selects a generative canvas renderer (see components/ProjectVisual).
 * The source material contains no project screenshots, so rather than
 * fabricating mockups each project is drawn as an honest, procedural diagram
 * of what it actually does.
 */

export type VisualKind = 'range' | 'city' | 'critique' | 'graph';

export interface ProjectLink {
  label: string;
  href: string;
}

export interface Project {
  id: string;
  index: string;
  title: string;
  /** Two or three words, used as the oversized display title. */
  displayTitle: string[];
  year: string;
  /** One line, shown in the exhibition. */
  tagline: string;
  /** Full description, shown in the case study. */
  body: string[];
  /** Verified headline result, or null when the source states none. */
  result: string | null;
  tech: string[];
  links: ProjectLink[];
  visual: VisualKind;
}

export const projects: Project[] = [
  {
    id: 'orb',
    index: '01',
    title: 'ORB Strategy Backtester',
    displayTitle: ['ORB', 'BACKTESTER'],
    year: '2026',
    tagline: 'A trading strategy, interrogated until it confessed where the money leaked.',
    body: [
      'Automated opening-range-breakout backtesting on Bank Nifty futures through a custom TradingView MCP integration, executing a six-month, 120-trade backtest at a 57.5% win rate.',
      'Engineered a parameter-optimization loop that isolated commission drag as the primary P&L leak — which pointed directly at a lower-frequency, higher-net-return variant of the strategy.',
    ],
    result: '57.5% win rate · 120-trade backtest · 6 months',
    tech: ['Python', 'Pine Script v5', 'TradingView MCP'],
    links: [],
    visual: 'range',
  },
  {
    id: 'git-city',
    index: '02',
    title: 'Git City',
    displayTitle: ['GIT', 'CITY'],
    year: '2026',
    tagline: 'Every repository is already a city. This one just makes you look at it.',
    body: [
      'A browser-based tool that replays any GitHub repository’s history as a 3D city — every file a building, every folder a district, building height driven by line count.',
      'The layout, camera fit and playback are pure geometry modules verified headlessly in Node, which kept the whole project at zero dependencies and no build step.',
    ],
    result: '~45s scrubbable playback · no backend · zero dependencies',
    tech: ['JavaScript', 'three.js', 'WebGL', 'GitHub API'],
    links: [{ label: 'Source', href: 'https://github.com/AyushChangedia/Git-City' }],
    visual: 'city',
  },
  {
    id: 'resume-roaster',
    index: '03',
    title: 'Résumé Roaster',
    displayTitle: ['RÉSUMÉ', 'ROASTER'],
    year: '2026',
    tagline: 'Honest feedback, delivered at the speed of an API call.',
    body: [
      'An AI web app that scores a résumé against a target job description and returns blunt, actionable feedback on gaps, weak bullets and filler.',
      'The critique is driven by an LLM prompting and scoring pipeline served over a FastAPI backend — strengths, weak spots, and the buzzwords worth cutting.',
    ],
    result: null,
    tech: ['Python', 'FastAPI', 'Groq LLM'],
    links: [{ label: 'Source', href: 'https://github.com/AyushChangedia/resume-roaster' }],
    visual: 'critique',
  },
  {
    id: 'commerce-api',
    index: '04',
    title: 'E-Commerce REST API',
    displayTitle: ['COMMERCE', 'API'],
    year: '2026',
    tagline: 'The unglamorous layer everything else quietly depends on.',
    body: [
      'A scalable e-commerce API with JWT authentication, role-based authorization, and transactional order processing with inventory management.',
      'Advanced querying — filtering, sorting and pagination — across product and order endpoints, for a secure, production-style API surface.',
    ],
    result: null,
    tech: ['Node.js', 'Express.js', 'MongoDB', 'JWT'],
    links: [],
    visual: 'graph',
  },
];
