/**
 * The technology system.
 *
 * Only technologies that appear in the résumé or the current portfolio are
 * listed. `projects` maps a technology to the project ids that actually use
 * it, which drives the hover linking in the constellation.
 */

export type SkillGroup = 'language' | 'backend' | 'ai' | 'data' | 'tooling' | 'concept';

export interface Skill {
  id: string;
  name: string;
  group: SkillGroup;
  /** Project ids (see data/projects.ts) that use this technology. */
  projects: string[];
  /** Relative prominence, 0–1. Drives node size only. */
  weight: number;
}

export const groupLabels: Record<SkillGroup, string> = {
  language: 'Languages',
  backend: 'Backend & APIs',
  ai: 'AI & LLMs',
  data: 'Data & Databases',
  tooling: 'Tooling',
  concept: 'Core concepts',
};

export const skills: Skill[] = [
  // Languages
  { id: 'python', name: 'Python', group: 'language', projects: ['orb', 'resume-roaster'], weight: 1 },
  { id: 'javascript', name: 'JavaScript', group: 'language', projects: ['git-city', 'commerce-api'], weight: 0.9 },
  { id: 'cpp', name: 'C++', group: 'language', projects: [], weight: 0.6 },
  { id: 'sql', name: 'SQL', group: 'language', projects: [], weight: 0.85 },
  { id: 'htmlcss', name: 'HTML / CSS', group: 'language', projects: ['git-city'], weight: 0.6 },

  // Backend & APIs
  { id: 'node', name: 'Node.js', group: 'backend', projects: ['commerce-api', 'git-city'], weight: 0.95 },
  { id: 'express', name: 'Express.js', group: 'backend', projects: ['commerce-api'], weight: 0.85 },
  { id: 'fastapi', name: 'FastAPI', group: 'backend', projects: ['resume-roaster'], weight: 0.9 },
  { id: 'rest', name: 'REST APIs', group: 'backend', projects: ['commerce-api', 'resume-roaster'], weight: 0.9 },
  { id: 'jwt', name: 'JWT Auth', group: 'backend', projects: ['commerce-api'], weight: 0.7 },

  // AI & LLMs
  { id: 'llm', name: 'OpenAI / LLM APIs', group: 'ai', projects: ['resume-roaster'], weight: 0.95 },
  { id: 'groq', name: 'Groq LLM', group: 'ai', projects: ['resume-roaster'], weight: 0.7 },
  { id: 'numpy', name: 'NumPy', group: 'ai', projects: ['orb'], weight: 0.6 },
  { id: 'pandas', name: 'Pandas', group: 'ai', projects: ['orb'], weight: 0.75 },

  // Data & Databases
  { id: 'postgres', name: 'PostgreSQL', group: 'data', projects: [], weight: 0.85 },
  { id: 'mongo', name: 'MongoDB', group: 'data', projects: ['commerce-api'], weight: 0.75 },
  { id: 'mysql', name: 'MySQL', group: 'data', projects: [], weight: 0.6 },
  { id: 'powerbi', name: 'Power BI', group: 'data', projects: [], weight: 0.7 },
  { id: 'ga4', name: 'Google Analytics 4', group: 'data', projects: [], weight: 0.55 },
  { id: 'excel', name: 'Excel', group: 'data', projects: [], weight: 0.5 },

  // Tooling
  { id: 'git', name: 'Git & GitHub', group: 'tooling', projects: ['git-city'], weight: 0.9 },
  { id: 'threejs', name: 'three.js', group: 'tooling', projects: ['git-city'], weight: 0.8 },
  { id: 'webgl', name: 'WebGL', group: 'tooling', projects: ['git-city'], weight: 0.75 },
  { id: 'pine', name: 'Pine Script', group: 'tooling', projects: ['orb'], weight: 0.7 },
  { id: 'mcp', name: 'TradingView MCP', group: 'tooling', projects: ['orb'], weight: 0.65 },
  { id: 'jquery', name: 'jQuery', group: 'tooling', projects: [], weight: 0.4 },

  // Core concepts
  { id: 'oop', name: 'OOP', group: 'concept', projects: [], weight: 0.6 },
  { id: 'dbms', name: 'DBMS', group: 'concept', projects: [], weight: 0.6 },
  { id: 'dsa', name: 'Data Structures', group: 'concept', projects: [], weight: 0.7 },
  { id: 'analysis', name: 'Data Analysis', group: 'concept', projects: ['orb'], weight: 0.65 },
];
