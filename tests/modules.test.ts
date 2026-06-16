import { describe, expect, it } from "vitest";

import {
  HAPTIC_PATTERN_UUID,
  LED_COLOR_UUID,
  TEMPERATURE_SAMPLING_RATE_UUID,
  TEMPERATURE_TRANSFER_INTERVAL_UUID,
} from "../src/uuids";
import type { ByteInput } from "../src/binary";
import { HapticModule } from "../src/modules/haptic";
import { LedModule } from "../src/modules/led";
import type { NotifyCallback, WriteOptions } from "../src/modules/shared";
import { TemperatureModule } from "../src/modules/temperature";

class FakeGattClient {
  readPayload = new Uint8Array([1, 2, 3, 4]);
  writes: Array<[string, number[], boolean]> = [];
  started = new Map<string, NotifyCallback>();
  stopped: string[] = [];
  lastReadUuid: string | null = null;

  async readGattChar(characteristicUuid: string): Promise<Uint8Array> {
    this.lastReadUuid = characteristicUuid;
    return this.readPayload;
  }

  async writeGattChar(characteristicUuid: string, data: ByteInput, options: WriteOptions = {}): Promise<void> {
    this.writes.push([characteristicUuid, Array.from(data as Uint8Array), options.response ?? true]);
  }

  async startNotify(characteristicUuid: string, callback: NotifyCallback): Promise<void> {
    this.started.set(characteristicUuid, callback);
  }

  async stopNotify(characteristicUuid: string): Promise<void> {
    this.stopped.push(characteristicUuid);
  }
}

describe("LedModule", () => {
  it("reads and writes LED color payloads", async () => {
    const client = new FakeGattClient();
    const module = new LedModule(client);

    const color = await module.read();
    await module.setRgb(0x10, 0x20, 0x30, { white: 0x40, response: false });
    await module.off();

    expect(color.toDict()).toEqual({ red: 1, green: 2, blue: 3, white: 4 });
    expect(client.lastReadUuid).toBe(LED_COLOR_UUID);
    expect(client.writes).toEqual([
      [LED_COLOR_UUID, [0x10, 0x20, 0x30, 0x40], false],
      [LED_COLOR_UUID, [0, 0, 0, 0], true],
    ]);
  });
});

describe("HapticModule", () => {
  it("writes haptic pattern payloads", async () => {
    const client = new FakeGattClient();
    const module = new HapticModule(client);

    await module.play([[25, 100], [25, 0]], { response: false });
    await module.vibrate(75, 180);

    expect(client.writes).toEqual([
      [HAPTIC_PATTERN_UUID, [1, 0, 2, 0, 25, 0, 100, 25, 0, 0], false],
      [HAPTIC_PATTERN_UUID, [1, 0, 1, 0, 75, 0, 180], true],
    ]);
  });
});

describe("TemperatureModule", () => {
  it("writes uint16 configuration payloads", async () => {
    const client = new FakeGattClient();
    const module = new TemperatureModule(client);

    await module.setSamplingRateHz(10, { response: false });
    await module.setTransferInterval(2);

    expect(client.writes).toEqual([
      [TEMPERATURE_SAMPLING_RATE_UUID, [10, 0], false],
      [TEMPERATURE_TRANSFER_INTERVAL_UUID, [2, 0], true],
    ]);
    await expect(module.setSamplingRateHz(0)).rejects.toThrow(RangeError);
  });
});
