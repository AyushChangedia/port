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
  /**
   * Ground position: [x, z].
   *
   * Scaled out from the original layout so the islands built under these have
   * real air between them. The relative arrangement is unchanged, so the map
   * and the directory read exactly as before.
   */
  at: [number, number];
  /** How close you must be for the structure to open. */
  reach: number;
  /** Radius you cannot walk through. */
  solid: number;
  /** Links a project structure to data/projects.ts. */
  projectId?: string;
}

/**
 * The extent the minimap normalises against.
 *
 * Grown with the layout: the islands sit further apart than they did, and the
 * map has to keep the outermost one inside its circle.
 */
export const WORLD_RADIUS = 88;

export const places: Place[] = [
  {
    id: 'origin',
    kind: 'origin',
    name: 'Ayush Changedia',
    sub: 'Start here',
    at: [0.0, 0.0],
    reach: 5,
    solid: 2.2,
  },
  {
    id: 'about',
    kind: 'about',
    name: 'About',
    sub: 'Who he is',
    at: [-27.8, -20.4],
    reach: 5.5,
    solid: 3,
  },
  {
    id: 'record',
    kind: 'record',
    name: 'Experience',
    sub: 'Internships & leadership',
    at: [-33.3, 14.8],
    reach: 5.5,
    solid: 3.2,
  },
  {
    id: 'orb',
    kind: 'project',
    projectId: 'orb',
    name: 'ORB Backtester',
    sub: 'Project 01',
    at: [25.9, -24.1],
    reach: 5.5,
    solid: 3.4,
  },
  {
    id: 'git-city',
    kind: 'project',
    projectId: 'git-city',
    name: 'Git City',
    sub: 'Project 02',
    at: [40.7, 5.6],
    reach: 6,
    solid: 3.8,
  },
  {
    id: 'resume-roaster',
    kind: 'project',
    projectId: 'resume-roaster',
    name: 'Résumé Roaster',
    sub: 'Project 03',
    at: [20.4, 29.6],
    reach: 5.5,
    solid: 3,
  },
  {
    id: 'commerce-api',
    kind: 'project',
    projectId: 'commerce-api',
    name: 'Commerce API',
    sub: 'Project 04',
    at: [-9.2, 40.7],
    reach: 5.5,
    solid: 3.4,
  },
  {
    id: 'skills',
    kind: 'skills',
    name: 'Toolkit',
    sub: 'What he builds with',
    at: [3.7, -44.4],
    reach: 6,
    solid: 3.6,
  },
  {
    id: 'contact',
    kind: 'contact',
    name: 'Contact',
    sub: 'Ways to reach him',
    at: [-44.4, 38.9],
    reach: 5.5,
    solid: 3,
  },
];

export function placeById(id: string): Place | undefined {
  return places.find((p) => p.id === id);
}
