/**
 * A container for all fuel consumption data associated with a specific lap.
 */
export interface ReferenceFuel {
  pointPos: Float32Array;
  /** The fuel consumed at each bucket index */
  fuelConsumed: Float32Array;
  /** The precomputed tangents at each bucket index */
  tangents: Float32Array;
  /** The interval between points in track percentage */
  interval: number;
  /** Total number of buckets/points in this lap */
  pointsCount: number;
  startFuel: number;
  finishFuel: number;
  lastTrackedPct: number;
  isCleanLap: boolean;
}

export interface ReferenceFuelBridge {
  getReferenceFuel: (
    seriesId: number,
    trackId: number,
    classId: number
  ) => Promise<ReferenceFuel>;
  saveReferenceFuel: (
    seriesId: number,
    trackId: number,
    classId: number,
    fuel: ReferenceFuel
  ) => Promise<void>;
}
