export function calculateLapsRemainingFromLaps(
  sessionLaps: number,
  completedLaps: number
): number {
  return sessionLaps - completedLaps;
}

export function calculateLapsRemainingFromTime(
  driverPctOnTrack: number,
  timeRemainingSeconds: number,
  averageLapTimeSeconds: number
): number {
  if (averageLapTimeSeconds <= 0 || timeRemainingSeconds <= 0) {
    return 0;
  }

  const timeToCompleteLap = (1 - driverPctOnTrack) * averageLapTimeSeconds;
  const lapsBeforeRounding =
    (timeRemainingSeconds - timeToCompleteLap) / averageLapTimeSeconds + 1;

  return Math.ceil(lapsBeforeRounding);
}

// TODO: Refactor into a referenceLap based time tracking
export function calculateLapsRemainingMultiClass(
  timeRemainingSeconds: number,
  raceLeaderPctOnTrack: number,
  playerPctOnTrack: number,
  avgTimeRaceLeaderSeconds: number,
  avgTimePlayerSeconds: number,
  isGreenFlag: boolean
): number {
  if (avgTimeRaceLeaderSeconds <= 0) {
    return 0;
  }

  const timeToCompleteLapLeader =
    (1 - raceLeaderPctOnTrack) * avgTimeRaceLeaderSeconds;
  const timeRemainingAfterLineCross =
    timeRemainingSeconds - timeToCompleteLapLeader;

  if (timeRemainingAfterLineCross <= 0) {
    return isGreenFlag ? 2 : 1;
  }

  let adjustedTimeRemainingSeconds = timeRemainingSeconds;
  if (avgTimeRaceLeaderSeconds > timeRemainingAfterLineCross) {
    adjustedTimeRemainingSeconds +=
      avgTimeRaceLeaderSeconds - timeRemainingAfterLineCross;
  }

  const leaderLapsRemaining = calculateLapsRemainingFromTime(
    raceLeaderPctOnTrack,
    adjustedTimeRemainingSeconds,
    avgTimeRaceLeaderSeconds
  );

  const timeRequiredForLeader = leaderLapsRemaining * avgTimeRaceLeaderSeconds;

  const playerLapsRemaining = calculateLapsRemainingFromTime(
    playerPctOnTrack,
    timeRequiredForLeader,
    avgTimePlayerSeconds
  );

  return playerLapsRemaining;
}
