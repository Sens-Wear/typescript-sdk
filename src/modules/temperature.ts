import { assertLength, bytesFrom, dataView, readInt32LE, writeUint16LE } from "../binary";
import {
  TEMPERATURE_SAMPLE_UUID,
  TEMPERATURE_SAMPLING_RATE_UUID,
  TEMPERATURE_TRANSFER_INTERVAL_UUID,
} from "../uuids";
import type { GattClient, MaybePromise } from "./shared";
import { invokeCallback } from "./shared";

export const TEMPERATURE_SAMPLE_LENGTH = 4;

export interface TemperatureSampleDict {
  temperature_mdeg_c: number;
  temperature_c: number;
  temperature_f: number;
}

export class TemperatureSample {
  constructor(readonly temperatureMdegC: number) {}

  static fromBytes(payload: Uint8Array | ArrayBuffer | ArrayBufferView | readonly number[]): TemperatureSample {
    const bytes = bytesFrom(payload);
    assertLength(bytes, TEMPERATURE_SAMPLE_LENGTH, "Temperature");
    return new TemperatureSample(readInt32LE(dataView(bytes), 0));
  }

  static from_bytes(payload: Uint8Array | ArrayBuffer | ArrayBufferView | readonly number[]): TemperatureSample {
    return TemperatureSample.fromBytes(payload);
  }

  get temperatureC(): number {
    return this.temperatureMdegC / 1000.0;
  }

  get temperatureF(): number {
    return (this.temperatureC * 9.0) / 5.0 + 32.0;
  }

  get temperature_mdeg_c(): number {
    return this.temperatureMdegC;
  }

  get temperature_c(): number {
    return this.temperatureC;
  }

  get temperature_f(): number {
    return this.temperatureF;
  }

  toDict(): TemperatureSampleDict {
    return {
      temperature_mdeg_c: this.temperatureMdegC,
      temperature_c: this.temperatureC,
      temperature_f: this.temperatureF,
    };
  }

  to_dict(): TemperatureSampleDict {
    return this.toDict();
  }
}

export type TemperatureCallback = (sample: TemperatureSample) => MaybePromise<void>;

export class TemperatureModule {
  readonly sampleUuid = TEMPERATURE_SAMPLE_UUID;
  readonly samplingRateUuid = TEMPERATURE_SAMPLING_RATE_UUID;
  readonly transferIntervalUuid = TEMPERATURE_TRANSFER_INTERVAL_UUID;

  constructor(private readonly client: GattClient) {}

  async read(): Promise<TemperatureSample> {
    const payload = await this.client.readGattChar(this.sampleUuid);
    return TemperatureSample.fromBytes(payload);
  }

  async setSamplingRateHz(samplingRateHz: number, options: { response?: boolean } = {}): Promise<void> {
    const payload = packUint16Nonzero(samplingRateHz, "samplingRateHz");
    await this.client.writeGattChar(this.samplingRateUuid, payload, {
      response: options.response ?? true,
    });
  }

  async set_sampling_rate_hz(samplingRateHz: number, options: { response?: boolean } = {}): Promise<void> {
    await this.setSamplingRateHz(samplingRateHz, options);
  }

  async setTransferInterval(transferInterval: number, options: { response?: boolean } = {}): Promise<void> {
    const payload = packUint16Nonzero(transferInterval, "transferInterval");
    await this.client.writeGattChar(this.transferIntervalUuid, payload, {
      response: options.response ?? true,
    });
  }

  async set_transfer_interval(transferInterval: number, options: { response?: boolean } = {}): Promise<void> {
    await this.setTransferInterval(transferInterval, options);
  }

  async subscribe(callback: TemperatureCallback): Promise<void> {
    await this.unsubscribe();
    await this.client.startNotify(this.sampleUuid, (_sender, data) => {
      invokeCallback(callback, TemperatureSample.fromBytes(data));
    });
  }

  async unsubscribe(): Promise<void> {
    await this.client.stopNotify(this.sampleUuid);
  }
}

function packUint16Nonzero(value: number, name: string): Uint8Array {
  if (!Number.isInteger(value) || value < 1 || value > 0xffff) {
    throw new RangeError(`${name} must be an integer between 1 and 65535.`);
  }
  return writeUint16LE(value);
}
