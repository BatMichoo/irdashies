import { ReferenceFuelBridge } from '@irdashies/types';
import { useReferenceFuelStoreUpdater } from './ReferenceFuelStoreUpdater';

export interface ReferenceFuelStoreProviderProps {
  bridge: ReferenceFuelBridge;
}

/**
 * Provider that monitors telemetry to maintain reference fuel data.
 * Should be mounted once at the app level.
 */
export const ReferenceFuelStoreProvider = ({
  bridge,
}: ReferenceFuelStoreProviderProps) => {
  useReferenceFuelStoreUpdater(bridge);
  return null;
};
