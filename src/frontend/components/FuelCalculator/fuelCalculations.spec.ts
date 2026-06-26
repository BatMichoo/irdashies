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
  formatFuel,
  detectLapCrossing,
  isGreenFlag,
  isWhiteFlag,
  isCheckeredFlag,
  isFinalLap,
  calculateConfidence,
  FLAG_GREEN,
  FLAG_WHITE,
  FLAG_CHECKERED,
  FLAG_YELLOW,
  FLAG_CAUTION,
  FLAG_RED,
} from './fuelCalculations';
import type { FuelLapData } from './types';

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
