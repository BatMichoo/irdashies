import { ReferenceFuel } from '@irdashies/types';
import { app } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import logger from '../logger';
import { readData, writeData } from './storage';

const dataPath = app.getPath('userData');
const filePath = path.join(dataPath, 'referenceFuel.json');

const WRITE_DEBOUNCE_MS = 250;

let cache: Map<string, ReferenceFuel> | null = null;
let writeTimer: NodeJS.Timeout | null = null;
let writeInFlight: Promise<void> | null = null;

const generateKey = (
  seriesId: number,
  trackId: number,
  classId: number
): string => {
  return `${seriesId}_${trackId}_${classId}`;
};

const reviver = (key: string, value: unknown): unknown => {
  if (
    (key === 'pointPos' || key === 'fuelConsumed' || key === 'tangents') &&
    Array.isArray(value)
  ) {
    return new Float32Array(value);
  }
  return value;
};

const replacer = (key: string, value: unknown): unknown => {
  if (value instanceof Float32Array) {
    return Array.from(value);
  }
  return value;
};

const loadCache = (): Map<string, ReferenceFuel> => {
  if (cache) return cache;
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(data, reviver) as Record<string, ReferenceFuel>;
    cache = new Map(Object.entries(parsed));
  } catch {
    cache = new Map();
  }
  return cache;
};

const flushAsync = async (): Promise<void> => {
  if (!cache) return;
  try {
    const obj = Object.fromEntries(cache);
    const jsonString = JSON.stringify(obj, replacer, 2);
    const entryCount = cache.size;
    await fsp.writeFile(filePath, jsonString);
    logger.info(
      `[Main] Reference fuel written to disk (${entryCount} entries)`
    );
  } catch (error) {
    logger.error('Failed to write reference fuel data:', error);
  }
};

const flushSync = (): void => {
  if (!cache) return;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  try {
    const obj = Object.fromEntries(cache);
    const jsonString = JSON.stringify(obj, replacer, 2);
    fs.writeFileSync(filePath, jsonString);
  } catch (error) {
    logger.error('Failed to flush reference fuel data on shutdown:', error);
  }
};

const enqueueFlush = (): void => {
  const previous = writeInFlight ?? Promise.resolve();
  const tracked = previous
    .catch(() => undefined)
    .then(() => flushAsync())
    .finally(() => {
      if (writeInFlight === tracked) {
        writeInFlight = null;
      }
    });
  writeInFlight = tracked;
};

const scheduleWrite = (): void => {
  if (writeTimer) {
    clearTimeout(writeTimer);
  }
  writeTimer = setTimeout(() => {
    writeTimer = null;
    enqueueFlush();
  }, WRITE_DEBOUNCE_MS);
};

export const getReferenceFuel = (
  seriesId: number,
  trackId: number,
  classId: number
): ReferenceFuel | null => {
  const key = generateKey(seriesId, trackId, classId);
  return loadCache().get(key) ?? null;
};

export const saveReferenceFuel = (
  seriesId: number,
  trackId: number,
  classId: number,
  fuelData: ReferenceFuel
) => {
  const key = generateKey(seriesId, trackId, classId);
  loadCache().set(key, fuelData);
  scheduleWrite();
};

export const flushReferenceFuelOnShutdown = (): void => {
  flushSync();
};

export const __awaitPendingWrite = async (): Promise<void> => {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
    enqueueFlush();
  }
  while (writeInFlight) {
    await writeInFlight;
  }
};

export const __resetForTests = (): void => {
  cache = null;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  writeInFlight = null;
};

/**
 * One-time migration to clear old reference lap data.
 * This should be removed in a future version.
 */
export const validateFuelLapFile = () => {
  const VERSION = '0.0.0';
  const VERSION_KEY = 'version';
  const isCurrent = readData<string>(VERSION_KEY, filePath) === VERSION;

  if (!isCurrent) {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        logger.info('One-time cleanup of referenceLaps.json performed');
      } catch (error) {
        logger.error(
          'Failed to delete referenceLaps.json during initialization:',
          error
        );
      }
    }
    try {
      writeData(VERSION_KEY, VERSION, filePath);
    } catch (error) {
      logger.error('Failed to persist version flag:', error);
    }
  }
};
