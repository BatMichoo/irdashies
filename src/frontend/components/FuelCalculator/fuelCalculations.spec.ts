/**
 * Unit tests for fuel calculation utilities
 */

import { describe, it, expect } from 'vitest';
import {
  calculateWeightedAverage,
  calculateSimpleAverage,
  calculateAvgLapTime,
  findFuelMinMax,
  litersToGallons,
  gallonsToLiters,
  fuelDisplayValue,
  formatFuel,
  detectLapCrossing,
  isGreenFlag,
  isWhiteFlag,
  isCheckeredFlag,
  isFinalLap,
  calculateConfidence,
  calculateFuelRequiredToFinish,
  calculateRefuelRequired,
  calculatePitWindowOpen,
  calculatePitWindowClose,
  calculateStrategy,
  calculateTargetConsumption,
  calculateStopsRemaining,
  calculateTargetScenarios,
  calculateProjectedLapUsage,
  interpolateFuelAtPoint,
  FLAG_GREEN,
  FLAG_WHITE,
  FLAG_CHECKERED,
  FLAG_YELLOW,
  FLAG_CAUTION,
  FLAG_RED,
} from './fuelCalculations';
import type { FuelLapData } from './types';
import type { ReferenceFuel } from '@irdashies/types';

describe('fuelCalculations', () => {
  describe('calculateWeightedAverage', () => {
    it('should return 0 for empty array', () => {
      expect(calculateWeightedAverage([])).toBe(0);
    });

    it('should return fuel value for single lap', () => {
      const laps = [mockLap(1, 2.5, 90)];
      expect(calculateWeightedAverage(laps)).toBe(2.5);
    });

    it('should weight recent laps more heavily', () => {
      const laps = [
        mockLap(3, 3.0, 90), // Most recent
        mockLap(2, 2.5, 90), // Middle
        mockLap(1, 2.0, 90), // Oldest
      ];

      const avg = calculateWeightedAverage(laps);
      // Recent lap (3.0) should have more weight
      expect(avg).toBeGreaterThan(2.5);
      expect(avg).toBeLessThan(3.0);
    });
  });

  describe('calculateSimpleAverage', () => {
    it('should return 0 for empty array', () => {
      expect(calculateSimpleAverage([])).toBe(0);
    });

    it('should calculate correct average', () => {
      const laps = [
        mockLap(1, 2.0, 90),
        mockLap(2, 2.5, 90),
        mockLap(3, 3.0, 90),
      ];
      expect(calculateSimpleAverage(laps)).toBe(2.5);
    });
  });

  describe('calculateAvgLapTime', () => {
    it('should return 0 for empty array', () => {
      expect(calculateAvgLapTime([])).toBe(0);
    });

    it('should calculate correct average lap time', () => {
      const laps = [
        mockLap(1, 2.0, 88),
        mockLap(2, 2.5, 90),
        mockLap(3, 3.0, 92),
      ];
      expect(calculateAvgLapTime(laps)).toBe(90);
    });
  });

  describe('findFuelMinMax', () => {
    it('should return 0,0 for empty array', () => {
      expect(findFuelMinMax([])).toEqual({ min: 0, max: 0 });
    });

    it('should find correct min and max', () => {
      const laps = [
        mockLap(1, 2.0, 90),
        mockLap(2, 3.5, 90),
        mockLap(3, 1.5, 90),
        mockLap(4, 2.8, 90),
      ];
      expect(findFuelMinMax(laps)).toEqual({ min: 1.5, max: 3.5 });
    });

    it('should handle single lap', () => {
      const laps = [mockLap(1, 2.5, 90)];
      expect(findFuelMinMax(laps)).toEqual({ min: 2.5, max: 2.5 });
    });
  });

  describe('unit conversions', () => {
    it('should convert liters to gallons', () => {
      expect(litersToGallons(10)).toBeCloseTo(2.64172, 4);
      expect(litersToGallons(0)).toBe(0);
    });

    it('should convert gallons to liters', () => {
      expect(gallonsToLiters(2.64172)).toBeCloseTo(10, 2);
      expect(gallonsToLiters(0)).toBe(0);
    });

    it('should be reversible', () => {
      const liters = 50;
      const gallons = litersToGallons(liters);
      const backToLiters = gallonsToLiters(gallons);
      expect(backToLiters).toBeCloseTo(liters, 4);
    });
  });

  describe('formatFuel', () => {
    it('should format liters with default decimals', () => {
      expect(formatFuel(10.5, 'L')).toBe('10.50 L');
      expect(formatFuel(2.123, 'L')).toBe('2.12 L');
    });

    it('should format gallons with conversion', () => {
      expect(formatFuel(10, 'gal')).toBe('2.64 gal');
    });

    it('should respect custom decimal places', () => {
      expect(formatFuel(10.5, 'L', 1)).toBe('10.5 L');
      expect(formatFuel(10.5, 'L', 3)).toBe('10.500 L');
    });
  });

  describe('fuelDisplayValue', () => {
    it('converts litre values for a gallon display without changing litre output', () => {
      expect(fuelDisplayValue(0.8, 'gal')).toBeCloseTo(0.2113, 4);
      expect(fuelDisplayValue(0.8, 'L')).toBe(0.8);
    });
  });

  describe('detectLapCrossing', () => {
    it('should detect lap crossing from high to low percentage', () => {
      expect(detectLapCrossing(0.05, 0.95)).toBe(true);
      expect(detectLapCrossing(0.02, 0.98)).toBe(true);
    });

    it('should not detect crossing for normal progression', () => {
      expect(detectLapCrossing(0.5, 0.4)).toBe(false);
      expect(detectLapCrossing(0.8, 0.7)).toBe(false);
    });

    it('should not detect crossing from low to high', () => {
      expect(detectLapCrossing(0.95, 0.05)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(detectLapCrossing(0.0, 1.0)).toBe(true);
      expect(detectLapCrossing(0.09, 0.91)).toBe(true);
      expect(detectLapCrossing(0.1, 0.9)).toBe(false); // No longer crossing under stricter >0.9 and <0.1 threshold
    });
  });

  describe('session flags', () => {
    describe('isGreenFlag', () => {
      it('should detect green flag (no caution flags)', () => {
        expect(isGreenFlag(FLAG_GREEN)).toBe(true);
        expect(isGreenFlag(0)).toBe(true); // No flags at all
      });

      it('should detect yellow flag', () => {
        expect(isGreenFlag(FLAG_YELLOW)).toBe(false);
      });

      it('should detect caution flag', () => {
        expect(isGreenFlag(FLAG_CAUTION)).toBe(false);
      });

      it('should detect red flag', () => {
        expect(isGreenFlag(FLAG_RED)).toBe(false);
      });

      it('should handle combined flags', () => {
        const YELLOW_AND_GREEN = FLAG_YELLOW | FLAG_GREEN;
        expect(isGreenFlag(YELLOW_AND_GREEN)).toBe(false);
      });
    });

    describe('isWhiteFlag', () => {
      it('should detect white flag', () => {
        expect(isWhiteFlag(FLAG_WHITE)).toBe(true);
        expect(isWhiteFlag(0)).toBe(false);
      });
    });

    describe('isCheckeredFlag', () => {
      it('should detect checkered flag', () => {
        expect(isCheckeredFlag(FLAG_CHECKERED)).toBe(true);
        expect(isCheckeredFlag(0)).toBe(false);
      });
    });

    describe('isFinalLap', () => {
      it('should detect white or checkered flag', () => {
        expect(isFinalLap(FLAG_WHITE)).toBe(true);
        expect(isFinalLap(FLAG_CHECKERED)).toBe(true);
        expect(isFinalLap(FLAG_WHITE | FLAG_CHECKERED)).toBe(true);
        expect(isFinalLap(0)).toBe(false);
        expect(isFinalLap(FLAG_GREEN)).toBe(false);
      });
    });
  });

  describe('calculateConfidence', () => {
    it('should return low confidence for few laps', () => {
      expect(calculateConfidence(0)).toBe('low');
      expect(calculateConfidence(2)).toBe('low');
      expect(calculateConfidence(4)).toBe('low');
    });

    it('should return medium confidence for moderate laps', () => {
      expect(calculateConfidence(5)).toBe('medium');
      expect(calculateConfidence(7)).toBe('medium');
      expect(calculateConfidence(9)).toBe('medium');
    });

    it('should return high confidence for many laps', () => {
      expect(calculateConfidence(10)).toBe('high');
      expect(calculateConfidence(20)).toBe('high');
      expect(calculateConfidence(50)).toBe('high');
    });
  });

  describe('calculateFuelRequiredToFinish', () => {
    it('should calculate correct fuel required to finish', () => {
      // 11.0 laps remaining, 0.5 lap completed, 3.0L consumption, 0.5L safety margin
      // (11.0 - 0.5) * 3.0 + 0.5 = 32.0L
      expect(calculateFuelRequiredToFinish(11.0, 0.5, 3.0, 0.5)).toBe(32.0);
    });

    it('should handle zero safety margin', () => {
      // (5.0 - 0.0) * 2.0 + 0.0 = 10.0L
      expect(calculateFuelRequiredToFinish(5.0, 0.0, 2.0, 0.0)).toBe(10.0);
    });
  });

  describe('calculateRefuelRequired', () => {
    it('should calculate positive refuel value when current fuel is less than required', () => {
      // fuelLevel = 12.0L, required = 32.0L => refuel = 32.0 - 12.0 = 20.0L
      expect(calculateRefuelRequired(12.0, 32.0)).toBe(20.0);
    });

    it('should calculate negative refuel value (surplus) when current fuel is more than required', () => {
      // fuelLevel = 15.0L, required = 10.0L => refuel = 10.0 - 15.0 = -5.0L
      expect(calculateRefuelRequired(15.0, 10.0)).toBe(-5.0);
    });
  });

  describe('calculatePitWindowOpen', () => {
    it('should calculate correct pit window open lap', () => {
      // currentLap = 5, tankSize = 60, avgFuelPerLap = 3.0, lapsWithFuel = 10
      // 5 + (60 / 3.0) - 10 - 1 = 5 + 20 - 10 - 1 = 14
      expect(calculatePitWindowOpen(5, 60, 3.0, 10)).toBe(14);
    });

    it('should return 0 when avgFuelPerLap or tankSize is zero or negative', () => {
      expect(calculatePitWindowOpen(5, 0, 3.0, 10)).toBe(0);
      expect(calculatePitWindowOpen(5, 60, 0, 10)).toBe(0);
    });

    it('floors the result to a whole lap number', () => {
      // currentLap = 1, tankSize = 50, avgFuelPerLap = 3.0, lapsWithFuel = 8
      // raw = 1 + (50 / 3.0) - 8 - 1 = 1 + 16.666… - 9 = 8.666… → floor = 8
      expect(calculatePitWindowOpen(1, 50, 3.0, 8)).toBe(8);
    });
  });

  describe('calculatePitWindowClose', () => {
    it('should calculate correct pit window close lap', () => {
      // currentLap = 5, lapsWithFuel = 10 => 5 + 10 - 1 = 14
      expect(calculatePitWindowClose(5, 10)).toBe(14);
    });
  });

  describe('calculateStrategy', () => {
    it('should return invalid strategy state if consumption is zero or negative', () => {
      const result = calculateStrategy(0, 10.5, 0.5, 12.0, 0.5);
      expect(result.isValid).toBe(false);
      expect(result.laps).toBeNaN();
      expect(result.hideRefuel).toBe(true);
    });

    it('should calculate correct strategy values for valid consumption', () => {
      // consumption = 3.0, lapsRemaining = 11.0, lapDistPct = 0.5, fuelLevel = 12.0, safetyMargin = 0.5
      // laps = 12.0 / 3.0 = 4.0
      // totalReq = (11.0 - 0.5) * 3.0 + 0.5 = 32.0
      // refuel = 32.0 - 12.0 = 20.0
      // isDeficit = true
      const result = calculateStrategy(3.0, 11.0, 0.5, 12.0, 0.5);
      expect(result.isValid).toBe(true);
      expect(result.laps).toBe(4.0);
      expect(result.totalReq).toBe(32.0);
      expect(result.refuel).toBe(20.0);
      expect(result.isDeficit).toBe(true);
      expect(result.hideRefuel).toBe(false);
    });

    it('should handle surplus fuel state correctly', () => {
      // consumption = 2.0, lapsRemaining = 5.0, lapDistPct = 0.0, fuelLevel = 15.0, safetyMargin = 0.5
      // laps = 15.0 / 2.0 = 7.5
      // totalReq = (5.0 - 0.0) * 2.0 + 0.5 = 10.5
      // refuel = 15.0 - 10.5 = 4.5 (surplus shown as positive absolute value)
      // isDeficit = false
      const result = calculateStrategy(2.0, 5.0, 0.0, 15.0, 0.5);
      expect(result.isValid).toBe(true);
      expect(result.laps).toBe(7.5);
      expect(result.totalReq).toBe(10.5);
      expect(result.refuel).toBe(4.5);
      expect(result.isDeficit).toBe(false);
      expect(result.hideRefuel).toBe(false);
    });
  });

  describe('calculateProjectedLapUsage', () => {
    it('should return fallback consumption if last lap is not available or invalid', () => {
      expect(calculateProjectedLapUsage(undefined, null, 10.0, 0.5, 3.0)).toBe(
        3.0
      );
      expect(
        calculateProjectedLapUsage(
          { startFuel: 0 } as unknown as ReferenceFuel,
          null,
          10.0,
          0.5,
          3.0
        )
      ).toBe(3.0);
    });

    it('should return last lap total if activeLap is not available or invalid', () => {
      const lastLap: ReferenceFuel = {
        startFuel: 5.0,
        finishFuel: 2.0, // 3.0L total
        fuelConsumed: new Float32Array([0, 1.5, 3.0]),
        pointPos: new Float32Array([0, 0.5, 1.0]),
        tangents: new Float32Array([0, 0, 0]),
        interval: 0.5,
        pointsCount: 3,
        lastTrackedPct: 1.0,
        isCleanLap: true,
      };

      expect(calculateProjectedLapUsage(lastLap, null, 10.0, 0.5, 4.0)).toBe(
        3.0
      );
    });

    it('should project consumption using fuelConsumedSoFar + remaining reference fuel', () => {
      const lastLap: ReferenceFuel = {
        startFuel: 5.0,
        finishFuel: 2.0, // 3.0L total
        fuelConsumed: new Float32Array([0, 1.5, 3.0]),
        pointPos: new Float32Array([0, 0.5, 1.0]),
        tangents: new Float32Array([0, 0, 0]),
        interval: 0.5,
        pointsCount: 3,
        lastTrackedPct: 1.0,
        isCleanLap: true,
      };

      const activeLap: ReferenceFuel = {
        startFuel: 10.0,
        finishFuel: -1,
        fuelConsumed: new Float32Array([0, 1.0, -1]),
        pointPos: new Float32Array([0, 0.5, 1.0]),
        tangents: new Float32Array([0, 0, 0]),
        interval: 0.5,
        pointsCount: 3,
        lastTrackedPct: 0.5,
        isCleanLap: true,
      };

      // at 50% distance, key = floor(0.5 * 3) = 1
      // lastLapFuelConsumedAtDist = 1.5
      // lastLapRemaining = lastLapTotal (3.0) - 1.5 = 1.5
      // current fuel level = 9.0 (so fuelConsumedSoFar = 10.0 - 9.0 = 1.0)
      // projected = 1.0 + 1.5 = 2.5
      const projected = calculateProjectedLapUsage(
        lastLap,
        activeLap,
        9.0,
        0.5,
        4.0
      );
      expect(projected).toBe(2.5);
    });
  });

  describe('interpolateFuelAtPoint', () => {
    it('should return null if pointsCount or fuelConsumed array is empty', () => {
      const emptyLap: ReferenceFuel = {
        pointsCount: 0,
        fuelConsumed: new Float32Array([]),
        pointPos: new Float32Array([]),
        tangents: new Float32Array([]),
        interval: 0.1,
        startFuel: 10.0,
        finishFuel: 8.0,
        lastTrackedPct: 1.0,
        isCleanLap: true,
      };
      expect(interpolateFuelAtPoint(emptyLap, 0.5)).toBeNull();
    });

    it('should return point 0 fuel if point 1 data is missing', () => {
      const partialLap: ReferenceFuel = {
        pointsCount: 2,
        fuelConsumed: new Float32Array([1.0, -1]),
        pointPos: new Float32Array([0.0, -1]),
        tangents: new Float32Array([0, 0]),
        interval: 0.5,
        startFuel: 10.0,
        finishFuel: 8.0,
        lastTrackedPct: 0.5,
        isCleanLap: true,
      };
      expect(interpolateFuelAtPoint(partialLap, 0.25)).toBe(1.0);
    });

    it('should interpolate using hermite interpolation when points are valid', () => {
      const validLap: ReferenceFuel = {
        pointsCount: 3,
        fuelConsumed: new Float32Array([0.0, 1.0, 3.0]),
        pointPos: new Float32Array([0.0, 0.5, 1.0]),
        tangents: new Float32Array([2.0, 2.0, 2.0]), // tangents
        interval: 0.5,
        startFuel: 5.0,
        finishFuel: 2.0, // 3.0 total
        lastTrackedPct: 1.0,
        isCleanLap: true,
      };

      // Exact point lookup
      expect(interpolateFuelAtPoint(validLap, 0.5)).toBe(1.0);

      // Interpolation between key0 (0.0) and key1 (0.5) at targetPct = 0.25
      // h = 0.5, y0 = 0.0, y1 = 1.0, m0 = 2.0 * 0.5 = 1.0, m1 = 2.0 * 0.5 = 1.0
      // t = (0.25 - 0.0) / 0.5 = 0.5
      // hermiteBasis:
      // t2 = 0.25, t3 = 0.125
      // h00 = 2 * 0.125 - 3 * 0.25 + 1 = 0.25 - 0.75 + 1 = 0.5
      // h10 = 0.125 - 2 * 0.25 + 0.5 = 0.125 - 0.5 + 0.5 = 0.125
      // h01 = -2 * 0.125 + 3 * 0.25 = -0.25 + 0.75 = 0.5
      // h11 = 0.125 - 0.25 = -0.125
      // result = h00 * y0 + h10 * m0 + h01 * y1 + h11 * m1
      //        = 0.5 * 0.0 + 0.125 * 1.0 + 0.5 * 1.0 - 0.125 * 1.0
      //        = 0.125 + 0.5 - 0.125 = 0.5
      // Wait, with interval = 0.5, key1 is getBucketIndex(0.75, 3) = 2, so h = 1.0, y1 = 3.0, targetPct = 0.25.
      // t = 0.25, y0 = 0.0, y1 = 3.0, m0 = 2.0, m1 = 2.0
      // Evaluating Hermite Basis yields exactly 0.65625
      const val = interpolateFuelAtPoint(validLap, 0.25);
      expect(val).toBeCloseTo(0.65625, 5);
    });

    it('should handle wrapping around finish line correctly', () => {
      const wrapLap: ReferenceFuel = {
        pointsCount: 3,
        fuelConsumed: new Float32Array([0.0, 1.0, 2.5]),
        pointPos: new Float32Array([0.0, 0.5, 0.9]),
        tangents: new Float32Array([2.0, 2.0, 2.0]),
        interval: 0.5,
        startFuel: 5.0,
        finishFuel: 2.0, // 3.0 total
        lastTrackedPct: 1.0,
        isCleanLap: true,
      };

      // targetPct = 0.95: key0 = 2 (pos = 0.9), key1 = 0.95 + 0.5 = 1.45 (getBucketIndex wraps to key0 = 0, but is clamped to 2 by getBucketIndex)
      // h = p1.trackPct - p0.trackPct = 0.9 - 0.9 = 0 <= 0
      // wraps: h = 1 - 0.9 + 0.9 = 1.0
      // y1 = p1.fuelConsumed + lapFuel = 2.5 + (5.0 - 2.0) = 5.5
      // t = (0.95 - 0.9) / 1.0 = 0.05
      // y0 = 2.5, y1 = 5.5, m0 = 2.0 * 1.0 = 2.0, m1 = 2.0 * 1.0 = 2.0
      // Evaluating Hermite Basis yields exactly 2.60725
      const val = interpolateFuelAtPoint(wrapLap, 0.95);
      expect(val).toBeCloseTo(2.60725, 5);
    });
  });

  describe('calculateTargetConsumption', () => {
    it('returns fuel/laps when given normal values', () => {
      // 20L in the car, 11 laps remaining → target = 20 / 11 ≈ 1.818…
      const result = calculateTargetConsumption(20, 11);
      expect(result).toBeCloseTo(1.818, 3);
    });

    it('rounds to 2 decimal places as 1.82', () => {
      const result = calculateTargetConsumption(20, 11);
      expect(Number(result.toFixed(2))).toBe(1.82);
    });

    it('returns 0 when lapsRemaining is 0 to avoid division by zero', () => {
      expect(calculateTargetConsumption(20, 0)).toBe(0);
    });

    it('returns 0 when lapsRemaining is negative', () => {
      expect(calculateTargetConsumption(20, -5)).toBe(0);
    });

    it('returns 0 when fuelLevel is 0', () => {
      expect(calculateTargetConsumption(0, 11)).toBe(0);
    });

    it('returns exact result for evenly divisible values', () => {
      // 10L / 5 laps = exactly 2.0
      expect(calculateTargetConsumption(10, 5)).toBe(2);
    });
  });

  describe('calculateStopsRemaining', () => {
    it('returns the number of stops required when fuel is insufficient', () => {
      // 20 laps * 3L = 60L needed, 10L in tank, tankSize 30L
      // deficit = 60 - 10 = 50L → ceil(50 / 30) = 2 stops
      expect(calculateStopsRemaining(20, 3, 10, 30)).toBe(2);
    });

    it('returns 1 when exactly one full tank is needed', () => {
      // 10 laps * 3L = 30L needed, 0L in tank, tankSize 30L → ceil(30 / 30) = 1
      expect(calculateStopsRemaining(10, 3, 0, 30)).toBe(1);
    });

    it('returns 0 when there is enough fuel to finish without stopping', () => {
      // 5 laps * 2L = 10L needed, 15L in tank → surplus, no stops needed
      expect(calculateStopsRemaining(5, 2, 15, 30)).toBe(0);
    });

    it('returns 0 when tankSize is 0 to avoid division by zero', () => {
      expect(calculateStopsRemaining(10, 3, 0, 0)).toBe(0);
    });

    it('returns 0 when tankSize is negative', () => {
      expect(calculateStopsRemaining(10, 3, 0, -10)).toBe(0);
    });
  });

  describe('calculateTargetScenarios', () => {
    it('returns three scenarios centred on floor(lapsWithFuel)', () => {
      // 30L, 12.7 laps worth → centre = 12
      const result = calculateTargetScenarios(30, 12.7);
      expect(result).toHaveLength(3);
      expect(result.map((s) => s.laps)).toEqual([11, 12, 13]);
    });

    it('marks only the centre scenario as isCurrentTarget', () => {
      const result = calculateTargetScenarios(30, 12.7);
      expect(result.find((s) => s.isCurrentTarget)?.laps).toBe(12);
      expect(result.filter((s) => !s.isCurrentTarget)).toHaveLength(2);
    });

    it('calculates fuelPerLap as fuelLevel / laps for each scenario', () => {
      const result = calculateTargetScenarios(30, 12.7);
      expect(result[0].fuelPerLap).toBeCloseTo(30 / 11, 5); // -1
      expect(result[1].fuelPerLap).toBeCloseTo(30 / 12, 5); // ideal
      expect(result[2].fuelPerLap).toBeCloseTo(30 / 13, 5); // +1
    });

    it('omits the -1 scenario when centre is 1 (would produce laps = 0)', () => {
      // lapsWithFuel = 1.9 → centre = 1 → -1 scenario would be laps 0, skipped
      const result = calculateTargetScenarios(5, 1.9);
      expect(result).toHaveLength(2);
      expect(result.map((s) => s.laps)).toEqual([1, 2]);
    });

    it('returns empty array when fuelLevel is 0', () => {
      expect(calculateTargetScenarios(0, 10)).toHaveLength(0);
    });

    it('returns empty array when lapsWithFuel is 0 or negative', () => {
      expect(calculateTargetScenarios(30, 0)).toHaveLength(0);
      expect(calculateTargetScenarios(30, -5)).toHaveLength(0);
    });
  });
});

// Helper function to create mock lap data
function mockLap(
  lapNumber: number,
  fuelUsed: number,
  lapTime: number,
  overrides?: Partial<FuelLapData>
): FuelLapData {
  return {
    lapNumber,
    fuelUsed,
    lapTime,
    isGreenFlag: true,
    isValidForCalc: true,
    isOutLap: false,
    timestamp: Date.now(),
    ...overrides,
  };
}
