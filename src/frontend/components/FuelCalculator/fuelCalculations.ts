/**
 * Utility functions for fuel calculations
 */

import type { FuelLapData } from './types';
import type { ReferenceFuel } from '@irdashies/types';
import { getBucketIndex } from '@irdashies/context';

// ============================================================================
// Constants - Session Flags (defined once at module level)
// ============================================================================

/** Green flag bit - racing conditions */
export const FLAG_GREEN = 0x00000004; // 1 << 2
/** White flag bit - final lap */
export const FLAG_WHITE = 0x00000002; // 1 << 1
/** Checkered flag bit - race finished */
export const FLAG_CHECKERED = 0x00000001; // 1 << 0
/** Yellow flag bit - caution */
export const FLAG_YELLOW = 0x00004000; // 1 << 14
/** Caution flag bit */
export const FLAG_CAUTION = 0x00008000; // 1 << 15
/** Red flag bit - session stopped */
export const FLAG_RED = 0x00010000; // 1 << 16

/** Combined mask for non-green conditions */
const CAUTION_FLAGS_MASK = FLAG_YELLOW | FLAG_CAUTION | FLAG_RED;

// ============================================================================
// Calculation Functions
// ============================================================================

/**
 * Calculate weighted average fuel consumption
 * Recent laps are weighted more heavily than older laps
 */
export function calculateWeightedAverage(laps: FuelLapData[]): number {
  if (laps.length === 0) return 0;

  let weightedSum = 0;
  let weightSum = 0;
  const baseWeight = 1.2;
  const lapCount = laps.length;

  // Use exponential weighting: more recent laps have higher weight
  for (let idx = 0; idx < lapCount; idx++) {
    const weight = baseWeight ** (lapCount - idx - 1);
    weightedSum += laps[idx].fuelUsed * weight;
    weightSum += weight;
  }

  return weightedSum / weightSum;
}

/**
 * Calculate simple average of fuel values
 * More efficient than weighted average when weights aren't needed
 */
export function calculateSimpleAverage(laps: FuelLapData[]): number {
  if (laps.length === 0) return 0;
  let sum = 0;
  for (const lap of laps) {
    sum += lap.fuelUsed;
  }
  return sum / laps.length;
}

/**
 * Calculate average lap time from lap data
 */
export function calculateAvgLapTime(laps: FuelLapData[]): number {
  if (laps.length === 0) return 0;
  let sum = 0;
  for (const lap of laps) {
    sum += lap.lapTime;
  }
  return sum / laps.length;
}

/**
 * Find min and max fuel usage in a single pass
 * More efficient than separate Math.min/max with spread operator
 */
export function findFuelMinMax(laps: FuelLapData[]): {
  min: number;
  max: number;
} {
  if (laps.length === 0) return { min: 0, max: 0 };

  let min = laps[0].fuelUsed;
  let max = laps[0].fuelUsed;

  for (let i = 1; i < laps.length; i++) {
    const fuel = laps[i].fuelUsed;
    if (fuel < min) min = fuel;
    if (fuel > max) max = fuel;
  }

  return { min, max };
}

// ============================================================================
// Unit Conversion Functions
// ============================================================================

/** Conversion factor: 1 liter = 0.264172 gallons */
const LITERS_TO_GALLONS = 0.264172;

/**
 * Convert liters to gallons
 */
export function litersToGallons(liters: number): number {
  return liters * LITERS_TO_GALLONS;
}

/**
 * Convert gallons to liters
 */
export function gallonsToLiters(gallons: number): number {
  return gallons / LITERS_TO_GALLONS;
}

/** Convert an internal litre value to the selected display unit. */
export function fuelDisplayValue(liters: number, units: 'L' | 'gal'): number {
  return units === 'gal' ? litersToGallons(liters) : liters;
}

/**
 * Format fuel amount for display
 */
export function formatFuel(
  liters: number,
  units: 'L' | 'gal',
  decimals = 2
): string {
  const value = fuelDisplayValue(liters, units);
  return `${value.toFixed(decimals)} ${units}`;
}

