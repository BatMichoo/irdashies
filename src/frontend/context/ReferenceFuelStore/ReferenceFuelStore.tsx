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
    fuelConsumed: new Float32Array(pointsCount).fill(-1),
    pointPos: new Float32Array(pointsCount).fill(-1),
    tangents: new Float32Array(pointsCount).fill(0),
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
  activeLap: ReferenceFuel;
  lapHistory: ReferenceFuel[];
  persistedLap: ReferenceFuel;
  minLap: ReferenceFuel;
  maxLap: ReferenceFuel;
  trackId: number | null;
  trackLength: number | null;
  interval: number;
  pointsCount: number;
  tankSize: number;

  initialize: (
    bridge: ReferenceFuelBridge,
    seriesId: number,
    trackId: number,
    trackLength: number,
    classList: number[],
    playerClassId: number,
    tankSize: number
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

  getAvgConsumption: (numLaps?: number, usePersistence?: boolean) => number;

  getFuelStats: (
    numLaps: number,
    usePersistence: boolean
  ) => {
    minLap: ReferenceFuel;
    maxLap: ReferenceFuel;
    avgConsumption: number;
  };

  completeSession: () => void;
  saveAverageLap: (
    bridge: ReferenceFuelBridge,
    seriesId: number,
    playerClassId: number
  ) => Promise<void>;
}

