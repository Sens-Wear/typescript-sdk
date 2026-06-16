import { BleManager } from "react-native-ble-plx";
import type { Characteristic, ConnectionOptions, Device, ScanOptions, Subscription } from "react-native-ble-plx";

import { base64ToBytes, bytesToBase64, type ByteInput } from "./binary";
import { DeviceNotFoundError, NotConnectedError, ProtocolError } from "./errors";
import { BatteryGaugeModule } from "./modules/battery";
import { ChargerModule } from "./modules/charger";
import { HapticModule } from "./modules/haptic";
import { ImuModule } from "./modules/imu";
import { LedModule } from "./modules/led";
import type { NotifyCallback, NotifyOptions, WriteOptions } from "./modules/shared";
import { TemperatureModule } from "./modules/temperature";
import { serviceUuidForCharacteristic } from "./uuids";

export const DEFAULT_NAME_PREFIXES = ["Sens Wear", "SensWear", "SenseWear"] as const;

export interface DiscoveredDevice {
  id: string;
  address: string;
  name: string | null;
  rssi: number | null;
}

export interface SenswearDiscoveryOptions {
  manager?: BleManager;
  timeoutMs?: number;
  namePrefixes?: readonly string[];
  scanServiceUUIDs?: string[] | null;
  scanOptions?: ScanOptions | null;
  waitForPoweredOn?: boolean;
}

export interface SenswearClientOptions extends SenswearDiscoveryOptions {
  connectionOptions?: ConnectionOptions;
  onNotificationError?: (error: unknown, characteristicUuid: string) => void;
}

interface ScanForDeviceOptions extends Required<Pick<SenswearDiscoveryOptions, "timeoutMs" | "namePrefixes">> {
  manager: BleManager;
  target?: string;
  scanServiceUUIDs: string[] | null;
  scanOptions: ScanOptions | null;
}

export class SenswearClient {
  readonly manager: BleManager;
  readonly timeoutMs: number;
  readonly namePrefixes: readonly string[];
  readonly battery: BatteryGaugeModule;
  readonly charger: ChargerModule;
  readonly haptic: HapticModule;
  readonly imu: ImuModule;
  readonly led: LedModule;
  readonly temperature: TemperatureModule;

  private readonly ownsManager: boolean;
  private readonly scanServiceUUIDs: string[] | null;
  private readonly scanOptions: ScanOptions | null;
  private readonly connectionOptions?: ConnectionOptions;
  private readonly waitForPoweredOnBeforeUse: boolean;
  private readonly onNotificationError?: (error: unknown, characteristicUuid: string) => void;
  private connectedDevice: Device | null = null;
  private readonly subscriptions = new Map<string, Subscription>();

  constructor(readonly addressOrName: string | null = null, options: SenswearClientOptions = {}) {
    this.manager = options.manager ?? new BleManager();
    this.ownsManager = options.manager === undefined;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.namePrefixes = options.namePrefixes ?? DEFAULT_NAME_PREFIXES;
    this.scanServiceUUIDs = options.scanServiceUUIDs ?? null;
    this.scanOptions = options.scanOptions ?? null;
    this.connectionOptions = options.connectionOptions;
    this.waitForPoweredOnBeforeUse = options.waitForPoweredOn ?? true;
    this.onNotificationError = options.onNotificationError;
    this.battery = new BatteryGaugeModule(this);
    this.charger = new ChargerModule(this);
    this.haptic = new HapticModule(this);
    this.imu = new ImuModule(this);
    this.led = new LedModule(this);
    this.temperature = new TemperatureModule(this);
  }

  static async discover(options: SenswearDiscoveryOptions = {}): Promise<DiscoveredDevice[]> {
    const manager = options.manager ?? new BleManager();
    const ownsManager = options.manager === undefined;
    const timeoutMs = options.timeoutMs ?? 5_000;
    const namePrefixes = options.namePrefixes ?? DEFAULT_NAME_PREFIXES;

    try {
      if (options.waitForPoweredOn ?? true) {
        await waitForPoweredOn(manager, timeoutMs);
      }
      const devices = await collectDevices({
        manager,
        timeoutMs,
        namePrefixes,
        scanServiceUUIDs: options.scanServiceUUIDs ?? null,
        scanOptions: options.scanOptions ?? null,
      });
      return devices.map(toDiscoveredDevice);
    } finally {
      if (ownsManager) {
        manager.destroy();
      }
    }
  }

