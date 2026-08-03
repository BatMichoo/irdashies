import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFuelCalculation } from './useFuelCalculation';
import {
  useReferenceFuelStore,
  useTelemetryStore,
  useSessionStore,
  useLapTimesStore,
  useReferenceLapStore,
} from '@irdashies/context';
import type {
  ReferenceFuel,
  Session,
  Telemetry,
  ReferenceLap,
} from '@irdashies/types';

function createMockReferenceFuel(
  overrides?: Partial<ReferenceFuel>
): ReferenceFuel {
  const pointsCount = 100;
  const pointPos = new Float32Array(pointsCount);
  for (let i = 0; i < pointsCount; i++) {
    pointPos[i] = i * 0.01;
  }
  return {
    pointPos,
    fuelConsumed: new Float32Array(pointsCount),
    tangents: new Float32Array(pointsCount),
    interval: 0.01,
    pointsCount,
    startFuel: 3.0,
    finishFuel: 0.0,
    lastTrackedPct: 1.0,
    isCleanLap: true,
    ...overrides,
  };
}

describe('useFuelCalculation hook', () => {
  beforeEach(() => {
    // Reset all stores to clean defaults
    useReferenceFuelStore.setState({
      activeLap: { startFuel: -1 } as ReferenceFuel,
      lapHistory: [],
      persistedLap: { startFuel: -1 } as ReferenceFuel,
      minLap: { startFuel: -1 } as ReferenceFuel,
      maxLap: { startFuel: -1 } as ReferenceFuel,
      trackId: null,
      trackLength: null,
      interval: 0,
      pointsCount: 0,
    });

    useTelemetryStore.setState({
      telemetry: null,
    });

    useSessionStore.setState({
      session: null,
    });

    useLapTimesStore.setState({
      lapTimes: [],
    });

    useReferenceLapStore.setState({
      activeLaps: new Map(),
      bestLaps: new Map(),
      persistedLaps: new Map(),
      trackId: null,
      trackLength: null,
      interval: 0,
      pointsCount: 0,
    });
  });

  it('calculates 32L of fuel starting from 50% track with 10 more laps remaining', () => {
    const playerCarIdx = 0;
    const playerClassId = 1;

    useSessionStore.setState({
      session: {
        DriverInfo: {
          DriverCarIdx: playerCarIdx,
          Drivers: [{ CarIdx: playerCarIdx, CarClassID: playerClassId }],
        },
      } as unknown as Session,
    });

    useLapTimesStore.setState({
      lapTimes: [60],
    });

    const mockReferenceFuel = createMockReferenceFuel();
    mockReferenceFuel.fuelConsumed[50] = 1.0;

    useReferenceFuelStore.setState({
      persistedLap: mockReferenceFuel,
    });

    useTelemetryStore.setState({
      telemetry: {
        FuelLevel: { value: [10] },
        Lap: { value: [1] },
        LapDistPct: { value: [0.5] },
        SessionLapsRemain: { value: [32767] },
        SessionTimeRemain: { value: [600] }, // 60 sec laps, 10L remain
      } as unknown as Telemetry,
    });

    const { result } = renderHook(() => useFuelCalculation(0.0));

    expect(result.current).not.toBeNull();
    expect(result.current?.fuelToFinish).toBe(30.5);
    expect(result.current?.fuelToAdd).toBe(20.5);
  });

  it('applies the safety margin correctly to the calculations', () => {
    const playerCarIdx = 0;
    const playerClassId = 1;

    useSessionStore.setState({
      session: {
        DriverInfo: {
          DriverCarIdx: playerCarIdx,
          Drivers: [{ CarIdx: playerCarIdx, CarClassID: playerClassId }],
        },
      } as unknown as Session,
    });

    useLapTimesStore.setState({
      lapTimes: [60],
    });

    const mockReferenceFuel = createMockReferenceFuel();
    mockReferenceFuel.fuelConsumed[50] = 1.0;

    useReferenceFuelStore.setState({
      persistedLap: mockReferenceFuel,
    });

    useTelemetryStore.setState({
      telemetry: {
        FuelLevel: { value: [10] },
        Lap: { value: [1] },
        LapDistPct: { value: [0.5] },
        SessionLapsRemain: { value: [32767] },
        SessionTimeRemain: { value: [600] },
      } as unknown as Telemetry,
    });

    // Safety margin of 0.30L: 32L + 0.30L = 32.3L
    const { result } = renderHook(() => useFuelCalculation(0.3));

    expect(result.current?.fuelToFinish).toBeCloseTo(30.5, 5);
    expect(result.current?.fuelToAdd).toBeCloseTo(20.8, 5);
  });

  it('calculates -10 fuel required when no reference fuel is available', () => {
    const playerCarIdx = 0;
    const playerClassId = 1;

    useSessionStore.setState({
      session: {
        DriverInfo: {
          DriverCarIdx: playerCarIdx,
          Drivers: [{ CarIdx: playerCarIdx, CarClassID: playerClassId }],
        },
      } as unknown as Session,
    });

    useLapTimesStore.setState({
      lapTimes: [60],
    });

    // Note: persistedLaps is empty (no ReferenceFuel loaded)

    useTelemetryStore.setState({
      telemetry: {
        FuelLevel: { value: [10] },
        Lap: { value: [1] },
        LapDistPct: { value: [0.5] },
        SessionLapsRemain: { value: [32767] },
        SessionTimeRemain: { value: [600] },
      } as unknown as Telemetry,
    });

    const { result } = renderHook(() => useFuelCalculation(0.0));

    // Expected: 0L required since there's no consumption data
    expect(result.current?.fuelToFinish).toBe(0);
    expect(result.current?.fuelToAdd).toBe(-10);
  });

  it('returns remaining current lap fuel when there is no time remaining', () => {
    const playerCarIdx = 0;
    const playerClassId = 1;

    useSessionStore.setState({
      session: {
        DriverInfo: {
          DriverCarIdx: playerCarIdx,
          Drivers: [{ CarIdx: playerCarIdx, CarClassID: playerClassId }],
        },
      } as unknown as Session,
    });

    const mockReferenceFuel = createMockReferenceFuel();
    mockReferenceFuel.fuelConsumed[50] = 1.0;

    useReferenceFuelStore.setState({
      persistedLap: mockReferenceFuel,
    });

    useTelemetryStore.setState({
      telemetry: {
        FuelLevel: { value: [10] },
        Lap: { value: [1] },
        LapDistPct: { value: [0.5] },
        SessionLapsRemain: { value: [32767] },
        SessionTimeRemain: { value: [0] }, // Session over
      } as unknown as Telemetry,
    });

    const { result } = renderHook(() => useFuelCalculation(0.0));

    expect(result.current?.fuelToFinish).toBe(0.5);
    expect(result.current?.fuelToAdd).toBe(-9.5); // 0.5L required to finish - 10L current = -9.5L surplus
  });

  it('falls back to reference lap time when lapTimes array is empty', () => {
    const playerCarIdx = 0;
    const playerClassId = 1;

    useSessionStore.setState({
      session: {
        DriverInfo: {
          DriverCarIdx: playerCarIdx,
          Drivers: [{ CarIdx: playerCarIdx, CarClassID: playerClassId }],
        },
      } as unknown as Session,
    });

    useLapTimesStore.setState({
      lapTimes: [], // Empty
    });

    // Mock ReferenceLap with 60s duration (startTime = 10, finishTime = 70)
    useReferenceLapStore.setState({
      bestLaps: new Map([
        [
          playerCarIdx,
          { startTime: 10, finishTime: 70 } as unknown as ReferenceLap,
        ],
      ]),
    });

    const mockReferenceFuel = createMockReferenceFuel();
    mockReferenceFuel.fuelConsumed[50] = 1.0;

    useReferenceFuelStore.setState({
      persistedLap: mockReferenceFuel,
    });

    useTelemetryStore.setState({
      telemetry: {
        FuelLevel: { value: [10] },
        Lap: { value: [1] },
        LapDistPct: { value: [0.5] },
        SessionLapsRemain: { value: [32767] },
        SessionTimeRemain: { value: [600] }, // 10 more laps if lap time is 60s
      } as unknown as Telemetry,
    });

    const { result } = renderHook(() => useFuelCalculation(0.0));

    expect(result.current?.fuelToFinish).toBe(30.5);
  });

  it('falls back to SessionInfo class estimated lap time when both lapTimes and reference lap time are not available', () => {
    const playerCarIdx = 0;
    const playerClassId = 1;

    useSessionStore.setState({
      session: {
        DriverInfo: {
          DriverCarIdx: playerCarIdx,
          Drivers: [
            {
              CarIdx: playerCarIdx,
              CarClassID: playerClassId,
              CarClassEstLapTime: 60,
            },
          ],
        },
      } as unknown as Session,
    });

    useLapTimesStore.setState({
      lapTimes: [], // Empty
    });

    // bestLaps is empty in ReferenceLapStore
    useReferenceLapStore.setState({
      bestLaps: new Map(),
    });

    const mockReferenceFuel = createMockReferenceFuel();
    mockReferenceFuel.fuelConsumed[50] = 1.0;

    useReferenceFuelStore.setState({
      persistedLap: mockReferenceFuel,
    });

    useTelemetryStore.setState({
      telemetry: {
        FuelLevel: { value: [10] },
        Lap: { value: [1] },
        LapDistPct: { value: [0.5] },
        SessionLapsRemain: { value: [32767] },
        SessionTimeRemain: { value: [600] }, // 10 more laps if class est time is 60s
      } as unknown as Telemetry,
    });

    const { result } = renderHook(() => useFuelCalculation(0.0));

    expect(result.current?.fuelToFinish).toBe(30.5);
  });

  it('should return the fuel consumption of the last completed lap in lapHistory as lastLapUsage', () => {
    const lastLap: ReferenceFuel = {
      startFuel: 4.2,
      finishFuel: 1.2, // 3.0L consumed
      fuelConsumed: new Float32Array([0, 3.0]),
      pointPos: new Float32Array([0, 1]),
      tangents: new Float32Array([0, 0]),
      interval: 0.5,
      pointsCount: 2,
      lastTrackedPct: 1.0,
      isCleanLap: true,
    };

    useReferenceFuelStore.setState({
      lapHistory: [lastLap],
    });

    const { result } = renderHook(() => useFuelCalculation(0.0));

    expect(result.current?.lastLapUsage).toBe(3.0);
  });

  it('calculates projectedLapUsage by cross referencing active lap with last lap reference data', () => {
    const playerCarIdx = 0;
    const playerClassId = 1;

    useSessionStore.setState({
      session: {
        DriverInfo: {
          DriverCarIdx: playerCarIdx,
          Drivers: [{ CarIdx: playerCarIdx, CarClassID: playerClassId }],
        },
      } as unknown as Session,
    });

    const lastLap: ReferenceFuel = {
      startFuel: 5.0,
      finishFuel: 2.0,
      fuelConsumed: new Float32Array([0, 0.75, 1.5, 3.0]),
      pointPos: new Float32Array([0, 0.25, 0.5, 0.75]),
      tangents: new Float32Array([0, 0, 0, 0]),
      interval: 0.25,
      pointsCount: 4,
      lastTrackedPct: 1.0,
      isCleanLap: true,
    };

    const activeLap: ReferenceFuel = {
      startFuel: 10.0,
      finishFuel: -1,
      fuelConsumed: new Float32Array([0, 0.5, 1.0, -1]),
      pointPos: new Float32Array([0, 0.25, 0.5, 0.75]),
      tangents: new Float32Array([0, 0, 0, 0]),
      interval: 0.25,
      pointsCount: 4,
      lastTrackedPct: 0.5,
      isCleanLap: true,
    };

    useReferenceFuelStore.setState({
      lapHistory: [lastLap],
      activeLap: activeLap,
    });

    useTelemetryStore.setState({
      telemetry: {
        FuelLevel: { value: [9.0] },
        Lap: { value: [2] },
        LapDistPct: { value: [0.5] },
        SessionLapsRemain: { value: [32767] },
        SessionTimeRemain: { value: [600] },
      } as unknown as Telemetry,
    });

    const { result } = renderHook(() => useFuelCalculation(0.0));

    expect(result.current?.projectedLapUsage).toBe(2.5);
  });

  it('should use maxLap for the prediction of current consumption when activeLap is not clean', () => {
    const maxLap: ReferenceFuel = {
      startFuel: 12.0,
      finishFuel: 8.0,
      fuelConsumed: new Float32Array([0, 1.0, 2.0, 3.0]),
      pointPos: new Float32Array([0, 0.25, 0.5, 0.75]),
      tangents: new Float32Array([0, 0, 0, 0]),
      interval: 0.25,
      pointsCount: 4,
      lastTrackedPct: 1.0,
      isCleanLap: true,
    };

    const dirtyActiveLap: ReferenceFuel = {
      startFuel: 10.0,
      finishFuel: -1,
      fuelConsumed: new Float32Array([0, 0.1, -1, -1]),
      pointPos: new Float32Array([0, 0.25, -1, -1]),
      tangents: new Float32Array([0, 0, 0, 0]),
      interval: 0.25,
      pointsCount: 4,
      lastTrackedPct: 0.5,
      isCleanLap: false,
    };

    useReferenceFuelStore.setState({
      maxLap: maxLap,
      activeLap: dirtyActiveLap,
      lapHistory: [maxLap],
    });

    useTelemetryStore.setState({
      telemetry: {
        FuelLevel: { value: [9.0] },
        Lap: { value: [2] },
        LapDistPct: { value: [0.5] },
        SessionLapsRemain: { value: [32767] },
        SessionTimeRemain: { value: [600] },
      } as unknown as Telemetry,
    });

    const { result } = renderHook(() => useFuelCalculation(0.0));

    // When activeLap is not clean (isCleanLap: false), projection falls back to maxLap reference consumption.
    expect(result.current?.projectedLapUsage).toBe(4.0);
  });

  // Future feature specifications (Not yet implemented)
  it.todo(
    'should calculate laps remaining using multiclass rules when isMultiClass is true'
  );
  it.todo(
    'should apply fuel-saving economy prediction based on manual target consumption settings'
  );
  it.todo(
    'should filter out slow down-laps and tow incidents when compiling historic consumption averages'
  );
});
