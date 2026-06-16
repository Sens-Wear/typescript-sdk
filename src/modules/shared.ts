import type { Characteristic } from "react-native-ble-plx";

import type { ByteInput } from "../binary";

export interface WriteOptions {
  response?: boolean;
  serviceUuid?: string;
  transactionId?: string;
}

export interface NotifyOptions {
  serviceUuid?: string;
  transactionId?: string;
  onError?: (error: unknown) => void;
}

export type NotifyCallback = (sender: Characteristic, data: Uint8Array) => void;

export interface GattClient {
  readGattChar(characteristicUuid: string, serviceUuid?: string, transactionId?: string): Promise<Uint8Array>;
  writeGattChar(characteristicUuid: string, data: ByteInput, options?: WriteOptions): Promise<void>;
  startNotify(characteristicUuid: string, callback: NotifyCallback, options?: NotifyOptions): Promise<void>;
  stopNotify(characteristicUuid: string): Promise<void>;
}

export type MaybePromise<T> = T | Promise<T>;

export function invokeCallback<T>(callback: (value: T) => MaybePromise<void>, value: T): void {
  const result = callback(value);
  if (result instanceof Promise) {
    void result.catch((error) => {
      setTimeout(() => {
        throw error;
      }, 0);
    });
  }
}
