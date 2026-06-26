/**
 * Hook for calculating fuel metrics from telemetry data
 */

import {
  useDriverCarIdx,
  useLapTimes,
  useTelemetryValue,
  useTelemetryValueRounded,
  useSessionStore,
  useReferenceFuelStore,
} from '@irdashies/context';
import type { FuelCalculation, FuelCalculatorSettings } from './types';
import { calculateLapsRemainingFromTime } from './sharpOverlayCalculations';

export function useFuelCalculation(
  safetyMargin = 0.3,
  settings?: FuelCalculatorSettings
): FuelCalculation | null {
  // Fetch player details
  const playerIdx = useDriverCarIdx() ?? -1;
  const drivers = useSessionStore(
    (state) => state.session?.DriverInfo?.Drivers || []
  );
  const playerClassId =
    playerIdx !== -1 ? (drivers[playerIdx]?.CarClassID ?? -1) : -1;

  safetyMargin = settings?.safetyMargin ?? 0.3;

  // Fetch telemetry values directly
  const fuelLevel = useTelemetryValue<number>('FuelLevel') ?? 0;
  const currentLapNumber = useTelemetryValue<number>('Lap') ?? 0;
  const lapDistPct = useTelemetryValueRounded('LapDistPct', 3) ?? 0;
  const telemetryLapsRemaining =
    useTelemetryValue<number>('SessionLapsRemain') ?? 0;
  const timeRemaining = useTelemetryValue<number>('SessionTimeRemain') ?? 0;

  // Fetch from ReferenceFuelStore
  const getReferenceFuel = useReferenceFuelStore(
    (state) => state.getReferenceFuel
  );
  const playerReferenceFuel = getReferenceFuel(playerIdx, playerClassId, false);

  const lapTimes = useLapTimes();
  const playerLapTime = lapTimes[playerIdx];

  let raceLapsRemaining = 0;

  if (telemetryLapsRemaining > 0) {
    const lapsRemainingBasedOnTime = calculateLapsRemainingFromTime(
      lapDistPct,
      timeRemaining,
      playerLapTime
    );
    if (lapsRemainingBasedOnTime < telemetryLapsRemaining) {
      raceLapsRemaining = lapsRemainingBasedOnTime;
    } else {
      raceLapsRemaining = telemetryLapsRemaining;
    }
  }

  // Calculate fuel consumption using ReferenceFuel if available
  let fuelConsumption = 3;
  let remainingFuelCurrentLap = (1 - lapDistPct) * fuelConsumption;

  if (playerReferenceFuel && playerReferenceFuel.pointsCount > 0) {
    const totalLapFuel =
      playerReferenceFuel.startFuel - playerReferenceFuel.finishFuel;
    if (totalLapFuel > 0) {
      fuelConsumption = totalLapFuel;
      const key = Math.min(
        Math.max(Math.floor(lapDistPct * playerReferenceFuel.pointsCount), 0),
        playerReferenceFuel.pointsCount - 1
      );
      const fuelConsumedThisLap = playerReferenceFuel.fuelConsumed[key] ?? 0;
      remainingFuelCurrentLap = Math.max(totalLapFuel - fuelConsumedThisLap, 0);
    }
  }

  // The number of full laps remaining is raceLapsRemaining - 1 (capped at 0)
  const fullLapsRemaining = Math.max(Math.ceil(raceLapsRemaining) - 1, 0);

  let fuelRequired = 0;
  if (raceLapsRemaining > -1) {
    fuelRequired =
      remainingFuelCurrentLap +
      fullLapsRemaining * fuelConsumption +
      safetyMargin;
  }
  const refuelRequired = fuelRequired - fuelLevel;

  // Return a default skeleton calculation that avoids all missing context/history data
  return {
    fuelLevel: fuelLevel ?? 0,
    lastLapUsage: 0,
    currentLapUsage: 0,
    projectedLapUsage: 0,
    avgLaps: 0,
    avg10Laps: 0,
    avgAllGreenLaps: 0,
    maxQualify: null,
    minLapUsage: 0,
    maxLapUsage: 0,
    lapsWithFuel: 0,
    lapsRemaining: 0,
    totalLaps: 0,
    currentLap: currentLapNumber ?? 0,
    fuelToFinish: fuelRequired,
    fuelToAdd: refuelRequired,
    pitWindowOpen: 0,
    pitWindowClose: 0,
    canFinish: false,
    targetConsumption: 0,
    confidence: 'low',
    fuelAtFinish: 0,
    avgLapTime: 0,
  };
}
