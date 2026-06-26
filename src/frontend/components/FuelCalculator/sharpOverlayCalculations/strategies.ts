import { LapData, StrategyResult } from './types';

export function calculateAverageConsumption(
  laps: LapData[],
  strategy: 'FULL' | 'LAST' | '5L'
): number {
  if (laps.length === 0) return 0;

  const lastLap = laps[laps.length - 1];
  const lastLapConsumption = lastLap.fuelUsed;

  if (strategy === '5L') {
    if (laps.length > 5) {
      const last5 = laps.slice(-5);
      const sum = last5.reduce((acc, lap) => acc + lap.fuelUsed, 0);
      return sum / 5;
    }
    return lastLapConsumption;
  }

  if (strategy === 'FULL') {
    if (laps.length > 1) {
      const skippedFirst = laps.slice(1);
      const sum = skippedFirst.reduce((acc, lap) => acc + lap.fuelUsed, 0);
      return sum / skippedFirst.length;
    }
    return lastLapConsumption;
  }

  // Default: LAST
  return lastLapConsumption;
}

export function calculateLapsOfFuelRemaining(
  currentFuelLevel: number,
  fuelConsumption: number,
  fuelCutOff = 0.3
): number {
  if (fuelConsumption <= 0) return 0;
  return (currentFuelLevel - fuelCutOff) / fuelConsumption;
}

export function calculateRefuelRequired(
  currentFuelLevel: number,
  sessionLapsRemaining: number,
  fuelConsumption: number,
  fuelCutOff = 0.3
): number {
  if (sessionLapsRemaining === 0 || fuelConsumption <= 0) {
    return 0;
  }

  const fuelRequired = sessionLapsRemaining * fuelConsumption;
  const fuelAtEnd = currentFuelLevel - fuelRequired;

  if (fuelAtEnd < fuelCutOff) {
    return fuelCutOff - fuelAtEnd;
  }

  return fuelRequired - currentFuelLevel;
}

export function runFuelStrategy(
  name: string,
  laps: LapData[],
  sessionLapsRemaining: number,
  currentFuelLevel: number,
  strategy: 'FULL' | 'LAST' | '5L',
  fuelCutOff = 0.3
): StrategyResult {
  const fuelConsumption = calculateAverageConsumption(laps, strategy);
  const refuelRequired = calculateRefuelRequired(
    currentFuelLevel,
    sessionLapsRemaining,
    fuelConsumption,
    fuelCutOff
  );
  const lapsOfFuelRemaining = calculateLapsOfFuelRemaining(
    currentFuelLevel,
    fuelConsumption,
    fuelCutOff
  );

  return {
    name,
    fuelConsumption,
    lapsRemaining: sessionLapsRemaining,
    refuelRequired,
    lapsOfFuelRemaining,
    requiresRefueling: refuelRequired > 0,
  };
}
