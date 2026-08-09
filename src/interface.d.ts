import type {
  DashboardBridge,
  IrSdkBridge,
  PitLaneBridge,
  LogBridge,
  KeybindingsBridge,
  GamepadHostBridge,
  ChromiumFlagsBridge,
  ReferenceFuelBridge,
  TelemetryInspectorBridge,
  RendererPerfBridge,
} from '@irdashies/types';
import type { ChannelBridge } from '@irdashies/types';

declare global {
  interface Window {
    channelBridge: ChannelBridge;
    irsdkBridge: IrSdkBridge;
    telemetryInspectorBridge: TelemetryInspectorBridge;
    dashboardBridge: DashboardBridge;
    pitLaneBridge: PitLaneBridge;
    referenceFuelBridge: ReferenceFuelBridge;
    logBridge: LogBridge;
    keybindingsBridge: KeybindingsBridge;
    /** Present only in the hidden WebHID host renderer (src/hidHost.ts). */
    gamepadHost?: GamepadHostBridge;
    chromiumFlagsBridge: ChromiumFlagsBridge;
    rendererPerfBridge?: RendererPerfBridge;
  }
}