export const useReferenceFuelStore = create<ReferenceFuelRegistryState>(
  (set, get) => ({
    activeLap: EMPTY_FUEL_LAP,
    lapHistory: [],
    persistedLap: EMPTY_FUEL_LAP,
    minLap: EMPTY_FUEL_LAP,
    maxLap: EMPTY_FUEL_LAP,
    trackId: null,
    trackLength: null,
    interval: 0,
    pointsCount: 0,
    tankSize: -1,

    initialize: async (
      bridge,
      seriesId,
      trackId,
      trackLength,
      classList,
      playerClassId,
      tankSize
    ) => {
      const pointsCount = Math.ceil(trackLength / TARGET_SPACING_METERS);
      const interval = parseFloat((1 / pointsCount).toFixed(6));

      let persistedLap = EMPTY_FUEL_LAP;
      if (playerClassId && playerClassId > 0) {
        try {
          const fuel = (await bridge.getReferenceFuel(
            seriesId,
            trackId,
            playerClassId
          )) as ReferenceFuel;

          if (fuel) {
            persistedLap = fuel;
          }
        } catch (error) {
          logger.error(
            `[RefFuelStore] Failed to load reference fuel for class ${playerClassId}:`,
            error
          );
        }
      }

      set({
        trackId,
        trackLength,
        pointsCount,
        interval,
        persistedLap,
        activeLap: EMPTY_FUEL_LAP,
        lapHistory: [],
        minLap: EMPTY_FUEL_LAP,
        maxLap: EMPTY_FUEL_LAP,
        tankSize: tankSize,
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
      const { activeLap, minLap, maxLap, pointsCount, interval } = get();

      if (playerCarIdx === undefined || playerCarIdx === -1) return;
      if (playerLapDistPct === undefined || playerLapDistPct === -1) return;

      const isOnPitRoad = playerOnPitRoad;
      const key = getBucketIndex(playerLapDistPct, pointsCount);

      if (activeLap.startFuel === -1) {
        const isTrackedFromStart = playerLapDistPct <= interval;
        set({
          activeLap: createReferenceFuel(
            pointsCount,
            interval,
            isTrackedFromStart ? playerFuelLevel : -1,
            playerLapDistPct,
            isTrackedFromStart &&
              isLapClean(TrackLocation.OnTrack, isOnPitRoad) &&
              playerFuelLevel > 0
          ),
        });
        return;
      }

      const isLapComplete =
        activeLap.lastTrackedPct > 0.95 && playerLapDistPct < 0.05;

      if (isLapComplete) {
        activeLap.finishFuel = playerFuelLevel;
        const currentLapFuel = activeLap.startFuel - activeLap.finishFuel;

        if (
          currentLapFuel > 0 &&
          activeLap.startFuel > 0 &&
          activeLap.isCleanLap
        ) {
          precomputePCHIPTangents(activeLap);

          const newHistory = [...get().lapHistory, activeLap];

          // Update minLap
          let newMinLap = minLap;
          const minLapFuel =
            minLap.startFuel > 0
              ? minLap.startFuel - minLap.finishFuel
              : Number.MAX_VALUE;
          if (currentLapFuel < minLapFuel) {
            newMinLap = activeLap;
          }

          // Update maxLap
          let newMaxLap = maxLap;
          const maxLapFuel =
            maxLap.startFuel > 0
              ? maxLap.startFuel - maxLap.finishFuel
              : -Number.MAX_VALUE;
          if (currentLapFuel > maxLapFuel) {
            newMaxLap = activeLap;
          }

          set({
            lapHistory: newHistory,
            minLap: newMinLap,
            maxLap: newMaxLap,
          });
        }

        const isTrackedFromStart = playerLapDistPct <= interval;
        set({
          activeLap: createReferenceFuel(
            pointsCount,
            interval,
            playerFuelLevel,
            playerLapDistPct,
            isTrackedFromStart &&
              isLapClean(TrackLocation.OnTrack, isOnPitRoad) &&
              playerFuelLevel > 0
          ),
        });
        return;
      }

      if (activeLap.isCleanLap && isOnPitRoad) {
        activeLap.isCleanLap = false;
      }

      if (activeLap.pointPos[key] === -1) {
        if (activeLap.isCleanLap) {
          const prevKey = key === 0 ? undefined : key - 1;

          if (prevKey !== undefined && activeLap.pointPos[prevKey] === -1) {
            activeLap.isCleanLap = false;
          }

          if (activeLap.isCleanLap && activeLap.startFuel > 0) {
            activeLap.fuelConsumed[key] = activeLap.startFuel - playerFuelLevel;
            activeLap.pointPos[key] = playerLapDistPct;
          }
        }
        activeLap.lastTrackedPct = playerLapDistPct;
      }
    },

    getAvgConsumption: (numLaps = 0, usePersistence = false) => {
      const { lapHistory, persistedLap } = get();

      if (usePersistence || lapHistory.length === 0) {
        const hasPersisted = persistedLap && persistedLap.startFuel > 0;
        return hasPersisted
          ? persistedLap.startFuel - persistedLap.finishFuel
          : 0;
      }

      const laps = numLaps > 0 ? lapHistory.slice(-numLaps) : lapHistory;
      if (laps.length === 0) return 0;

      let totalConsumption = 0;
      for (const lap of laps) {
        totalConsumption += lap.startFuel - lap.finishFuel;
      }

      return totalConsumption / laps.length;
    },

    getFuelStats: (numLaps: number, usePersistence: boolean) => {
      const { minLap, maxLap, persistedLap, lapHistory, getAvgConsumption } =
        get();
      const hasPersisted = persistedLap && persistedLap.startFuel > 0;
      const fallbackLap = hasPersisted ? persistedLap : EMPTY_FUEL_LAP;
      const isHistoryEmpty = lapHistory.length === 0;

      return {
        minLap: usePersistence || isHistoryEmpty ? fallbackLap : minLap,
        maxLap: usePersistence || isHistoryEmpty ? fallbackLap : maxLap,
        avgConsumption: getAvgConsumption(numLaps, usePersistence),
      };
    },

    saveAverageLap: async (bridge, seriesId, playerClassId) => {
      const { lapHistory, trackId, pointsCount, interval } = get();

      const validLaps = lapHistory.filter(
        (lap) => lap.isCleanLap && lap.pointsCount === pointsCount
      );
      if (
        validLaps.length === 0 ||
        trackId === null ||
        playerClassId <= 0 ||
        seriesId === -1
      ) {
        return;
      }

      let totalConsumption = 0;
      const avgFuelConsumed = new Float32Array(pointsCount);

      for (const lap of validLaps) {
        totalConsumption += lap.startFuel - lap.finishFuel;
      }
      const avgConsumption = totalConsumption / validLaps.length;

      for (let i = 0; i < pointsCount; i++) {
        let sum = 0;
        let count = 0;
        for (const lap of validLaps) {
          const val = lap.fuelConsumed[i];
          if (val !== undefined && val !== -1) {
            sum += val;
            count++;
          }
        }
        avgFuelConsumed[i] = count > 0 ? sum / count : -1;
      }

      const avgLap: ReferenceFuel = {
        startFuel: avgConsumption,
        finishFuel: 0,
        fuelConsumed: avgFuelConsumed,
        tangents: new Float32Array(pointsCount),
        pointPos: new Float32Array(pointsCount),
        interval,
        pointsCount,
        lastTrackedPct: 1.0,
        isCleanLap: true,
      };

      for (let i = 0; i < pointsCount; i++) {
        avgLap.pointPos[i] = i * interval;
      }

      precomputePCHIPTangents(avgLap);

      try {
        await bridge.saveReferenceFuel(
          seriesId,
          trackId,
          playerClassId,
          avgLap
        );
        logger.info(
          `[RefFuelStore] Saved average fuel consumption lap for class ${playerClassId}`
        );
      } catch (err) {
        logger.error(
          `[RefFuelStore] Failed to save average fuel consumption for class ${playerClassId}:`,
          err
        );
      }
    },

    completeSession: () => {
      set({
        activeLap: EMPTY_FUEL_LAP,
        lapHistory: [],
        persistedLap: EMPTY_FUEL_LAP,
        minLap: EMPTY_FUEL_LAP,
        maxLap: EMPTY_FUEL_LAP,
        trackId: null,
        trackLength: null,
        interval: 0,
        pointsCount: 0,
        tankSize: -1,
      });
    },
  })
);
