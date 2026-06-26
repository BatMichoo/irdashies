import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFuelCalculation } from './useFuelCalculation';
import {
  useReferenceFuelStore,
  useTelemetryStore,
  useSessionStore,
  useLapTimesStore,
} from '@irdashies/context';
import type { ReferenceFuel, Session, Telemetry } from '@irdashies/types';

describe('useFuelCalculation hook', () => {
  beforeEach(() => {
    // Reset all stores to clean defaults
    useReferenceFuelStore.setState({
      activeLaps: new Map(),
      bestLaps: new Map(),
      persistedLaps: new Map(),
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

    const mockReferenceFuel: ReferenceFuel = {
      pointPos: new Float32Array(100),
      fuelConsumed: new Float32Array(100),
      tangents: new Float32Array(100),
      interval: 0.01,
      pointsCount: 100,
      startFuel: 3.0,
      finishFuel: 0.0,
      lastTrackedPct: 1.0,
      isCleanLap: true,
    };
    mockReferenceFuel.fuelConsumed[50] = 1.0;

    useReferenceFuelStore.setState({
      persistedLaps: new Map([[playerClassId, mockReferenceFuel]]),
    });

    useTelemetryStore.setState({
      telemetry: {
        FuelLevel: { value: [10] },
        Lap: { value: [1] },
        LapDistPct: { value: [0.5] },
        SessionLapsRemain: { value: [99] },
        SessionTimeRemain: { value: [600] }, // 60 sec laps, 10L remain
      } as unknown as Telemetry,
    });

    const { result } = renderHook(() => useFuelCalculation(0.0));

    expect(result.current).not.toBeNull();
    expect(result.current?.fuelToFinish).toBe(32);
    expect(result.current?.fuelToAdd).toBe(22);
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

    const mockReferenceFuel: ReferenceFuel = {
      pointPos: new Float32Array(100),
      fuelConsumed: new Float32Array(100),
      tangents: new Float32Array(100),
      interval: 0.01,
      pointsCount: 100,
      startFuel: 3.0,
      finishFuel: 0.0,
      lastTrackedPct: 1.0,
      isCleanLap: true,
    };
    mockReferenceFuel.fuelConsumed[50] = 1.0;

    useReferenceFuelStore.setState({
      persistedLaps: new Map([[playerClassId, mockReferenceFuel]]),
    });

    useTelemetryStore.setState({
      telemetry: {
        FuelLevel: { value: [10] },
        Lap: { value: [1] },
        LapDistPct: { value: [0.5] },
        SessionLapsRemain: { value: [99] },
        SessionTimeRemain: { value: [600] },
      } as unknown as Telemetry,
    });

    // Safety margin of 0.30L: 32L + 0.30L = 32.3L
    const { result } = renderHook(() => useFuelCalculation(0.3));

    expect(result.current?.fuelToFinish).toBeCloseTo(32.3, 5);
    expect(result.current?.fuelToAdd).toBeCloseTo(22.3, 5);
  });

  it('falls back to default consumption (3L) and proportional lap fuel when no reference fuel is available', () => {
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
        LapDistPct: { value: [0.5] }, // 50% on track -> remaining 50% takes 1.5L (3L * 0.5)
        SessionLapsRemain: { value: [99] },
        SessionTimeRemain: { value: [600] }, // 10 more full laps (10 * 3L = 30L)
      } as unknown as Telemetry,
    });

    const { result } = renderHook(() => useFuelCalculation(0.0));

    // Expected: 1.5L (current lap) + 30L (10 full laps) = 31.5L
    expect(result.current?.fuelToFinish).toBe(31.5);
    expect(result.current?.fuelToAdd).toBe(21.5);
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

    const mockReferenceFuel: ReferenceFuel = {
      pointPos: new Float32Array(100),
      fuelConsumed: new Float32Array(100),
      tangents: new Float32Array(100),
      interval: 0.01,
      pointsCount: 100,
      startFuel: 3.0,
      finishFuel: 0.0,
      lastTrackedPct: 1.0,
      isCleanLap: true,
    };
    mockReferenceFuel.fuelConsumed[50] = 1.0;

    useReferenceFuelStore.setState({
      persistedLaps: new Map([[playerClassId, mockReferenceFuel]]),
    });

    useTelemetryStore.setState({
      telemetry: {
        FuelLevel: { value: [10] },
        Lap: { value: [1] },
        LapDistPct: { value: [0.5] },
        SessionLapsRemain: { value: [99] },
        SessionTimeRemain: { value: [0] }, // Session over
      } as unknown as Telemetry,
    });

    const { result } = renderHook(() => useFuelCalculation(0.0));

    expect(result.current?.fuelToFinish).toBe(2);
    expect(result.current?.fuelToAdd).toBe(-8); // 2L required to end lap - 10L current = -8L surplus
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
