import { useEffect, useRef } from 'react';
import { useTelemetryStore } from '../TelemetryStore/TelemetryStore';
import { useReferenceFuelStore } from './ReferenceFuelStore';
import { useSessionStore } from '../SessionStore/SessionStore';
import { Driver, ReferenceFuelBridge } from '@irdashies/types';
import logger from '@irdashies/utils/logger';

function getClassList(drivers: Driver[], paceCarIdx: number): number[] {
  const paceCarClassId = drivers[paceCarIdx]?.CarClassID ?? -1;
  const classList = Array.from(new Set(drivers.map((d) => d.CarClassID)))
    .filter((id) => id !== paceCarClassId && id > 0)
    .sort((a, b) => a - b);

  return classList;
}

export const useReferenceFuelStoreUpdater = (bridge: ReferenceFuelBridge) => {
  const { initialize, completeSession, collectBulkData, saveAverageLap } =
    useReferenceFuelStore.getState();

  const sessionRef = useRef({
    seriesId: -1,
    trackId: -1,
    trackLength: -1,
    sessionNum: -1,
    subSessionId: -1,
    drivers: [] as Driver[],
    paceCarIdx: -1,
    playerCarIdx: -1,
    tankSize: -1,
  });

  useEffect(() => {
    const currentSession = sessionRef.current;

    const unsubSession = useSessionStore.subscribe((state) => {
      const session = state.session;
      const s = sessionRef.current;

      if (!session) {
        if (
          s.seriesId !== -1 &&
          s.playerCarIdx !== -1 &&
          s.drivers[s.playerCarIdx]
        ) {
          logger.info(
            '[RefFuelStore] Session ended (session is null), saving average lap...'
          );
          const player = s.drivers[s.playerCarIdx];
          const playerClassId = player?.CarClassID ?? -1;
          saveAverageLap(bridge, s.seriesId, playerClassId);
        }
        completeSession();
        Object.assign(s, {
          seriesId: -1,
          trackId: -1,
          trackLength: -1,
          sessionNum: -1,
          subSessionId: -1,
          drivers: [] as Driver[],
          paceCarIdx: -1,
          playerCarIdx: -1,
          tankSize: -1,
        });
        return;
      }

      const seriesId = session.WeekendInfo.SeriesID;
      const trackId = session.WeekendInfo.TrackID;

      if (!seriesId || seriesId <= 0 || !trackId || trackId <= 0) return;

      const subSessionId = session.WeekendInfo.SubSessionID;
      const paceCarIdx = session.DriverInfo.PaceCarIdx;
      const drivers = session.DriverInfo.Drivers || [];
      const playerCarIdx = session.DriverInfo.DriverCarIdx;
      const tankSizeMax = session.DriverInfo.DriverCarFuelMaxLtr;
      const tankPct = session.DriverInfo.DriverCarMaxFuelPct;
      const tankSize = tankSizeMax * tankPct;

      const lengthStr = session.WeekendInfo.TrackLength;
      const [val, unit] = lengthStr?.split(' ') ?? [];
      const trackLength =
        unit === 'km' ? parseFloat(val) * 1000 : parseFloat(val);

      if (
        seriesId !== s.seriesId ||
        trackId !== s.trackId ||
        subSessionId !== s.subSessionId ||
        trackLength !== s.trackLength
      ) {
        logger.info('[RefFuelStore] Session changed, initializing...');
        if (
          s.seriesId !== -1 &&
          s.playerCarIdx !== -1 &&
          s.drivers[s.playerCarIdx]
        ) {
          const player = s.drivers[s.playerCarIdx];
          const playerClassId = player?.CarClassID ?? -1;
          saveAverageLap(bridge, s.seriesId, playerClassId);
        }
        completeSession();

        const classList = getClassList(drivers, paceCarIdx);
        const player = drivers[playerCarIdx];
        const playerClassId = player?.CarClassID ?? -1;
        initialize(
          bridge,
          seriesId,
          trackId,
          trackLength,
          classList,
          playerClassId,
          tankSize
        );

        Object.assign(s, {
          seriesId,
          trackId,
          subSessionId,
          trackLength,
          drivers,
          paceCarIdx,
          playerCarIdx,
          tankSize,
        });
      } else {
        s.drivers = drivers;
        s.paceCarIdx = paceCarIdx;
      }
    });

    const unsubTelemetry = useTelemetryStore.subscribe((state) => {
      const telemetry = state.telemetry;
      if (!telemetry) return;

      const sessionNum = telemetry.SessionNum?.value?.[0] ?? -1;
      const s = sessionRef.current;

      if (sessionNum !== s.sessionNum && s.seriesId !== -1) {
        logger.info(
          `[RefFuelStore] SessionNum changed to ${sessionNum}, resetting...`
        );
        if (s.playerCarIdx !== -1 && s.drivers[s.playerCarIdx]) {
          const player = s.drivers[s.playerCarIdx];
          const playerClassId = player?.CarClassID ?? -1;
          saveAverageLap(bridge, s.seriesId, playerClassId);
        }
        completeSession();

        const classList = getClassList(s.drivers, s.paceCarIdx);
        const player = s.drivers[s.playerCarIdx];
        const playerClassId = player?.CarClassID ?? -1;

        initialize(
          bridge,
          s.seriesId,
          s.trackId,
          s.trackLength,
          classList,
          playerClassId,
          s.tankSize
        );
        s.sessionNum = sessionNum;
      }

      const dists = telemetry.CarIdxLapDistPct?.value || ([] as number[]);
      const pits = telemetry.CarIdxOnPitRoad?.value || ([] as boolean[]);
      const rawFuelLevel = telemetry.FuelLevel?.value?.[0];
      const playerFuelLevel =
        rawFuelLevel !== undefined ? parseFloat(rawFuelLevel.toFixed(5)) : 0;
      if (
        dists.length > 0 &&
        pits.length > 0 &&
        s.playerCarIdx >= 0 &&
        s.drivers.length > 0
      ) {
        const playerCarIdx = s.playerCarIdx;
        const player = s.drivers[playerCarIdx];
        const playerClassId = player?.CarClassID ?? 0;
        const playerLapDistPct = dists[playerCarIdx];
        const playerOnPitRoad = pits[playerCarIdx];

        if (playerLapDistPct !== undefined && playerOnPitRoad !== undefined) {
          collectBulkData(
            bridge,
            s.seriesId,
            playerCarIdx,
            playerClassId,
            playerLapDistPct,
            playerOnPitRoad,
            playerFuelLevel
          );
        }
      }
    });

    return () => {
      const s = currentSession;
      if (
        s.seriesId !== -1 &&
        s.playerCarIdx !== -1 &&
        s.drivers[s.playerCarIdx]
      ) {
        const player = s.drivers[s.playerCarIdx];
        const playerClassId = player?.CarClassID ?? -1;
        saveAverageLap(bridge, s.seriesId, playerClassId);
      }
      unsubSession();
      unsubTelemetry();
    };
  }, [bridge, completeSession, initialize, collectBulkData, saveAverageLap]);
};
