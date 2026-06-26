import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockReadData = vi.hoisted(() => vi.fn());
const mockWriteData = vi.hoisted(() => vi.fn());

const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());

vi.mock('../logger', () => ({
  default: {
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: mockLoggerError,
    debug: vi.fn(),
  },
}));

vi.mock('./storage', () => ({
  readData: mockReadData,
  writeData: mockWriteData,
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/user/data'),
  },
}));

const mockReadFileSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn(() => true));
const mockUnlinkSync = vi.hoisted(() => vi.fn());

vi.mock('node:fs', () => ({
  default: {
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    existsSync: mockExistsSync,
    unlinkSync: mockUnlinkSync,
  },
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
  existsSync: mockExistsSync,
  unlinkSync: mockUnlinkSync,
}));

const mockWriteFile = vi.hoisted(() => vi.fn());

vi.mock('node:fs/promises', () => ({
  default: { writeFile: mockWriteFile },
  writeFile: mockWriteFile,
}));

import {
  getReferenceFuel,
  saveReferenceFuel,
  flushReferenceFuelOnShutdown,
  __awaitPendingWrite,
  __resetForTests,
} from './referenceFuel';
import type { ReferenceFuel } from '@irdashies/types';

const makeFuel = (finishFuel: number): ReferenceFuel => ({
  pointPos: new Float32Array([0.0, 0.5]),
  fuelConsumed: new Float32Array([0.1, 0.2]),
  tangents: new Float32Array([1.0, 1.0]),
  interval: 0.0025,
  pointsCount: 2,
  startFuel: 10.0,
  finishFuel,
  lastTrackedPct: 1.0,
  isCleanLap: true,
});

describe('referenceFuel storage', () => {
  beforeEach(() => {
    __resetForTests();
    mockReadFileSync.mockReset();
    mockWriteFileSync.mockReset();
    mockWriteFile.mockReset();
    mockWriteFile.mockResolvedValue(undefined);
    mockLoggerInfo.mockReset();
    mockLoggerError.mockReset();
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
  });

  describe('getReferenceFuel', () => {
    it('returns null when no data is on disk', () => {
      expect(getReferenceFuel(1, 2, 3)).toBeNull();
    });

    it('reads from disk only on first call', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          '1_2_3': {
            ...makeFuel(5),
            fuelConsumed: Array.from(makeFuel(5).fuelConsumed),
            pointPos: Array.from(makeFuel(5).pointPos),
            tangents: Array.from(makeFuel(5).tangents),
          },
        })
      );

      const a = getReferenceFuel(1, 2, 3);
      const b = getReferenceFuel(1, 2, 3);
      const c = getReferenceFuel(99, 99, 99);

      expect(a?.finishFuel).toBe(5);
      expect(b?.finishFuel).toBe(5);
      expect(c).toBeNull();
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    });

    it('revives Float32Arrays for stored fields', () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          '1_2_3': {
            ...makeFuel(5),
            fuelConsumed: [0.1, 0.2],
            pointPos: [0.0, 0.5],
            tangents: [1.0, 1.0],
          },
        })
      );

      const fuel = getReferenceFuel(1, 2, 3);
      expect(fuel?.fuelConsumed).toBeInstanceOf(Float32Array);
      expect(fuel?.pointPos).toBeInstanceOf(Float32Array);
      expect(fuel?.tangents).toBeInstanceOf(Float32Array);
    });
  });

  describe('saveReferenceFuel', () => {
    it('updates cache and debounces multiple saves', async () => {
      saveReferenceFuel(1, 2, 3, makeFuel(5));
      saveReferenceFuel(1, 2, 3, makeFuel(4));

      expect(mockWriteFile).not.toHaveBeenCalled();

      await __awaitPendingWrite();

      expect(mockWriteFile).toHaveBeenCalledTimes(1);
      const written = JSON.parse(mockWriteFile.mock.calls[0][1] as string);
      expect(written['1_2_3'].finishFuel).toBe(4);
    });
  });

  describe('flushReferenceFuelOnShutdown', () => {
    it('writes pending data synchronously', () => {
      saveReferenceFuel(1, 2, 3, makeFuel(5));
      flushReferenceFuelOnShutdown();

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(written['1_2_3'].finishFuel).toBe(5);
    });
  });
});