// ============================================================================
// Lap Detection Functions
// ============================================================================

/**
 * Detect if a lap crossing occurred
 * Lap crossing happens when distance percentage goes from high (>0.9) to low (<0.1)
 */
export function detectLapCrossing(
  currentDistPct: number,
  lastDistPct: number
): boolean {
  // Use stricter threshold to avoid false positives at exact 0.0/1.0
  // Broadened to handle potential telemetry gaps or exact 1.0 values
  return (
    lastDistPct > 0.9 && currentDistPct < 0.1 && currentDistPct < lastDistPct
  );
}

// ============================================================================
// Session Flag Functions
// ============================================================================

/**
 * Check if current session flags indicate green flag conditions
 */
export function isGreenFlag(sessionFlags: number): boolean {
  return (sessionFlags & CAUTION_FLAGS_MASK) === 0;
}

/**
 * Check if white flag is showing (final lap in timed races)
 */
export function isWhiteFlag(sessionFlags: number): boolean {
  return (sessionFlags & FLAG_WHITE) !== 0;
}

/**
 * Check if checkered flag is showing (race finished)
 */
export function isCheckeredFlag(sessionFlags: number): boolean {
  return (sessionFlags & FLAG_CHECKERED) !== 0;
}

/**
 * Check if either white or checkered flag is showing (final lap / race complete)
 */
export function isFinalLap(sessionFlags: number): boolean {
  return (sessionFlags & (FLAG_WHITE | FLAG_CHECKERED)) !== 0;
}

// ============================================================================
// Confidence Functions
// ============================================================================

/** Threshold for high confidence calculations */
const HIGH_CONFIDENCE_LAPS = 10;
/** Threshold for medium confidence calculations */
const MEDIUM_CONFIDENCE_LAPS = 5;

/**
 * Calculate confidence level based on number of valid laps
 */
export function calculateConfidence(
  validLapCount: number
): 'high' | 'medium' | 'low' {
  if (validLapCount >= HIGH_CONFIDENCE_LAPS) return 'high';
  if (validLapCount >= MEDIUM_CONFIDENCE_LAPS) return 'medium';
  return 'low';
}

/**
 * Calculate total fuel required to finish the race
 */
export function calculateFuelRequiredToFinish(
  raceLapsRemaining: number,
  trackPct: number,
  fuelConsumption: number,
  safetyMargin: number
): number {
  return (raceLapsRemaining - trackPct) * fuelConsumption + safetyMargin;
}

/**
 * Calculate refuel required to finish the race
 */
export function calculateRefuelRequired(
  fuelLevel: number,
  fuelRequiredToFinish: number
) {
  return fuelRequiredToFinish - fuelLevel;
}

/**
 * Calculate the opening lap of the pit window
 * Earliest lap to pit based on current lap, tank size, average consumption, and laps with fuel
 */
export function calculatePitWindowOpen(
  currentLap: number,
  tankSize: number,
  avgFuelPerLap: number,
  lapsWithFuel: number
): number {
  if (avgFuelPerLap <= 0 || tankSize <= 0) return 0;
  return Math.floor(currentLap + tankSize / avgFuelPerLap - lapsWithFuel - 1);
}

/**
 * Calculate the closing lap of the pit window
 * Latest lap to pit before running out of fuel
 */
export function calculatePitWindowClose(
  currentLap: number,
  lapsWithFuel: number
): number {
  return currentLap + lapsWithFuel - 1;
}

/**
 * Calculate the target fuel consumption per lap needed to finish the race
 * on the fuel currently in the car.
 *
 * @param fuelLevel - Current fuel level in the car (litres)
 * @param lapsRemaining - Estimated laps remaining in the session
 * @returns Target consumption per lap, or 0 if lapsRemaining is not positive
 */
