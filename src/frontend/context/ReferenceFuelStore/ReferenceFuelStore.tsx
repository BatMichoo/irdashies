import {
  TrackLocation,
  ReferenceFuel,
  ReferenceFuelBridge,
} from '@irdashies/types';
import { precomputePCHIPTangents } from './pchipTangents';
import { create } from 'zustand';
import logger from '@irdashies/utils/logger';

function isLapClean(trackSurface: number, isOnPitRoad: boolean): boolean {
  return trackSurface === TrackLocation.OnTrack && !isOnPitRoad;
}

const EMPTY_FUEL_LAP: Readonly<ReferenceFuel> = {
  startFuel: -1,
  finishFuel: -1,
  fuelConsumed: new Float32Array().fill(-1),
  pointPos: new Float32Array().fill(-1),
  tangents: new Float32Array().fill(0),
  interval: -1,
  pointsCount: 0,
  lastTrackedPct: -1,
  isCleanLap: false,
};

const TARGET_SPACING_METERS = 10;

const BUFFER_POOL: Float32Array[] = [];

function acquireBuffer(size: number): Float32Array {
  const buf = BUFFER_POOL.pop();
  if (buf && buf.length === size) {
    return buf;
  }
  return new Float32Array(size);
}

function releaseFuelBuffers(lap: ReferenceFuel | undefined) {
  if (!lap || lap.pointsCount === 0) return;
  BUFFER_POOL.push(lap.fuelConsumed);
  BUFFER_POOL.push(lap.pointPos);
  BUFFER_POOL.push(lap.tangents);
}

function createReferenceFuel(
  pointsCount: number,
  interval: number,
  startFuel: number,
  trackPct: number,
  isCleanLap: boolean
): ReferenceFuel {
  return {
    startFuel,
    finishFuel: -1,
    fuelConsumed: acquireBuffer(pointsCount).fill(-1),
    pointPos: acquireBuffer(pointsCount).fill(-1),
    tangents: acquireBuffer(pointsCount).fill(0),
    interval,
    pointsCount,
    lastTrackedPct: trackPct,
    isCleanLap,
  };
}

function getBucketIndex(trackPct: number, pointsCount: number): number {
  const index = Math.floor(trackPct * pointsCount);
  return Math.min(Math.max(index, 0), pointsCount - 1);
}

export interface ReferenceFuelRegistryState {
  activeLaps: Map<number, ReferenceFuel>;
  bestLaps: Map<number, ReferenceFuel>;
  persistedLaps: Map<number, ReferenceFuel>;
  trackId: number | null;
  trackLength: number | null;
  interval: number;
  pointsCount: number;

  initialize: (
    bridge: ReferenceFuelBridge,
    seriesId: number,
    trackId: number,
    trackLength: number,
    classList: number[]
  ) => Promise<void>;

  collectBulkData: (
    bridge: ReferenceFuelBridge,
    seriesId: number,
    playerCarIdx: number,
    playerClassId: number,
    playerLapDistPct: number,
    playerOnPitRoad: boolean,
    playerFuelLevel: number
  ) => void;

  getReferenceFuel: (
    carIdx: number,
    classId: number,
    usePersistence: boolean
  ) => ReferenceFuel;

  completeSession: () => void;
}

