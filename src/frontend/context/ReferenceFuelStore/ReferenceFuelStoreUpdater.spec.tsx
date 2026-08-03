import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useReferenceFuelStoreUpdater } from './ReferenceFuelStoreUpdater';
import { useSessionStore } from '../SessionStore/SessionStore';
import { useTelemetryStore } from '../TelemetryStore/TelemetryStore';
import { useReferenceFuelStore } from './ReferenceFuelStore';
import { ReferenceFuelBridge, Session, Telemetry } from '@irdashies/types';

describe('useReferenceFuelStoreUpdater', () => {
  const mockBridge = {
    getReferenceFuel: vi.fn(),
    saveReferenceFuel: vi.fn().mockResolvedValue(undefined),
  } as unknown as ReferenceFuelBridge;

  beforeEach(() => {
    vi.clearAllMocks();
    useReferenceFuelStore.getState().completeSession();
  });

  it('should call initialize when valid session is set up', () => {
    const initializeSpy = vi.spyOn(
      useReferenceFuelStore.getState(),
      'initialize'
    );

    renderHook(() => useReferenceFuelStoreUpdater(mockBridge));

    useSessionStore.setState({
      session: {
        WeekendInfo: {
          SeriesID: 1,
          TrackID: 2,
          SubSessionID: 3,
          TrackLength: '5 km',
        },
        DriverInfo: {
          DriverCarIdx: 0,
          PaceCarIdx: -1,
          Drivers: [{ CarIdx: 0, CarClassID: 10 }],
          DriverCarFuelMaxLtr: 10,
          DriverCarMaxFuelPct: 1,
        },
      } as unknown as Session,
    });

    expect(initializeSpy).toHaveBeenCalledWith(
      mockBridge,
      1,
      2,
      5000,
      [10],
      10,
      10
    );
  });

  it('should call collectBulkData on telemetry update', () => {
    const collectBulkDataSpy = vi.spyOn(
      useReferenceFuelStore.getState(),
      'collectBulkData'
    );

    renderHook(() => useReferenceFuelStoreUpdater(mockBridge));

    // First initialize session metadata so ref matches
    useSessionStore.setState({
      session: {
        WeekendInfo: {
          SeriesID: 1,
          TrackID: 2,
          SubSessionID: 3,
          TrackLength: '5 km',
        },
        DriverInfo: {
          DriverCarIdx: 0,
          PaceCarIdx: -1,
          Drivers: [{ CarIdx: 0, CarClassID: 10 }],
        },
      } as unknown as Session,
    });

    // Send telemetry update
    useTelemetryStore.setState({
      telemetry: {
        SessionNum: { value: [0] },
        CarIdxLapDistPct: { value: [0.1] },
        CarIdxOnPitRoad: { value: [false] },
        FuelLevel: { value: [10.5] },
      } as unknown as Telemetry,
    });

    expect(collectBulkDataSpy).toHaveBeenCalledWith(
      mockBridge,
      1,
      0,
      10,
      0.1,
      false,
      10.5
    );
  });

  it('should save average lap when session becomes null', () => {
    const saveAverageLapSpy = vi.spyOn(
      useReferenceFuelStore.getState(),
      'saveAverageLap'
    );

    renderHook(() => useReferenceFuelStoreUpdater(mockBridge));

    // 1. Enter valid session
    useSessionStore.setState({
      session: {
        WeekendInfo: {
          SeriesID: 1,
          TrackID: 2,
          SubSessionID: 3,
          TrackLength: '5 km',
        },
        DriverInfo: {
          DriverCarIdx: 0,
          PaceCarIdx: -1,
          Drivers: [{ CarIdx: 0, CarClassID: 10 }],
        },
      } as unknown as Session,
    });

    // 2. Clear session to null
    useSessionStore.setState({
      session: null,
    });

    expect(saveAverageLapSpy).toHaveBeenCalledWith(mockBridge, 1, 10);
  });

  it('should save average lap when sessionNum changes', () => {
    const saveAverageLapSpy = vi.spyOn(
      useReferenceFuelStore.getState(),
      'saveAverageLap'
    );

    renderHook(() => useReferenceFuelStoreUpdater(mockBridge));

    // 1. Setup session
    useSessionStore.setState({
      session: {
        WeekendInfo: {
          SeriesID: 1,
          TrackID: 2,
          SubSessionID: 3,
          TrackLength: '5 km',
        },
        DriverInfo: {
          DriverCarIdx: 0,
          PaceCarIdx: -1,
          Drivers: [{ CarIdx: 0, CarClassID: 10 }],
        },
      } as unknown as Session,
    });

    // 2. Initial telemetry setting
    useTelemetryStore.setState({
      telemetry: {
        SessionNum: { value: [0] },
      } as unknown as Telemetry,
    });

    // 3. sessionNum change
    useTelemetryStore.setState({
      telemetry: {
        SessionNum: { value: [1] },
      } as unknown as Telemetry,
    });

    expect(saveAverageLapSpy).toHaveBeenCalledWith(mockBridge, 1, 10);
  });

  it('should save average lap on unmount', () => {
    const saveAverageLapSpy = vi.spyOn(
      useReferenceFuelStore.getState(),
      'saveAverageLap'
    );

    const { unmount } = renderHook(() =>
      useReferenceFuelStoreUpdater(mockBridge)
    );

    useSessionStore.setState({
      session: {
        WeekendInfo: {
          SeriesID: 1,
          TrackID: 2,
          SubSessionID: 3,
          TrackLength: '5 km',
        },
        DriverInfo: {
          DriverCarIdx: 0,
          PaceCarIdx: -1,
          Drivers: [{ CarIdx: 0, CarClassID: 10 }],
        },
      } as unknown as Session,
    });

    unmount();

    expect(saveAverageLapSpy).toHaveBeenCalledWith(mockBridge, 1, 10);
  });
});