  get deviceId(): string | null {
    return this.connectedDevice?.id ?? null;
  }

  get address(): string | null {
    return this.deviceId;
  }

  async isConnected(): Promise<boolean> {
    if (this.connectedDevice === null) {
      return false;
    }
    return this.manager.isDeviceConnected(this.connectedDevice.id);
  }

  async connect(): Promise<this> {
    if (await this.isConnected()) {
      return this;
    }
    if (this.waitForPoweredOnBeforeUse) {
      await waitForPoweredOn(this.manager, this.timeoutMs);
    }

    const connectionOptions = {
      timeout: this.timeoutMs,
      ...this.connectionOptions,
    };
    const target = this.addressOrName?.trim();
    const device = target !== undefined && looksLikeBleIdentifier(target)
      ? await this.manager.connectToDevice(target, connectionOptions)
      : await this.resolveAndConnect(connectionOptions);

    this.connectedDevice = await device.discoverAllServicesAndCharacteristics();
    return this;
  }

  async disconnect(): Promise<void> {
    await this.stopAllNotifications();
    const device = this.connectedDevice;
    this.connectedDevice = null;

    if (device !== null) {
      try {
        if (await this.manager.isDeviceConnected(device.id)) {
          await this.manager.cancelDeviceConnection(device.id);
        }
      } catch {
        // The native stack may already consider the device gone.
      }
    }
  }

  async destroy(): Promise<void> {
    await this.disconnect();
    if (this.ownsManager) {
      this.manager.destroy();
    }
  }

  async readGattChar(characteristicUuid: string, serviceUuid?: string, transactionId?: string): Promise<Uint8Array> {
    const device = this.requireDevice();
    const characteristic = await device.readCharacteristicForService(
      serviceUuid ?? serviceUuidForCharacteristic(characteristicUuid),
      characteristicUuid,
      transactionId,
    );
    return bytesFromCharacteristic(characteristic, characteristicUuid);
  }

  async writeGattChar(characteristicUuid: string, data: ByteInput, options: WriteOptions = {}): Promise<void> {
    const device = this.requireDevice();
    const serviceUuid = options.serviceUuid ?? serviceUuidForCharacteristic(characteristicUuid);
    const value = bytesToBase64(data);

    if (options.response ?? true) {
      await device.writeCharacteristicWithResponseForService(
        serviceUuid,
        characteristicUuid,
        value,
        options.transactionId,
      );
      return;
    }

    await device.writeCharacteristicWithoutResponseForService(
      serviceUuid,
      characteristicUuid,
      value,
      options.transactionId,
    );
  }

  async startNotify(characteristicUuid: string, callback: NotifyCallback, options: NotifyOptions = {}): Promise<void> {
    const device = this.requireDevice();
    const key = normalizeUuid(characteristicUuid);
    await this.stopNotify(characteristicUuid);

    const subscription = device.monitorCharacteristicForService(
      options.serviceUuid ?? serviceUuidForCharacteristic(characteristicUuid),
      characteristicUuid,
      (error, characteristic) => {
        if (error !== null) {
          this.handleNotificationError(error, characteristicUuid, options);
          return;
        }
        if (characteristic === null) {
          return;
        }
        try {
          callback(characteristic, bytesFromCharacteristic(characteristic, characteristicUuid));
        } catch (notificationError) {
          this.handleNotificationError(notificationError, characteristicUuid, options);
        }
      },
      options.transactionId,
    );

    this.subscriptions.set(key, subscription);
  }

  async stopNotify(characteristicUuid: string): Promise<void> {
    const key = normalizeUuid(characteristicUuid);
    const subscription = this.subscriptions.get(key);
    if (subscription === undefined) {
      return;
    }
    subscription.remove();
    this.subscriptions.delete(key);
  }

  async waitForPoweredOn(timeoutMs = this.timeoutMs): Promise<void> {
    await waitForPoweredOn(this.manager, timeoutMs);
  }

  private async resolveAndConnect(connectionOptions: ConnectionOptions): Promise<Device> {
    const target = this.addressOrName?.trim();
    const device = await scanForDevice({
      manager: this.manager,
      target,
      timeoutMs: this.timeoutMs,
      namePrefixes: this.namePrefixes,
      scanServiceUUIDs: this.scanServiceUUIDs,
      scanOptions: this.scanOptions,
    });
    return device.connect(connectionOptions);
  }

