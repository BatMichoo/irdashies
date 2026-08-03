/**
 * Data for a single lap's fuel consumption
 */
export interface FuelLapData {
  /** Lap number */
  lapNumber: number;
  /** Fuel consumed during this lap (liters) */
  fuelUsed: number;
  /** Lap time in seconds */
  lapTime: number;
  /** Whether this lap was under green flag conditions */
  isGreenFlag: boolean;
  /** Whether this lap is valid for calculations (outlier filtering) */
  isValidForCalc: boolean;
  /** Whether the car started this lap from pit road (out-lap) */
  isOutLap: boolean;
  /** Whether the car entered pit road during this lap (in-lap) */
  isInLap?: boolean;
  /** Whether the car was towed during this lap */
  wasTowed?: boolean;
  /** Whether this lap is from a previous session (historical) */
  isHistorical?: boolean;
  /** Timestamp when lap was completed */
  timestamp: number;
  /** Session number the lap was completed in */
  sessionNum?: number;
}
