import { describe, it, expect } from 'vitest';
import {
  calculateAverageConsumption,
  calculateLapsOfFuelRemaining,
  calculateRefuelRequired,
  runFuelStrategy,
} from './strategies';
import {
  calculateLapsRemainingFromLaps,
  calculateLapsRemainingFromTime,
  calculateLapsRemainingMultiClass,
} from './lapCalculations';
import { LapData } from './types';

// Helper to generate seed laps
function generateSeedLaps(
  count: number,
  targetConsumption: number,
  startingFuel = 100
): LapData[] {
  const laps: LapData[] = [];
  let currentFuel = startingFuel;
  for (let i = 0; i < count; i++) {
    laps.push({
      number: i + 1,
      timeInSeconds: 60,
      startingFuel: currentFuel,
      endingFuel: currentFuel - targetConsumption,
      fuelUsed: targetConsumption,
    });
    currentFuel -= targetConsumption;
  }
  return laps;
}

describe('Fuel Strategies', () => {
  describe('calculateAverageConsumption', () => {
    it('should return 0 for no laps', () => {
      expect(calculateAverageConsumption([], 'LAST')).toBe(0);
    });

    it('should return last lap consumption for LAST strategy', () => {
      const laps = generateSeedLaps(3, 5);
      laps[2].fuelUsed = 4.5;
      expect(calculateAverageConsumption(laps, 'LAST')).toBe(4.5);
    });

    it('should fall back to last lap for 5L strategy if laps <= 5', () => {
      const laps = generateSeedLaps(3, 5);
      laps[2].fuelUsed = 4.5;
      expect(calculateAverageConsumption(laps, '5L')).toBe(4.5);
    });

    it('should average last 5 laps for 5L strategy if laps > 5', () => {
      const laps = generateSeedLaps(7, 0);
      laps[0].fuelUsed = 10.0;
      laps[1].fuelUsed = 5.0; // last 5 starts here
      laps[2].fuelUsed = 4.0;
      laps[3].fuelUsed = 6.0;
      laps[4].fuelUsed = 7.0;
      laps[5].fuelUsed = 5.0;
      laps[6].fuelUsed = 8.0;
      // Last 5: 4 + 6 + 7 + 5 + 8 = 30. Avg = 6.0
      expect(calculateAverageConsumption(laps, '5L')).toBe(6.0);
    });

    it('should fall back to last lap for FULL strategy if laps <= 1', () => {
      const laps = generateSeedLaps(1, 4.5);
      expect(calculateAverageConsumption(laps, 'FULL')).toBe(4.5);
    });

    it('should skip first lap and average rest for FULL strategy if laps > 1', () => {
      const laps = generateSeedLaps(4, 0);
      laps[0].fuelUsed = 10.0; // Skipped
      laps[1].fuelUsed = 5.0;
      laps[2].fuelUsed = 4.0;
      laps[3].fuelUsed = 6.0;
      // Avg: (5 + 4 + 6) / 3 = 5.0
      expect(calculateAverageConsumption(laps, 'FULL')).toBe(5.0);
    });
  });

  describe('calculateLapsOfFuelRemaining', () => {
    it('should compute correct laps remaining', () => {
      // (50 - 1.0) / 5 = 9.8
      expect(calculateLapsOfFuelRemaining(50, 5, 1.0)).toBe(9.8);
    });

    it('should return 0 for zero consumption', () => {
      expect(calculateLapsOfFuelRemaining(50, 0, 1.0)).toBe(0);
    });
  });

  describe('calculateRefuelRequired', () => {
    it('should return 0 when no laps remaining', () => {
      expect(calculateRefuelRequired(50, 0, 5, 1.0)).toBe(0);
    });

    it('should return 0 when consumption is 0', () => {
      expect(calculateRefuelRequired(50, 5, 0, 1.0)).toBe(0);
    });

    it('should require refuel when current fuel is insufficient', () => {
      // current = 10, remaining laps = 5, consumption = 5.
      // fuelRequired = 25. fuelAtEnd = 10 - 25 = -15.
      // -15 < cutoff (1.0). refuelRequired = 1.0 - (-15) = 16.
      expect(calculateRefuelRequired(10, 5, 5, 1.0)).toBe(16);
    });

    it('should return negative refuel when current fuel is sufficient', () => {
      // current = 30, remaining laps = 5, consumption = 5.
      // fuelRequired = 25. fuelAtEnd = 30 - 25 = 5.
      // 5 >= cutoff (1.0). refuelRequired = 25 - 30 = -5.
      expect(calculateRefuelRequired(30, 5, 5, 1.0)).toBe(-5);
    });

    it('should apply cutoff when fuel at end is positive but below cutoff', () => {
      // current = 20.5, remaining laps = 4, consumption = 5.
      // fuelRequired = 20. fuelAtEnd = 20.5 - 20 = 0.5.
      // 0.5 < cutoff (1.0). refuelRequired = 1.0 - 0.5 = 0.5.
      expect(calculateRefuelRequired(20.5, 4, 5, 1.0)).toBe(0.5);
    });
  });

  describe('runFuelStrategy', () => {
    it('should calculate complete strategy output', () => {
      const laps = generateSeedLaps(7, 0);
      laps[0].fuelUsed = 10.0;
      laps[1].fuelUsed = 5.0;
      laps[2].fuelUsed = 4.0;
      laps[3].fuelUsed = 6.0;
      laps[4].fuelUsed = 7.0;
      laps[5].fuelUsed = 5.0;
      laps[6].fuelUsed = 8.0;
      laps[6].endingFuel = 55; // current fuel level is endingFuel of last lap

      const res = runFuelStrategy('5L_Strategy', laps, 10, 55, '5L', 1.0);
      expect(res.name).toBe('5L_Strategy');
      expect(res.fuelConsumption).toBe(6.0);
      // current = 55, req = 10 * 6 = 60. atEnd = -5 < 1.0. refuel = 1.0 - (-5) = 6.0.
      expect(res.refuelRequired).toBe(6.0);
      // (55 - 1.0) / 6.0 = 9.0
      expect(res.lapsOfFuelRemaining).toBeCloseTo(9.0, 5);
      expect(res.requiresRefueling).toBe(true);
    });
  });
});

