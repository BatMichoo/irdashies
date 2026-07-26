import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReferenceFuelStore } from './ReferenceFuelStore';
import { ReferenceFuel, ReferenceFuelBridge } from '@irdashies/types';

describe('ReferenceFuelStore getFuelStats', () => {
  const createMockFuelLap = (
    startFuel: number,
    finishFuel: number
  ): ReferenceFuel => ({
    startFuel,
    finishFuel,
    fuelConsumed: new Float32Array([0, startFuel - finishFuel]),
    pointPos: new Float32Array([0, 1]),
    tangents: new Float32Array([0, 0]),
    interval: 0.5,
    pointsCount: 2,
    lastTrackedPct: 1,
    isCleanLap: true,
  });

  beforeEach(() => {
    useReferenceFuelStore.getState().completeSession();
    vi.clearAllMocks();
  });

  it('should return fallback EMPTY_FUEL_LAP when there is no history or persisted lap', () => {
    const stats = useReferenceFuelStore.getState().getFuelStats(5, false);

    expect(stats.minLap.startFuel).toBe(-1);
    expect(stats.maxLap.startFuel).toBe(-1);
    expect(stats.avgConsumption).toBe(0);
  });

  it('should return persisted lap stats when usePersistence is true', () => {
    const persisted = createMockFuelLap(5.0, 2.0); // 3.0 consumed
    useReferenceFuelStore.setState({ persistedLap: persisted });

    const stats = useReferenceFuelStore.getState().getFuelStats(5, true);

    expect(stats.minLap).toEqual(persisted);
    expect(stats.maxLap).toEqual(persisted);
    expect(stats.avgConsumption).toBe(3.0);
  });

  it('should return persisted lap stats when history is empty', () => {
    const persisted = createMockFuelLap(4.0, 1.5); // 2.5 consumed
    useReferenceFuelStore.setState({ persistedLap: persisted });

    const stats = useReferenceFuelStore.getState().getFuelStats(5, false);

    expect(stats.minLap).toEqual(persisted);
    expect(stats.maxLap).toEqual(persisted);
    expect(stats.avgConsumption).toBe(2.5);
  });

  it('should correctly select min, max, and avg consumption for inputted laps', () => {
    const lap1 = createMockFuelLap(5.0, 3.0); // 2.0 consumed
    const lap2 = createMockFuelLap(5.0, 1.0); // 4.0 consumed
    const lap3 = createMockFuelLap(5.0, 4.0); // 1.0 consumed
    const lap4 = createMockFuelLap(5.0, 2.0); // 3.0 consumed

    useReferenceFuelStore.setState({
      lapHistory: [lap1, lap2, lap3, lap4],
      minLap: lap3,
      maxLap: lap2,
    });

    // Check stats for last 3 laps (lap2, lap3, lap4)
    // Consumptions: 4.0, 1.0, 3.0
    // min: lap3 (1.0)
    // max: lap2 (4.0)
    // avg: (4.0 + 1.0 + 3.0) / 3 = 8/3 = 2.6666...
    const stats3 = useReferenceFuelStore.getState().getFuelStats(3, false);

    expect(stats3.minLap).toEqual(lap3);
    expect(stats3.maxLap).toEqual(lap2);
    expect(stats3.avgConsumption).toBeCloseTo(2.66666666, 5);

    // Check stats for all laps (input numLaps = 0 or > length)
    // Consumptions: 2.0, 4.0, 1.0, 3.0
    // min: lap3 (1.0)
    // max: lap2 (4.0)
    // avg: (2.0 + 4.0 + 1.0 + 3.0) / 4 = 10/4 = 2.5
    const statsAll = useReferenceFuelStore.getState().getFuelStats(0, false);

    expect(statsAll.minLap).toEqual(lap3);
    expect(statsAll.maxLap).toEqual(lap2);
    expect(statsAll.avgConsumption).toBe(2.5);
  });

  it('should correctly calculate and save the average lap from history', async () => {
    const bridge = {
      saveReferenceFuel: vi.fn().mockResolvedValue(undefined),
      getReferenceFuel: vi.fn(),
    };

    const lap1 = createMockFuelLap(5.0, 3.0); // 2.0 consumed
    const lap2 = createMockFuelLap(5.0, 1.0); // 4.0 consumed

    useReferenceFuelStore.setState({
      lapHistory: [lap1, lap2],
      trackId: 12,
      pointsCount: 2,
      interval: 0.5,
    });

    await useReferenceFuelStore
      .getState()
      .saveAverageLap(bridge as unknown as ReferenceFuelBridge, 101, 1);

    expect(bridge.saveReferenceFuel).toHaveBeenCalledTimes(1);
    const savedLap = bridge.saveReferenceFuel.mock.calls[0][3] as ReferenceFuel;

    // Average start fuel: avgConsumption = (2.0 + 4.0) / 2 = 3.0
    expect(savedLap.startFuel).toBe(3.0);
    // Average finish fuel: 0
    expect(savedLap.finishFuel).toBe(0.0);
    // Average fuel consumed at index 1: ((5.0-3.0) + (5.0-1.0)) / 2 = (2.0 + 4.0) / 2 = 3.0
    expect(savedLap.fuelConsumed[1]).toBe(3.0);
    expect(savedLap.isCleanLap).toBe(true);
  });
});
