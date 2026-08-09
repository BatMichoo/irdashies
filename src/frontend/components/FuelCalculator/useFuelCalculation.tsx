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
  calculatePitWindowOpen,
  calculatePitWindowClose,
  calculateTargetConsumption,
  calculateStopsRemaining,
  calculateTargetScenarios,
  interpolateFuelAtPoint,
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
  const minLap = useReferenceFuelStore((state) => state.minLap);
  const maxLap = useReferenceFuelStore((state) => state.maxLap);
  const persistedLap = useReferenceFuelStore((state) => state.persistedLap);
  const getAvgConsumption = useReferenceFuelStore(
    (state) => state.getAvgConsumption
  );
  const tankSize = useReferenceFuelStore((state) => state.tankSize);
  const numLaps = settings?.avgLapsCount ?? 5;
  const avgConsumption5L = getAvgConsumption(numLaps, false);
  const avgConsumption10L = getAvgConsumption(10, false);
  const fuelConsumption = getAvgConsumption();
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

  const lastCompletedLap = lapHistory[lapHistory.length - 1];
  const calculatedLastLapUsage =
    lastCompletedLap && lastCompletedLap.finishFuel >= 0
      ? lastCompletedLap.startFuel - lastCompletedLap.finishFuel
      : fuelConsumption;

  const referenceLap =
    maxLap && maxLap.startFuel > 0
      ? maxLap
      : lastCompletedLap && lastCompletedLap.startFuel > 0
        ? lastCompletedLap
        : persistedLap && persistedLap.startFuel > 0
          ? persistedLap
          : null;

  let remainingFuelCurrentLap: number;
  if (
    activeLap &&
    activeLap.isCleanLap &&
    activeLap.startFuel > 0 &&
    fuelLevel <= activeLap.startFuel
  ) {
    const fuelConsumedSoFar = activeLap.startFuel - fuelLevel;
    remainingFuelCurrentLap = Math.max(0, fuelConsumption - fuelConsumedSoFar);
  } else if (referenceLap) {
    const interpolatedFuel = interpolateFuelAtPoint(referenceLap, lapDistPct);
    const refConsumption = referenceLap.startFuel - referenceLap.finishFuel;
    remainingFuelCurrentLap =
      interpolatedFuel !== null
        ? Math.max(refConsumption - interpolatedFuel, 0)
        : (1 - lapDistPct) * fuelConsumption;
  } else {
    remainingFuelCurrentLap = (1 - lapDistPct) * fuelConsumption;
  }

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

  const projectedLapUsage = calculateProjectedLapUsage(
    referenceLap,
    activeLap,
    fuelLevel,
    lapDistPct,
    fuelConsumption
  );

  const pitWindowOpen = calculatePitWindowOpen(
    currentLapNumber,
    tankSize,
    avgConsumption5L,
    lapsWithFuel
  );
  const pitWindowClose = calculatePitWindowClose(
    currentLapNumber,
    lapsWithFuel
  );

  const minConsumption =
    minLap && minLap.startFuel > 0
      ? minLap.startFuel - minLap.finishFuel
      : fuelConsumption;
  const maxConsumption =
    maxLap && maxLap.startFuel > 0
      ? maxLap.startFuel - maxLap.finishFuel
      : fuelConsumption;

  const targetConsumption = calculateTargetConsumption(
    fuelLevel,
    raceLapsRemaining
  );

  const stopsRemaining = calculateStopsRemaining(
    raceLapsRemaining,
    fuelConsumption,
    fuelLevel,
    tankSize
  );

  const targetScenarios = calculateTargetScenarios(fuelLevel, lapsWithFuel);

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
    maxQualify: maxConsumption,
    minLapUsage: minConsumption,
    maxLapUsage: maxConsumption,
    lapsWithFuel: lapsWithFuel,
    lapsRemaining: raceLapsRemaining,
    totalLaps: currentLapNumber + 1 + raceLapsRemaining,
    currentLap: currentLapNumber ?? 0,
    fuelToFinish: fuelRequired,
    fuelToAdd: refuelRequired,
    pitWindowOpen: pitWindowOpen,
    pitWindowClose: pitWindowClose,
    canFinish: raceLapsRemaining <= lapsWithFuel,
    stopsRemaining: stopsRemaining,
    targetConsumption: targetConsumption,
    targetScenarios: targetScenarios,
    confidence: calculateConfidence(lapHistory.length),
    fuelAtFinish: raceLapsRemaining * fuelConsumption - fuelLevel,
    avgLapTime: playerLapTime,
    lapsRange: [
      Math.floor(raceLapsRemaining),
      Math.ceil(raceLapsRemaining),
    ] as [number, number],
  } as FuelCalculation;
}
