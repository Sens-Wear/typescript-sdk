import { assertLength, bytesFrom, dataView, readInt16LE, readUint16LE } from "../binary";
import { IMU_LINEAR_ACCELERATION_UUID, IMU_QUATERNION_UUID } from "../uuids";
import type { GattClient, MaybePromise } from "./shared";
import { invokeCallback } from "./shared";

export const QUATERNION_LENGTH = 10;
export const LINEAR_ACCELERATION_LENGTH = 6;
export const QUATERNION_SCALE = 16384.0;
export const ACCELERATION_SCALE_G = 4096.0;

export interface QuaternionRawDict {
  x: number;
  y: number;
  z: number;
  w: number;
  accuracy: number;
}

export interface QuaternionNormalizedDict {
  x: number;
  y: number;
  z: number;
  w: number;
  accuracy_radians: number;
  accuracy_degrees: number;
}

export interface LinearAccelerationRawDict {
  x: number;
  y: number;
  z: number;
}

export interface LinearAccelerationScaledDict {
  x_g: number;
  y_g: number;
  z_g: number;
}

export class QuaternionSample {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly z: number,
    readonly w: number,
    readonly accuracy: number,
  ) {}

  static fromBytes(payload: Uint8Array | ArrayBuffer | ArrayBufferView | readonly number[]): QuaternionSample {
    const bytes = bytesFrom(payload);
    assertLength(bytes, QUATERNION_LENGTH, "Quaternion");
    const view = dataView(bytes);
    return new QuaternionSample(
      readInt16LE(view, 0),
      readInt16LE(view, 2),
      readInt16LE(view, 4),
      readInt16LE(view, 6),
      readUint16LE(view, 8),
    );
  }

  static from_bytes(payload: Uint8Array | ArrayBuffer | ArrayBufferView | readonly number[]): QuaternionSample {
    return QuaternionSample.fromBytes(payload);
  }

  get xFloat(): number {
    return this.x / QUATERNION_SCALE;
  }

  get yFloat(): number {
    return this.y / QUATERNION_SCALE;
  }

  get zFloat(): number {
    return this.z / QUATERNION_SCALE;
  }

  get wFloat(): number {
    return this.w / QUATERNION_SCALE;
  }

  get accuracyRadians(): number {
    return this.accuracy / QUATERNION_SCALE;
  }

  get accuracyDegrees(): number {
    return (this.accuracyRadians * 180.0) / Math.PI;
  }

  get x_float(): number {
    return this.xFloat;
  }

  get y_float(): number {
    return this.yFloat;
  }

  get z_float(): number {
    return this.zFloat;
  }

  get w_float(): number {
    return this.wFloat;
  }

  get accuracy_radians(): number {
    return this.accuracyRadians;
  }

  get accuracy_degrees(): number {
    return this.accuracyDegrees;
  }

  toTuple(options: { normalized?: boolean } = {}): [number, number, number, number] {
    if (options.normalized ?? true) {
      return [this.xFloat, this.yFloat, this.zFloat, this.wFloat];
    }
    return [this.x, this.y, this.z, this.w];
  }

  to_tuple(options: { normalized?: boolean } = {}): [number, number, number, number] {
    return this.toTuple(options);
  }

  toDict(options: { normalized: true }): QuaternionNormalizedDict;
  toDict(options?: { normalized?: false }): QuaternionRawDict;
  toDict(options: { normalized?: boolean } = {}): QuaternionRawDict | QuaternionNormalizedDict {
    if (options.normalized) {
      return {
        x: this.xFloat,
        y: this.yFloat,
        z: this.zFloat,
        w: this.wFloat,
        accuracy_radians: this.accuracyRadians,
        accuracy_degrees: this.accuracyDegrees,
      };
    }
    return {
      x: this.x,
      y: this.y,
      z: this.z,
      w: this.w,
      accuracy: this.accuracy,
    };
  }

  to_dict(options: { normalized: true }): QuaternionNormalizedDict;
  to_dict(options?: { normalized?: false }): QuaternionRawDict;
  to_dict(options: { normalized?: boolean } = {}): QuaternionRawDict | QuaternionNormalizedDict {
    return this.toDict(options as { normalized?: false });
  }
}

export class LinearAccelerationSample {
  constructor(readonly x: number, readonly y: number, readonly z: number) {}

