/** Which physical camera we are asking the browser for. */
export type CameraFacing = 'user' | 'environment';

export type CameraErrorKind =
  | 'denied'
  | 'not-found'
  | 'in-use'
  | 'insecure-context'
  | 'unsupported'
  | 'unknown';

export interface CameraError {
  kind: CameraErrorKind;
  /** Copy that is safe to show a human. */
  message: string;
  cause?: unknown;
}

export interface CameraDeviceInfo {
  deviceId: string;
  label: string;
  facing: CameraFacing | 'unknown';
}

export interface CameraStartOptions {
  facing: CameraFacing;
  deviceId?: string;
  /** Ideal capture size. The browser is free to hand back something else. */
  width?: number;
  height?: number;
}

export interface CameraStatus {
  active: boolean;
  facing: CameraFacing;
  /** True when the active track is a front camera and therefore should be mirrored. */
  mirrored: boolean;
  width: number;
  height: number;
  devices: CameraDeviceInfo[];
  error: CameraError | null;
}