export function calculateTargetConsumption(
  fuelLevel: number,
  lapsRemaining: number
): number {
  if (lapsRemaining <= 0) return 0;
  return fuelLevel / lapsRemaining;
}

/**
 * Calculate the number of pit stops still required to finish the race.
 *
 * @param lapsRemaining - Estimated laps remaining in the session
 * @param fuelConsumption - Average fuel consumption per lap (litres)
 * @param fuelLevel - Current fuel level in the car (litres)
 * @param tankSize - Maximum fuel tank capacity (litres)
 * @returns Number of stops remaining (minimum 0), or 0 if tankSize is not positive
 */
export function calculateStopsRemaining(
  lapsRemaining: number,
  fuelConsumption: number,
  fuelLevel: number,
  tankSize: number
): number {
  if (tankSize <= 0) return 0;
  return Math.max(
    0,
    Math.ceil((lapsRemaining * fuelConsumption - fuelLevel) / tankSize)
  );
}

/**
 * Calculate the three pit-stop target scenarios centred on the number of laps
 * the current fuel load can cover.
 *
 * Generates a [-1, 0, +1] lap window around `floor(lapsWithFuel)`:
 * - laps - 1: conservative (pit one lap earlier than fuel allows)
 * - laps    : ideal (current fuel exactly covers the stint)
 * - laps + 1: economy (must save fuel to extend one extra lap)
 *
 * @param fuelLevel   - Current fuel level in the car (litres)
 * @param lapsWithFuel - Estimated laps the current fuel will last
 * @returns Array of 3 scenario objects (fewer if centre laps ≤ 1)
 */
export function calculateTargetScenarios(
  fuelLevel: number,
  lapsWithFuel: number
): { laps: number; fuelPerLap: number; isCurrentTarget: boolean }[] {
  const centerLaps = Math.floor(lapsWithFuel);
  if (centerLaps <= 0 || fuelLevel <= 0) return [];

  return ([-1, 0, 1] as const)
    .map((offset) => {
      const laps = centerLaps + offset;
      if (laps <= 0) return null;
      return {
        laps,
        fuelPerLap: fuelLevel / laps,
        isCurrentTarget: offset === 0,
      };
    })
    .filter(
      (
        s
      ): s is { laps: number; fuelPerLap: number; isCurrentTarget: boolean } =>
        s !== null
    );
}

export function calculateStrategy(
  consumption: number,
  lapsRemaining: number,
  lapDistPct: number,
  fuelLevel: number,
  safetyMargin: number
) {
  if (consumption <= 0)
    return {
      laps: NaN,
      refuel: 0,
      totalReq: 0,
      isDeficit: false,
      isValid: false,
      hideRefuel: true,
    };

  // Laps calculation
  const lapsBasedOnFuel = fuelLevel / consumption;

  // Finish (Fuel at finish) -> This is effectively our BALANCE for coloring
  const fuelNeeded = calculateFuelRequiredToFinish(
    lapsRemaining,
    lapDistPct,
    consumption,
    safetyMargin
  );
  const balance = calculateRefuelRequired(fuelLevel, fuelNeeded);

  // Logic for Refuel Column:
  // If Balance > 0 (Deficit): Show POSITIVE amount to ADD.
  // If Balance <= 0 (Surplus): Show POSITIVE amount EXTRA.
  const refuelValue = balance > 0 ? balance : Math.abs(balance);
  const isDeficit = balance > 0;

  return {
    laps: Number.parseFloat(lapsBasedOnFuel.toFixed(2)), // number
    refuel: Number.parseFloat(refuelValue.toFixed(2)), // number (absolute value to show)
    totalReq: Number.parseFloat(fuelNeeded.toFixed(2)), // number
    isDeficit: isDeficit, // boolean
    isValid: true,
    hideRefuel: false,
  };
}

/**
 * Calculate the projected fuel consumption for the current lap using the last lap as reference data
 */
