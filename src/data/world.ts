/**
 * The layout of the world.
 *
 * Every piece of content Ayush has is a place you can walk to. Positions are
 * metres on the ground plane; the arrival plaza is the origin and everything
 * else is arranged around it so there is always a landmark in view.
 */

export type PlaceKind =
  | 'origin'
  | 'about'
  | 'record'
  | 'project'
  | 'skills'
  | 'contact';

export interface Place {
  id: string;
  kind: PlaceKind;
  /** Shown on the floating sign and in the directory. */
  name: string;
  /** Small line under the sign. */
  sub: string;
  /** Ground position: [x, z]. */
  at: [number, number];
  /** How close you must be for the structure to open. */
  reach: number;
  /** Radius you cannot walk through. */
  solid: number;
  /** Links a project structure to data/projects.ts. */
  projectId?: string;
}

export const WORLD_RADIUS = 46;

export const places: Place[] = [
  {
    id: 'origin',
    kind: 'origin',
    name: 'Ayush Changedia',
    sub: 'Start here',
    at: [0, 0],
    reach: 5,
    solid: 2.2,
  },
  {
    id: 'about',
    kind: 'about',
    name: 'About',
    sub: 'Who he is',
    at: [-15, -11],
    reach: 5.5,
    solid: 3,
  },
  {
    id: 'record',
    kind: 'record',
    name: 'Experience',
    sub: 'Internships & leadership',
    at: [-18, 8],
    reach: 5.5,
    solid: 3.2,
  },
  {
    id: 'orb',
    kind: 'project',
    projectId: 'orb',
    name: 'ORB Backtester',
    sub: 'Project 01',
    at: [14, -13],
    reach: 5.5,
    solid: 3.4,
  },
  {
    id: 'git-city',
    kind: 'project',
    projectId: 'git-city',
    name: 'Git City',
    sub: 'Project 02',
    at: [22, 3],
    reach: 6,
    solid: 3.8,
  },
  {
    id: 'resume-roaster',
    kind: 'project',
    projectId: 'resume-roaster',
    name: 'Résumé Roaster',
    sub: 'Project 03',
    at: [11, 16],
    reach: 5.5,
    solid: 3,
  },
  {
    id: 'commerce-api',
    kind: 'project',
    projectId: 'commerce-api',
    name: 'Commerce API',
    sub: 'Project 04',
    at: [-5, 22],
    reach: 5.5,
    solid: 3.4,
  },
  {
    id: 'skills',
    kind: 'skills',
    name: 'Toolkit',
    sub: 'What he builds with',
    at: [2, -24],
    reach: 6,
    solid: 3.6,
  },
  {
    id: 'contact',
    kind: 'contact',
    name: 'Contact',
    sub: 'Ways to reach him',
    at: [-24, 21],
    reach: 5.5,
    solid: 3,
  },
];

export function placeById(id: string): Place | undefined {
  return places.find((p) => p.id === id);
}
