export interface LapData {
  number: number;
  timeInSeconds: number;
  startingFuel: number;
  endingFuel: number;
  fuelUsed: number;
  isInLap?: boolean;
  isOutLap?: boolean;
}

export interface StrategyResult {
  name: string;
  fuelConsumption: number;
  lapsRemaining: number;
  refuelRequired: number;
  lapsOfFuelRemaining: number;
  requiresRefueling: boolean;
}