export const useReferenceFuelStore = create<ReferenceFuelRegistryState>(
  (set, get) => ({
    activeLaps: new Map<number, ReferenceFuel>(),
    bestLaps: new Map<number, ReferenceFuel>(),
    persistedLaps: new Map<number, ReferenceFuel>(),
    trackId: null,
    trackLength: null,
    interval: 0,
    pointsCount: 0,

    initialize: async (bridge, seriesId, trackId, trackLength, classList) => {
      const pointsCount = Math.ceil(trackLength / TARGET_SPACING_METERS);
      const interval = parseFloat((1 / pointsCount).toFixed(6));

      const results = await Promise.all(
        classList.map(async (classId) => {
          try {
            const fuel = (await bridge.getReferenceFuel(
              seriesId,
              trackId,
              classId
            )) as ReferenceFuel;

            return { classId, fuel };
          } catch (error) {
            logger.error(
              `[RefFuelStore] Failed to load reference fuel for class ${classId}:`,
              error
            );
            return { classId, fuel: null };
          }
        })
      );

      const newPersistedLaps = new Map<number, ReferenceFuel>();
      results.forEach(({ classId, fuel }) => {
        if (fuel) {
          newPersistedLaps.set(classId, fuel);
        }
      });

      set({
        trackId,
        trackLength,
        pointsCount,
        interval,
        persistedLaps: newPersistedLaps,
        activeLaps: new Map<number, ReferenceFuel>(),
        bestLaps: new Map<number, ReferenceFuel>(),
      });
    },

    collectBulkData: (
      bridge,
      seriesId,
      playerCarIdx,
      playerClassId,
      playerLapDistPct,
      playerOnPitRoad,
      playerFuelLevel
    ) => {
      const {
        activeLaps,
        bestLaps,
        persistedLaps,
        trackId,
        pointsCount,
        interval,
      } = get();

      if (playerCarIdx === undefined || playerCarIdx === -1) return;
      if (playerLapDistPct === undefined || playerLapDistPct === -1) return;

      const isOnPitRoad = playerOnPitRoad;
      const refLap = activeLaps.get(playerCarIdx);
      const key = getBucketIndex(playerLapDistPct, pointsCount);

      if (!refLap) {
        const isTrackedFromStart = playerLapDistPct <= interval;
        activeLaps.set(
          playerCarIdx,
          createReferenceFuel(
            pointsCount,
            interval,
            isTrackedFromStart ? playerFuelLevel : -1,
            playerLapDistPct,
            isTrackedFromStart &&
              isLapClean(TrackLocation.OnTrack, isOnPitRoad) &&
              playerFuelLevel > 0
          )
        );
        return;
      }

      const isLapComplete =
        refLap.lastTrackedPct > 0.95 && playerLapDistPct < 0.05;

      if (isLapComplete) {
        refLap.finishFuel = playerFuelLevel;
        const currentLapFuel = refLap.startFuel - refLap.finishFuel;
        let isPromoted = false;

        if (currentLapFuel > 0 && refLap.startFuel > 0 && playerClassId > 0) {
          const persistedLap = persistedLaps.get(playerClassId);
          const persistedLapFuel = persistedLap
            ? persistedLap.startFuel - persistedLap.finishFuel
            : null;

          const bestLap = bestLaps.get(playerCarIdx);
          const bestLapFuel = bestLap
            ? bestLap.startFuel - bestLap.finishFuel
            : null;

          // In fuel mode, "best" is the lap with the lowest clean fuel consumption (or highest efficiency)
          const isNewBestFuelLap = !bestLapFuel || currentLapFuel < bestLapFuel;

          if (isNewBestFuelLap && refLap.isCleanLap) {
            precomputePCHIPTangents(refLap);
            isPromoted = true;

            if (bestLap && bestLap !== refLap) {
              const isStillPersisted = Array.from(
                persistedLaps.values()
              ).includes(bestLap);
              if (!isStillPersisted) releaseFuelBuffers(bestLap);
            }

            bestLaps.set(playerCarIdx, refLap);

            const isCurrentBetterThanPersisted =
              currentLapFuel < (persistedLapFuel || Number.MAX_SAFE_INTEGER);

            if (isCurrentBetterThanPersisted) {
              if (persistedLap && persistedLap !== refLap) {
                const isStillBest = Array.from(bestLaps.values()).includes(
                  persistedLap
                );
                if (!isStillBest) releaseFuelBuffers(persistedLap);
              }

              persistedLaps.set(playerClassId, refLap);

              if (seriesId !== -1 && trackId !== null) {
                bridge
                  .saveReferenceFuel(seriesId, trackId, playerClassId, refLap)
                  .catch((err: Error) => {
                    logger.error(
                      `[RefFuelStore] Failed to save class ${playerClassId}`,
                      err
                    );
                  });
              }
            }
          }
        }

        if (!isPromoted) {
          releaseFuelBuffers(refLap);
        }

        const isTrackedFromStart = playerLapDistPct <= interval;
        activeLaps.set(
          playerCarIdx,
          createReferenceFuel(
            pointsCount,
            interval,
            playerFuelLevel,
            playerLapDistPct,
            isTrackedFromStart &&
              isLapClean(TrackLocation.OnTrack, isOnPitRoad) &&
              playerFuelLevel > 0
          )
        );

        return;
      }

      if (refLap.isCleanLap && isOnPitRoad) {
        refLap.isCleanLap = false;
      }

      if (refLap.pointPos[key] === -1) {
        if (refLap.isCleanLap) {
          const prevKey = key === 0 ? undefined : key - 1;

          if (prevKey !== undefined && refLap.pointPos[prevKey] === -1) {
            refLap.isCleanLap = false;
          }

          if (refLap.isCleanLap && refLap.startFuel > 0) {
            // Store the cumulative fuel consumed since the start of the lap
            refLap.fuelConsumed[key] = refLap.startFuel - playerFuelLevel;
            refLap.pointPos[key] = playerLapDistPct;
          }
        }

        refLap.lastTrackedPct = playerLapDistPct;
      }
    },

    getReferenceFuel: (carIdx, classId, usePersistence) => {
      const { bestLaps, persistedLaps } = get();
      const bestLap = bestLaps.get(carIdx);

      if (usePersistence || !bestLap) {
        return persistedLaps.get(classId) ?? EMPTY_FUEL_LAP;
      }
      return bestLap;
    },

    completeSession: () => {
      BUFFER_POOL.length = 0;

      set({
        activeLaps: new Map<number, ReferenceFuel>(),
        bestLaps: new Map<number, ReferenceFuel>(),
        persistedLaps: new Map<number, ReferenceFuel>(),
        trackId: null,
        trackLength: null,
        interval: 0,
        pointsCount: 0,
      });
    },
  })
);
