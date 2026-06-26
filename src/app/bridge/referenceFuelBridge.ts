import { ipcMain } from 'electron';
import { getReferenceFuel, saveReferenceFuel } from '../storage/referenceFuel';
import type { ReferenceFuel } from '@irdashies/types';
import logger from '../logger';

const FETCH_DEDUP_TTL_MS = 5000;

const recentFetches = new Map<string, number>();

const fetchKey = (seriesId: number, trackId: number, classId: number): string =>
  `${seriesId}_${trackId}_${classId}`;

const pruneExpiredFetches = (now: number): void => {
  for (const [key, timestamp] of recentFetches) {
    if (now - timestamp >= FETCH_DEDUP_TTL_MS) {
      recentFetches.delete(key);
    }
  }
};

export const setupReferenceFuelBridge = () => {
  ipcMain.handle(
    'referenceFuel:get',
    (_, seriesId: number, trackId: number, classId: number) => {
      const now = Date.now();
      pruneExpiredFetches(now);
      const key = fetchKey(seriesId, trackId, classId);
      const recent = recentFetches.get(key);

      if (recent === undefined) {
        recentFetches.set(key, now);
        logger.info(
          `[Main] Fetching reference fuel for Series: ${seriesId}, Track: ${trackId}, Class: ${classId}`
        );
      } else {
        logger.debug(
          `[Main] Reference fuel fetch dedup'd (${now - recent}ms after first invoke) for Series: ${seriesId}, Track: ${trackId}, Class: ${classId}`
        );
      }

      const fuel = getReferenceFuel(seriesId, trackId, classId);

      if (!fuel) {
        logger.info(
          `[Main] No persisted reference fuel for Series: ${seriesId}, Track: ${trackId}, Class: ${classId}`
        );
      }

      return fuel;
    }
  );

  ipcMain.handle(
    'referenceFuel:save',
    (
      _,
      seriesId: number,
      trackId: number,
      classId: number,
      fuelData: ReferenceFuel
    ) => {
      logger.info(
        `[Main] Saving reference fuel for Series: ${seriesId}, Track: ${trackId}, Class: ${classId}`
      );
      try {
        saveReferenceFuel(seriesId, trackId, classId, fuelData);
        return true;
      } catch (e) {
        logger.error('[Main] Failed to save reference fuel:', e);
        throw e;
      }
    }
  );
};

export const __resetReferenceFuelBridgeForTests = (): void => {
  recentFetches.clear();
};
