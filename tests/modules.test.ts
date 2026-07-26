import { describe, expect, it, vi } from "vitest";

import type { ByteInput } from "../src/binary";
import { BatteryModule } from "../src/modules/battery";
import { PowerStatusModule } from "../src/modules/charger";
import { HapticModule } from "../src/modules/haptic";
import { ImuModule } from "../src/modules/imu";
import { LedModule } from "../src/modules/led";
import { PpgModule } from "../src/modules/ppg";
import type { NotifyCallback, NotifyOptions, WriteOptions } from "../src/modules/shared";
import { TemperatureModule } from "../src/modules/temperature";
import { TimeModule } from "../src/modules/time";
import { TouchModule } from "../src/modules/touch";
import {
  BATTERY_LEVEL_STATUS_UUID, BATTERY_LEVEL_UUID, CURRENT_TIME_UUID, HAPTIC_PATTERN_UUID,
  IMU_DRAIN_PERIOD_UUID, IMU_ENABLE_UUID, LED_COLOR_UUID, MEASUREMENT_INTERVAL_UUID,
  PPG_PER_SAMPLE_IRQ_UUID, PPG_SAMPLING_ENABLE_UUID, TEMPERATURE_TYPE_UUID,
  TOUCH_SAMPLING_ENABLE_UUID,
} from "../src/uuids";

class FakeGattClient {
  reads = new Map<string, Uint8Array>();
  writes: Array<[string, number[], boolean]> = [];
  started = new Map<string, NotifyCallback>();
  stopped: string[] = [];

  async readGattChar(uuid: string): Promise<Uint8Array> {
    const value = this.reads.get(uuid);
    if (!value) throw new Error(`No fake payload for ${uuid}`);
    return value;
  }
  async writeGattChar(uuid: string, data: ByteInput, options: WriteOptions = {}): Promise<void> {
    this.writes.push([uuid, [...new Uint8Array(
      data instanceof ArrayBuffer ? data : ArrayBuffer.isView(data) ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) : data,
    )], options.response ?? true]);
  }
  async startNotify(uuid: string, callback: NotifyCallback, _options?: NotifyOptions): Promise<void> {
    this.started.set(uuid, callback);
  }
  async stopNotify(uuid: string): Promise<void> {
    this.stopped.push(uuid);
    this.started.delete(uuid);
  }
}

describe("standard service modules", () => {
  it("reads and subscribes to battery endpoints", async () => {
    const gatt = new FakeGattClient();
    gatt.reads.set(BATTERY_LEVEL_UUID, new Uint8Array([71]));
    gatt.reads.set(BATTERY_LEVEL_STATUS_UUID, new Uint8Array([2, 1, 0, 71]));
    const battery = new BatteryModule(gatt);
    const power = new PowerStatusModule(gatt);
    expect((await battery.read()).percent).toBe(71);
    expect((await power.read()).batteryPresent).toBe(true);
    const callback = vi.fn();
    await battery.subscribe(callback);
    gatt.started.get(BATTERY_LEVEL_UUID)?.({} as never, new Uint8Array([70]));
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ percent: 70 }));
  });

  it("reads/writes time and thermometer configuration endpoints", async () => {
    const gatt = new FakeGattClient();
    gatt.reads.set(TEMPERATURE_TYPE_UUID, new Uint8Array([2]));
    gatt.reads.set(MEASUREMENT_INTERVAL_UUID, new Uint8Array([60, 0]));
    const temperature = new TemperatureModule(gatt);
    expect(await temperature.readTemperatureType()).toBe(2);
    expect(await temperature.readMeasurementInterval()).toBe(60);
    await temperature.setMeasurementInterval(120, { response: false });

    const time = new TimeModule(gatt);
    await time.set(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)));
    expect(gatt.writes[0]).toEqual([MEASUREMENT_INTERVAL_UUID, [120, 0], false]);
    expect(gatt.writes[1][0]).toBe(CURRENT_TIME_UUID);
    expect(gatt.writes[1][1]).toEqual([0xea, 0x07, 1, 2, 3, 4, 5, 5, 0, 1]);
    await expect(time.set(new Date(Date.UTC(2019, 0, 1)))).rejects.toThrow(RangeError);
    await expect(temperature.setMeasurementInterval(61)).rejects.toThrow(RangeError);
    await expect(temperature.setMeasurementInterval(65_521)).rejects.toThrow(RangeError);
  });
});

describe("custom service modules", () => {
  it("uses IMU configuration endpoints and validation", async () => {
    const gatt = new FakeGattClient();
    gatt.reads.set(IMU_ENABLE_UUID, new Uint8Array([1]));
    gatt.reads.set(IMU_DRAIN_PERIOD_UUID, new Uint8Array([100, 0, 0, 0]));
    const imu = new ImuModule(gatt);
    expect(await imu.isEnabled()).toBe(true);
    expect(await imu.readDrainPeriodMs()).toBe(100);
    await imu.setEnabled(false);
    await imu.setDrainPeriodMs(250);
    expect(gatt.writes).toEqual([
      [IMU_ENABLE_UUID, [0], true],
      [IMU_DRAIN_PERIOD_UUID, [250, 0, 0, 0], true],
    ]);
    await expect(imu.setDrainPeriodMs(0)).rejects.toThrow(RangeError);
  });

  it("controls PPG and touch boolean configurations", async () => {
    const gatt = new FakeGattClient();
    gatt.reads.set(PPG_SAMPLING_ENABLE_UUID, new Uint8Array([1]));
    gatt.reads.set(PPG_PER_SAMPLE_IRQ_UUID, new Uint8Array([0]));
    gatt.reads.set(TOUCH_SAMPLING_ENABLE_UUID, new Uint8Array([1]));
    const ppg = new PpgModule(gatt);
    const touch = new TouchModule(gatt);
    expect(await ppg.isSamplingEnabled()).toBe(true);
    expect(await ppg.isPerSampleIrqEnabled()).toBe(false);
    expect(await touch.isSamplingEnabled()).toBe(true);
    await ppg.setSamplingEnabled(false);
    await ppg.setPerSampleIrqEnabled(true, { response: false });
    await touch.setSamplingEnabled(false);
    expect(gatt.writes).toEqual([
      [PPG_SAMPLING_ENABLE_UUID, [0], true],
      [PPG_PER_SAMPLE_IRQ_UUID, [1], false],
      [TOUCH_SAMPLING_ENABLE_UUID, [0], true],
    ]);
    await expect(ppg.setSamplingEnabled(1 as never)).rejects.toThrow(TypeError);
    await expect(touch.setSamplingEnabled("yes" as never)).rejects.toThrow(TypeError);
  });

  it("writes corrected RGB and 32-frame haptic payloads", async () => {
    const gatt = new FakeGattClient();
    const led = new LedModule(gatt);
    const haptic = new HapticModule(gatt);
    await led.setRgb(0x10, 0x20, 0x30, { response: false });
    await haptic.play([[25, 100], [25, 0]]);
    expect(gatt.writes).toEqual([
      [LED_COLOR_UUID, [0x30, 0x20, 0x10, 0], false],
      [HAPTIC_PATTERN_UUID, [1, 0, 2, 0, 25, 0, 100, 25, 0, 0], true],
    ]);
  });
});