  static fromBytes(payload: Uint8Array | ArrayBuffer | ArrayBufferView | readonly number[]): LinearAccelerationSample {
    const bytes = bytesFrom(payload);
    assertLength(bytes, LINEAR_ACCELERATION_LENGTH, "Linear acceleration");
    const view = dataView(bytes);
    return new LinearAccelerationSample(readInt16LE(view, 0), readInt16LE(view, 2), readInt16LE(view, 4));
  }

  static from_bytes(payload: Uint8Array | ArrayBuffer | ArrayBufferView | readonly number[]): LinearAccelerationSample {
    return LinearAccelerationSample.fromBytes(payload);
  }

  get xG(): number {
    return this.x / ACCELERATION_SCALE_G;
  }

  get yG(): number {
    return this.y / ACCELERATION_SCALE_G;
  }

  get zG(): number {
    return this.z / ACCELERATION_SCALE_G;
  }

  get x_g(): number {
    return this.xG;
  }

  get y_g(): number {
    return this.yG;
  }

  get z_g(): number {
    return this.zG;
  }

  toTuple(options: { scaled?: boolean } = {}): [number, number, number] {
    if (options.scaled ?? true) {
      return [this.xG, this.yG, this.zG];
    }
    return [this.x, this.y, this.z];
  }

  to_tuple(options: { scaled?: boolean } = {}): [number, number, number] {
    return this.toTuple(options);
  }

  toDict(options: { scaled: true }): LinearAccelerationScaledDict;
  toDict(options?: { scaled?: false }): LinearAccelerationRawDict;
  toDict(options: { scaled?: boolean } = {}): LinearAccelerationRawDict | LinearAccelerationScaledDict {
    if (options.scaled) {
      return {
        x_g: this.xG,
        y_g: this.yG,
        z_g: this.zG,
      };
    }
    return {
      x: this.x,
      y: this.y,
      z: this.z,
    };
  }

  to_dict(options: { scaled: true }): LinearAccelerationScaledDict;
  to_dict(options?: { scaled?: false }): LinearAccelerationRawDict;
  to_dict(options: { scaled?: boolean } = {}): LinearAccelerationRawDict | LinearAccelerationScaledDict {
    return this.toDict(options as { scaled?: false });
  }
}

export type QuaternionCallback = (sample: QuaternionSample) => MaybePromise<void>;
export type LinearAccelerationCallback = (sample: LinearAccelerationSample) => MaybePromise<void>;

export class ImuModule {
  readonly quaternionUuid = IMU_QUATERNION_UUID;
  readonly linearAccelerationUuid = IMU_LINEAR_ACCELERATION_UUID;

  constructor(private readonly client: GattClient) {}

  async subscribeQuaternion(callback: QuaternionCallback): Promise<void> {
    await this.unsubscribeQuaternion();
    await this.client.startNotify(this.quaternionUuid, (_sender, data) => {
      invokeCallback(callback, QuaternionSample.fromBytes(data));
    });
  }

  async subscribe_quaternion(callback: QuaternionCallback): Promise<void> {
    await this.subscribeQuaternion(callback);
  }

  async unsubscribeQuaternion(): Promise<void> {
    await this.client.stopNotify(this.quaternionUuid);
  }

  async unsubscribe_quaternion(): Promise<void> {
    await this.unsubscribeQuaternion();
  }

  async subscribeLinearAcceleration(callback: LinearAccelerationCallback): Promise<void> {
    await this.unsubscribeLinearAcceleration();
    await this.client.startNotify(this.linearAccelerationUuid, (_sender, data) => {
      invokeCallback(callback, LinearAccelerationSample.fromBytes(data));
    });
  }

  async subscribe_linear_acceleration(callback: LinearAccelerationCallback): Promise<void> {
    await this.subscribeLinearAcceleration(callback);
  }

  async unsubscribeLinearAcceleration(): Promise<void> {
    await this.client.stopNotify(this.linearAccelerationUuid);
  }

  async unsubscribe_linear_acceleration(): Promise<void> {
    await this.unsubscribeLinearAcceleration();
  }

  async unsubscribeAll(): Promise<void> {
    await this.unsubscribeQuaternion();
    await this.unsubscribeLinearAcceleration();
  }

  async unsubscribe_all(): Promise<void> {
    await this.unsubscribeAll();
  }
}