  private requireDevice(): Device {
    if (this.connectedDevice === null) {
      throw new NotConnectedError("Connect to a SensWear device before using GATT operations.");
    }
    return this.connectedDevice;
  }

  private async stopAllNotifications(): Promise<void> {
    for (const subscription of this.subscriptions.values()) {
      subscription.remove();
    }
    this.subscriptions.clear();
  }

  private handleNotificationError(error: unknown, characteristicUuid: string, options: NotifyOptions): void {
    if (options.onError !== undefined) {
      options.onError(error);
      return;
    }
    if (this.onNotificationError !== undefined) {
      this.onNotificationError(error, characteristicUuid);
      return;
    }
    setTimeout(() => {
      throw error;
    }, 0);
  }
}

async function waitForPoweredOn(manager: BleManager, timeoutMs: number): Promise<void> {
  const currentState = await manager.state();
  if (currentState === "PoweredOn") {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let subscription: Subscription | null = null;
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      subscription?.remove();
      reject(new Error(`Bluetooth adapter was not powered on within ${timeoutMs} ms.`));
    }, timeoutMs);

    subscription = manager.onStateChange((state) => {
      if (state !== "PoweredOn" || settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      subscription?.remove();
      resolve();
    }, true);
  });
}

async function collectDevices(options: Omit<ScanForDeviceOptions, "target">): Promise<Device[]> {
  return new Promise((resolve, reject) => {
    const devices = new Map<string, Device>();
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      options.manager.stopDeviceScan();
      resolve([...devices.values()]);
    }, options.timeoutMs);

    options.manager.startDeviceScan(options.scanServiceUUIDs, options.scanOptions, (error, device) => {
      if (settled) {
        return;
      }
      if (error !== null) {
        settled = true;
        clearTimeout(timeout);
        options.manager.stopDeviceScan();
        reject(error);
        return;
      }
      if (device === null || !nameMatchesPrefix(deviceName(device), options.namePrefixes)) {
        return;
      }
      devices.set(device.id, device);
    });
  });
}

async function scanForDevice(options: ScanForDeviceOptions): Promise<Device> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      options.manager.stopDeviceScan();
      reject(notFoundError(options.target));
    }, options.timeoutMs);

    options.manager.startDeviceScan(options.scanServiceUUIDs, options.scanOptions, (error, device) => {
      if (settled) {
        return;
      }
      if (error !== null) {
        settled = true;
        clearTimeout(timeout);
        options.manager.stopDeviceScan();
        reject(error);
        return;
      }
      if (device === null) {
        return;
      }

      const matches = options.target === undefined || options.target.length === 0
        ? nameMatchesPrefix(deviceName(device), options.namePrefixes)
        : deviceMatchesTarget(device, options.target);

      if (!matches) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      options.manager.stopDeviceScan();
      resolve(device);
    });
  });
}

function bytesFromCharacteristic(characteristic: Characteristic, characteristicUuid: string): Uint8Array {
  if (typeof characteristic.value !== "string") {
    throw new ProtocolError(`Characteristic ${characteristicUuid} did not include a base64 value.`);
  }
  return base64ToBytes(characteristic.value);
}

function toDiscoveredDevice(device: Device): DiscoveredDevice {
  return {
    id: device.id,
    address: device.id,
    name: deviceName(device),
    rssi: device.rssi ?? null,
  };
}

function deviceName(device: Device): string | null {
  return device.name ?? device.localName ?? null;
}

function nameMatchesPrefix(name: string | null, prefixes: readonly string[]): boolean {
  return name !== null && prefixes.some((prefix) => name.startsWith(prefix));
}

function deviceMatchesTarget(device: Device, target: string): boolean {
  const name = deviceName(device);
  return device.id.toLowerCase() === target.toLowerCase() || name === target;
}

function looksLikeBleIdentifier(value: string): boolean {
  return value.includes(":") || value.includes("-");
}

function normalizeUuid(uuid: string): string {
  return uuid.toLowerCase();
}

function notFoundError(target: string | undefined): DeviceNotFoundError {
  if (target !== undefined && target.length > 0) {
    return new DeviceNotFoundError(`No BLE device named ${JSON.stringify(target)} was found.`);
  }
  return new DeviceNotFoundError(
    "No SensWear device was found. Make sure the device is powered, advertising, and close enough to the phone.",
  );
}
