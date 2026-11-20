/** A place on the map: a name and a position. */
export type Place = {
  name: string;
  latitude: number;
  longitude: number;
};

/** Two places are the same place when name and position match. */
export const samePlace = (a: Place, b: Place) =>
  a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
  Math.abs(a.latitude - b.latitude) < 0.0001 &&
  Math.abs(a.longitude - b.longitude) < 0.0001;
