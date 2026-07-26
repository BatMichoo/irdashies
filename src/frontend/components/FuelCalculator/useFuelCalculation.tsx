/**
 * Hook for calculating fuel metrics from telemetry data
 */

import {
  useDriverCarIdx,
  useLapTimes,
  useTelemetryValue,
  useTelemetryValueRounded,
  useReferenceFuelStore,
  useReferenceLapStore,
  useCarIdxClassEstLapTime,
  useSessionDrivers,
} from '@irdashies/context';
import type { FuelCalculation, FuelCalculatorSettings } from './types';
import { calculateLapsRemainingFromTime } from './sharpOverlayCalculations';
import {
  calculateConfidence,
  calculateFuelRequiredToFinish,
  calculateProjectedLapUsage,
  calculateRefuelRequired,
} from './fuelCalculations';

export function useFuelCalculation(
  safetyMargin = 0.3,
  settings?: FuelCalculatorSettings
): FuelCalculation | null {
  // Fetch player details
  const playerIdx = useDriverCarIdx() ?? -1;

  safetyMargin = settings?.safetyMargin ?? safetyMargin;

  // Fetch telemetry values directly
  const fuelLevel = useTelemetryValue<number>('FuelLevel') ?? 0;
  const currentLapNumber = useTelemetryValue<number>('Lap') ?? 0;
  const lapDistPct = useTelemetryValueRounded('LapDistPct', 4) ?? 0;
  const telemetryLapsRemaining =
    useTelemetryValue<number>('SessionLapsRemain') ?? 0;
  const timeRemaining = useTelemetryValue<number>('SessionTimeRemain') ?? 0;

  // Fetch from ReferenceFuelStore
  const getFuelStats = useReferenceFuelStore((state) => state.getFuelStats);
  const numLaps = settings?.avgLapsCount ?? 5;
  const {
    minLap,
    maxLap,
    avgConsumption: avgConsumption5L,
  } = getFuelStats(numLaps, false);
  const { avgConsumption: avgConsumption10L } = getFuelStats(10, false);
  const lapHistory = useReferenceFuelStore((state) => state.lapHistory);
  const activeLap = useReferenceFuelStore((state) => state.activeLap);

  const lapTimes = useLapTimes();
  let playerLapTime = (lapTimes.length > 0 ? lapTimes[playerIdx] : 0) || 0;

  const getReferenceTimeLap = useReferenceLapStore((s) => s.getReferenceLap);
  const drivers = useSessionDrivers();
  const player = drivers?.find((d) => d.CarIdx === playerIdx);
  const playerClassId = player?.CarClassID ?? -1;

  if (playerLapTime <= 0 && playerClassId > 0) {
    const refTimeLap = getReferenceTimeLap(playerIdx, playerClassId, false);
    if (refTimeLap && refTimeLap.finishTime > 0 && refTimeLap.startTime >= 0) {
      playerLapTime = refTimeLap.finishTime - refTimeLap.startTime;
    }
  }

  const classEstLapTimes = useCarIdxClassEstLapTime();
  if (playerLapTime <= 0) {
    playerLapTime = classEstLapTimes?.[playerIdx] ?? 0;
  }

  const lapsRemainingBasedOnTime = calculateLapsRemainingFromTime(
    lapDistPct,
    timeRemaining,
    playerLapTime
  );

  const hasTelemetryLaps =
    telemetryLapsRemaining > 0 && telemetryLapsRemaining !== 32767;
  const raceLapsRemaining = hasTelemetryLaps
    ? telemetryLapsRemaining
    : lapsRemainingBasedOnTime;

  const fuelConsumption = avgConsumption5L;
  // maxLap && maxLap.finishFuel >= 0 ? maxLap.startFuel - maxLap.finishFuel : 0;

  const lastCompletedLap = lapHistory[lapHistory.length - 1];
  // const referenceLap = lastCompletedLap || maxLap;
  // const fuelConsumedSoFar = referenceLap
  //   ? (interpolateFuelAtPoint(referenceLap, lapDistPct) ??
  //     lapDistPct * fuelConsumption)
  //   : lapDistPct * fuelConsumption;
  const fuelConsumedSoFar = activeLap.startFuel - fuelLevel;

  const remainingFuelCurrentLap = Math.max(
    0,
    fuelConsumption - fuelConsumedSoFar
  );
  const fullLapsRemaining = Math.max(0, Math.ceil(raceLapsRemaining) - 1);

  const fuelRequired = calculateFuelRequiredToFinish(
    fullLapsRemaining,
    lapDistPct,
    fuelConsumption,
    remainingFuelCurrentLap
  );

  const refuelRequired =
    calculateRefuelRequired(fuelLevel, fuelRequired) + safetyMargin;

  const lapsWithFuel = fuelConsumption > 0 ? fuelLevel / fuelConsumption : 0;

  const calculatedLastLapUsage =
    lastCompletedLap && lastCompletedLap.finishFuel >= 0
      ? lastCompletedLap.startFuel - lastCompletedLap.finishFuel
      : fuelConsumption;

  const projectedLapUsage = calculateProjectedLapUsage(
    maxLap,
    activeLap,
    fuelLevel,
    lapDistPct,
    fuelConsumption
  );

  // Return a default skeleton calculation that avoids all missing context/history data
  return {
    fuelLevel: fuelLevel ?? 0,
    lapDistPct: lapDistPct ?? 0,
    lastLapUsage: calculatedLastLapUsage,
    currentLapUsage: fuelConsumption,
    projectedLapUsage: projectedLapUsage,
    avgLaps: avgConsumption5L,
    avg10Laps: avgConsumption10L,
    avgAllGreenLaps: fuelConsumption,
    maxQualify: null,
    minLapUsage:
      minLap && minLap.startFuel > 0 ? minLap.startFuel - minLap.finishFuel : 0,
    maxLapUsage:
      maxLap && maxLap.startFuel > 0 ? maxLap.startFuel - maxLap.finishFuel : 0,
    lapsWithFuel: lapsWithFuel,
    lapsRemaining: raceLapsRemaining,
    totalLaps: currentLapNumber + 1 + raceLapsRemaining,
    currentLap: currentLapNumber ?? 0,
    fuelToFinish: fuelRequired,
    fuelToAdd: refuelRequired,
    pitWindowOpen: 0,
    pitWindowClose: 0,
    canFinish: raceLapsRemaining <= lapsWithFuel,
    targetConsumption: 0,
    confidence: calculateConfidence(lapHistory.length),
    fuelAtFinish: raceLapsRemaining * fuelConsumption - fuelLevel,
    avgLapTime: playerLapTime,
  };
}
