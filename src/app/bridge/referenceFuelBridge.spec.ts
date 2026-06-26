import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockLoggerInfo = vi.hoisted(() => vi.fn());
const mockLoggerDebug = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());

vi.mock('../logger', () => ({
  default: {
    info: mockLoggerInfo,
    warn: vi.fn(),
    error: mockLoggerError,
    debug: mockLoggerDebug,
  },
}));

const mockGetReferenceFuel = vi.hoisted(() => vi.fn());
const mockSaveReferenceFuel = vi.hoisted(() => vi.fn());

vi.mock('../storage/referenceFuel', () => ({
  getReferenceFuel: mockGetReferenceFuel,
  saveReferenceFuel: mockSaveReferenceFuel,
}));

type IpcHandler = (
  event: unknown,
  ...args: unknown[]
) => unknown | Promise<unknown>;

const handlers = new Map<string, IpcHandler>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    },
  },
}));

import {
  setupReferenceFuelBridge,
  __resetReferenceFuelBridgeForTests,
} from './referenceFuelBridge';

const invokeGet = (seriesId: number, trackId: number, classId: number) => {
  const handler = handlers.get('referenceFuel:get');
  if (!handler) throw new Error('referenceFuel:get handler not registered');
  return handler({}, seriesId, trackId, classId);
};

describe('referenceFuelBridge', () => {
  beforeEach(() => {
    handlers.clear();
    __resetReferenceFuelBridgeForTests();
    mockLoggerInfo.mockReset();
    mockLoggerDebug.mockReset();
    mockLoggerError.mockReset();
    mockGetReferenceFuel.mockReset();
    mockSaveReferenceFuel.mockReset();
    mockGetReferenceFuel.mockReturnValue(null);
    setupReferenceFuelBridge();
  });

  describe('referenceFuel:get fetch dedup', () => {
    it('logs an INFO line on the first fetch', () => {
      invokeGet(539, 127, 2523);
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        '[Main] Fetching reference fuel for Series: 539, Track: 127, Class: 2523'
      );
    });

    it('dedups subsequent fetches within the TTL window', () => {
      invokeGet(539, 127, 2523);
      invokeGet(539, 127, 2523);

      const infoCalls = mockLoggerInfo.mock.calls.filter((call) =>
        (call[0] as string).startsWith('[Main] Fetching reference fuel')
      );
      expect(infoCalls).toHaveLength(1);

      const debugCalls = mockLoggerDebug.mock.calls.filter((call) =>
        (call[0] as string).startsWith("[Main] Reference fuel fetch dedup'd")
      );
      expect(debugCalls).toHaveLength(1);
    });
  });

  describe('referenceFuel:save', () => {
    it('logs and delegates to saveReferenceFuel', () => {
      const handler = handlers.get('referenceFuel:save');
      if (!handler)
        throw new Error('referenceFuel:save handler not registered');
      const fuel = { finishFuel: 4 } as never;

      handler({}, 539, 127, 2523, fuel);

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        '[Main] Saving reference fuel for Series: 539, Track: 127, Class: 2523'
      );
      expect(mockSaveReferenceFuel).toHaveBeenCalledWith(539, 127, 2523, fuel);
    });
  });
});