export function calculateProjectedLapUsage(
  lastLap: ReferenceFuel | undefined | null,
  activeLap: ReferenceFuel | undefined | null,
  fuelLevel: number,
  lapDistPct: number,
  fallbackConsumption: number
): number {
  if (
    !lastLap ||
    !lastLap.isCleanLap ||
    lastLap.startFuel <= 0 ||
    lastLap.finishFuel < 0 ||
    lastLap.pointsCount <= 0
  ) {
    return fallbackConsumption;
  }

  const lastLapConsumption = lastLap.startFuel - lastLap.finishFuel;
  if (lastLapConsumption <= 0) {
    return fallbackConsumption;
  }

  const isActiveLapValid =
    activeLap &&
    activeLap.isCleanLap &&
    activeLap.startFuel > 0 &&
    fuelLevel <= activeLap.startFuel;

  // 1. Fuel consumed so far on the current lap
  const fuelConsumedSoFar = isActiveLapValid
    ? Math.max(activeLap.startFuel - fuelLevel, 0)
    : 0;

  // 2. Find remaining consumption based on last lap reference using interpolation
  const interpolatedFuel = interpolateFuelAtPoint(lastLap, lapDistPct);

  const lastLapRemaining =
    interpolatedFuel !== null
      ? Math.max(lastLapConsumption - interpolatedFuel, 0)
      : (1 - lapDistPct) * lastLapConsumption;

  // 3. Projected total consumption (fuel consumed so far + projected remaining)
  if (isActiveLapValid) {
    return fuelConsumedSoFar + lastLapRemaining;
  }

  return lastLapConsumption;
}

/**
 * Hermite interpolation helper function
 */
function hermiteBasis(
  t: number,
  y0: number,
  y1: number,
  m0: number,
  m1: number
): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * y0 + h10 * m0 + h01 * y1 + h11 * m1;
}

/**
 * Interpolate fuel consumed at a given track percentage
 */
export function interpolateFuelAtPoint(
  lap: ReferenceFuel,
  targetPct: number
): number | null {
  if (lap.pointsCount <= 0 || lap.fuelConsumed.length === 0) {
    return null;
  }

  // 1. Normalize the target to find the exact grid key (p0)
  const key0 = getBucketIndex(targetPct, lap.pointsCount);

  // 2. Calculate the next key (p1)
  const key1 = getBucketIndex(targetPct + lap.interval, lap.pointsCount);

  // 3. Fast Lookup
  const p0fuel = lap.fuelConsumed[key0];
  const p0tangent = lap.tangents[key0];
  const p0pos = lap.pointPos[key0];

  const p0 = {
    fuelConsumed: p0fuel,
    tangent: p0tangent,
    trackPct: p0pos,
  };

  const p1fuel = lap.fuelConsumed[key1];
  const p1tangent = lap.tangents[key1];
  const p1pos = lap.pointPos[key1];

  const p1 = {
    fuelConsumed: p1fuel,
    tangent: p1tangent,
    trackPct: p1pos,
  };

  if (
    p0.fuelConsumed === undefined ||
    p0.fuelConsumed === -1 ||
    p0.trackPct === undefined ||
    p0.trackPct === -1
  ) {
    return null;
  }

  if (
    p1.fuelConsumed === undefined ||
    p1.fuelConsumed === -1 ||
    p1.trackPct === undefined ||
    p1.trackPct === -1
  ) {
    return p0.fuelConsumed;
  }

  // 4. Hermite Interpolation
  let h = p1.trackPct - p0.trackPct;
  let y1 = p1.fuelConsumed;

  // Guard against divide by zero or wrapped points
  if (h <= 0) {
    h = 1 - p0.trackPct + p1.trackPct;
    const lapFuel = lap.startFuel - lap.finishFuel;
    y1 = p1.fuelConsumed + lapFuel;
  }

  if (h <= 0) {
    return p0.fuelConsumed;
  }

  const t = (targetPct - p0.trackPct) / h;

  return hermiteBasis(t, p0.fuelConsumed, y1, p0.tangent * h, p1.tangent * h);
}