describe('Lap Calculations', () => {
  describe('calculateLapsRemainingFromLaps', () => {
    it('should return correct lap subtraction', () => {
      expect(calculateLapsRemainingFromLaps(10, 3)).toBe(7);
      expect(calculateLapsRemainingFromLaps(5, 5)).toBe(0);
      expect(calculateLapsRemainingFromLaps(10, 11)).toBe(-1);
    });
  });

  describe('calculateLapsRemainingFromTime', () => {
    it('should handle zero or negative times', () => {
      expect(calculateLapsRemainingFromTime(0.5, 0, 60)).toBe(0);
      expect(calculateLapsRemainingFromTime(0.5, -10, 60)).toBe(0);
      expect(calculateLapsRemainingFromTime(0.5, 120, 0)).toBe(0);
      expect(calculateLapsRemainingFromTime(0.5, 120, -60)).toBe(0);
    });

    it('should return correct estimation for halfway around track', () => {
      // 2 minutes left, 60s lap, pct = 0.5.
      // timeToCompleteLap = 0.5 * 60 = 30.
      // (120 - 30) / 60 + 1 = 2.5 -> ceil(2.5) = 3
      expect(calculateLapsRemainingFromTime(0.5, 120, 60)).toBe(3);
    });

    it('should return correct estimation for start finish line', () => {
      // 2 minutes left, 60s lap, pct = 0.
      // timeToComplete = 60.
      // (120 - 60) / 60 + 1 = 2.0 -> ceil(2) = 2
      expect(calculateLapsRemainingFromTime(0.0, 120, 60)).toBe(2);
    });

    it('should return 1 when current lap finishes just after timer ends', () => {
      // 59s left, 60s lap, pct = 0.
      // timeToComplete = 60.
      // (59 - 60) / 60 + 1 = 0.983 -> ceil = 1
      expect(calculateLapsRemainingFromTime(0.0, 59, 60)).toBe(1);
    });
  });

  describe('calculateLapsRemainingMultiClass', () => {
    it('should return 0 if leader average lap time <= 0', () => {
      expect(calculateLapsRemainingMultiClass(300, 0.5, 0.5, 0, 60, true)).toBe(
        0
      );
    });

    it('should handle end time condition when time expires before leader finishes current lap', () => {
      // timeLeft = 20s. Leader: 60s lap, 0.5 pct (30s to finish).
      // timeRemainingAfterLineCross = 20s - 30s = -10s.
      // Under Green Flag -> returns 2.
      // Under Caution/Checkered -> returns 1.
      expect(calculateLapsRemainingMultiClass(20, 0.5, 0.5, 60, 60, true)).toBe(
        2
      );
      expect(
        calculateLapsRemainingMultiClass(20, 0.5, 0.5, 60, 60, false)
      ).toBe(1);
    });

    it('should adjust time for next full lap if time runs out on next lap', () => {
      // Leader: 60s lap, 0.0 pct. Time left: 110s.
      // timeToComplete = 60s. timeRemainingAfterLineCross = 110 - 60 = 50s.
      // Since 60s > 50s, time gets adjusted to: 110 + (60 - 50) = 120s.
      // leaderLaps = remainingTime(0.0, 120, 60) = 2
      // timeRequired = 2 * 60 = 120s
      // playerLaps = remainingTime(0.0, 120, 60) = 2
      expect(
        calculateLapsRemainingMultiClass(110, 0.0, 0.0, 60, 60, true)
      ).toBe(2);
    });

    it('should compute player slow pace correctly', () => {
      // Time left: 120s. Leader: 60s lap, 0.0 pct. Player: 90s lap, 0.0 pct.
      // Leader laps = 2. timeRequired = 120s.
      // Player laps = remainingTime(0.0, 120, 90) = (120 - 90)/90 + 1 = 1.33 -> ceil = 2.
      expect(
        calculateLapsRemainingMultiClass(120, 0.0, 0.0, 60, 90, true)
      ).toBe(2);
    });

    it('should compute multi-class remaining laps correctly (subsession case)', () => {
      // C# Test case: MultiClass_Subsession_80560308_ShouldReturn_11Laps
      // timeLeft = 25 minutes = 1500s.
      // avgLeader = 128.241s. pctLeader = 0.0.
      // avgPlayer = 140.896s. pctPlayer = -0.1.
      // Expected: 11.
      expect(
        calculateLapsRemainingMultiClass(
          1500,
          0.0,
          -0.1,
          128.241,
          140.896,
          true
        )
      ).toBe(11);
    });
  });
});
