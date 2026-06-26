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
  const { initialize, completeSession, collectBulkData } =
    useReferenceFuelStore.getState();

  const sessionRef = useRef({
    seriesId: -1,
    trackId: -1,
    trackLength: -1,
    sessionNum: -1,
    subSessionId: -1,
    drivers: [] as Driver[],
    paceCarIdx: -1,
  });

  useEffect(() => {
    const unsubSession = useSessionStore.subscribe((state) => {
      const session = state.session;
      if (!session) return;

      const seriesId = session.WeekendInfo.SeriesID;
      const trackId = session.WeekendInfo.TrackID;

      if (!seriesId || seriesId <= 0 || !trackId || trackId <= 0) return;

      const subSessionId = session.WeekendInfo.SubSessionID;
      const paceCarIdx = session.DriverInfo.PaceCarIdx;
      const drivers = session.DriverInfo.Drivers || [];

      const lengthStr = session.WeekendInfo.TrackLength;
      const [val, unit] = lengthStr?.split(' ') ?? [];
      const trackLength =
        unit === 'km' ? parseFloat(val) * 1000 : parseFloat(val);

      const s = sessionRef.current;

      if (
        seriesId !== s.seriesId ||
        trackId !== s.trackId ||
        subSessionId !== s.subSessionId ||
        trackLength !== s.trackLength
      ) {
        logger.info('[RefFuelStore] Session changed, initializing...');
        completeSession();

        const classList = getClassList(drivers, paceCarIdx);
        initialize(bridge, seriesId, trackId, trackLength, classList);

        Object.assign(s, {
          seriesId,
          trackId,
          subSessionId,
          trackLength,
          drivers,
          paceCarIdx,
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
        completeSession();

        const classList = getClassList(s.drivers, s.paceCarIdx);

        initialize(bridge, s.seriesId, s.trackId, s.trackLength, classList);
        s.sessionNum = sessionNum;
      }

      const dists = telemetry.CarIdxLapDistPct?.value || ([] as number[]);
      const pits = telemetry.CarIdxOnPitRoad?.value || ([] as boolean[]);
      const playerFuelLevel = telemetry.FuelLevel?.value?.[0] ?? 0;
      const playerCarIdx = telemetry.PlayerCarIdx?.value?.[0] ?? -1;

      if (
        dists.length > 0 &&
        pits.length > 0 &&
        playerCarIdx > -1 &&
        s.drivers.length > 0
      ) {
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
      unsubSession();
      unsubTelemetry();
    };
  }, [bridge, completeSession, initialize, collectBulkData]);
};
