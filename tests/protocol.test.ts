import { describe, expect, it } from "vitest";

import { ProtocolError } from "../src/errors";
import { BatteryGaugeState, GAUGE_STATE_LENGTH } from "../src/modules/battery";
import { CHARGER_STATE_LENGTH, ChargerState } from "../src/modules/charger";
import { HAPTIC_MAX_FRAMES, HAPTIC_PATTERN_VERSION, HapticFrame, HapticPattern } from "../src/modules/haptic";
import { LINEAR_ACCELERATION_LENGTH, LinearAccelerationSample, QUATERNION_LENGTH, QuaternionSample } from "../src/modules/imu";
import { LED_COLOR_LENGTH, LedColor } from "../src/modules/led";
import { TEMPERATURE_SAMPLE_LENGTH, TemperatureSample } from "../src/modules/temperature";

describe("BatteryGaugeState", () => {
  it("decodes the firmware layout", () => {
    const payload = new Uint8Array(GAUGE_STATE_LENGTH);
    const view = new DataView(payload.buffer);
    view.setInt16(0, 234, true);
    view.setUint16(2, 3790, true);
    view.setInt16(4, -42, true);
    view.setInt16(6, -160, true);
    view.setUint16(8, 870, true);
    view.setUint16(10, 220, true);
    view.setUint16(12, 450, true);
    view.setUint16(14, 180, true);

    const state = BatteryGaugeState.fromBytes(payload);

    expect(state.temperatureDeciC).toBe(234);
    expect(state.voltageMv).toBe(3790);
    expect(state.averageCurrentMa).toBe(-42);
    expect(state.averagePowerMw).toBe(-160);
    expect(state.stateOfChargeDeciPercent).toBe(870);
    expect(state.nominalAvailableCapacityMah).toBe(220);
    expect(state.fullBatteryCapacityMah).toBe(450);
    expect(state.remainingCapacityMah).toBe(180);
    expect(state.temperatureC).toBe(23.4);
    expect(state.stateOfChargePercent).toBe(87.0);
  });

  it("rejects wrong payload lengths and detects zero fallback", () => {
    expect(() => BatteryGaugeState.fromBytes(new Uint8Array(GAUGE_STATE_LENGTH - 1))).toThrow(ProtocolError);
    expect(BatteryGaugeState.fromBytes(new Uint8Array(GAUGE_STATE_LENGTH)).isZeroState).toBe(true);
  });
});

describe("ChargerState", () => {
  it("decodes firmware flags", () => {
    const flags = (1 << 5) | (1 << 6) | (1 << 10) | (1 << 17);
    const payload = new Uint8Array(CHARGER_STATE_LENGTH);
    new DataView(payload.buffer).setUint32(0, flags, true);

    const state = ChargerState.fromBytes(payload);

    expect(state.flags).toBe(flags);
    expect(state.powerGood).toBe(true);
    expect(state.charging).toBe(true);
    expect(state.thermalNormal).toBe(true);
    expect(state.batteryOcpFault).toBe(true);
    expect(state.hasFault).toBe(true);
    expect(state.charged).toBe(false);
    expect(state.thermalSystemFault).toBe(false);
  });

  it("rejects wrong payload lengths and detects zero fallback", () => {
    expect(() => ChargerState.fromBytes(new Uint8Array(CHARGER_STATE_LENGTH - 1))).toThrow(ProtocolError);
    const zero = ChargerState.fromBytes(new Uint8Array(CHARGER_STATE_LENGTH));
    expect(zero.isZeroState).toBe(true);
    expect(zero.hasFault).toBe(false);
  });
});

describe("LedColor", () => {
  it("decodes and encodes the firmware layout", () => {
    const color = LedColor.fromBytes([0x11, 0x22, 0x33, 0x44]);

    expect(color.red).toBe(0x11);
    expect(color.green).toBe(0x22);
    expect(color.blue).toBe(0x33);
    expect(color.white).toBe(0x44);
    expect(color.toInt()).toBe(0x44332211);
    expect([...color.toBytes()]).toEqual([0x11, 0x22, 0x33, 0x44]);
  });

  it("accepts RGB and RGBW hex values", () => {
    expect(LedColor.fromHex("#102030")).toEqual(new LedColor(0x10, 0x20, 0x30, 0));
    expect(LedColor.fromHex("10203040")).toEqual(new LedColor(0x10, 0x20, 0x30, 0x40));
    expect(() => LedColor.fromBytes(new Uint8Array(LED_COLOR_LENGTH - 1))).toThrow(ProtocolError);
    expect(() => new LedColor(256, 0, 0)).toThrow(RangeError);
  });
});

describe("HapticPattern", () => {
  it("encodes the firmware layout", () => {
    const pattern = HapticPattern.fromFrames([[100, 255], new HapticFrame(50, 0)]);
    const payload = pattern.toBytes();

    expect([...payload]).toEqual([HAPTIC_PATTERN_VERSION, 0, 2, 0, 100, 0, 255, 50, 0, 0]);
    expect(pattern.totalDurationMs).toBe(150);
    expect(HapticPattern.fromBytes(payload).toDict()).toEqual(pattern.toDict());
  });

  it("rejects invalid frames and patterns", () => {
    expect(() => new HapticFrame(0, 200)).toThrow(RangeError);
    expect(() => new HapticFrame(100, 256)).toThrow(RangeError);
    expect(() => HapticFrame.fromBytes([0x01, 0x02])).toThrow(ProtocolError);
    expect(() => HapticPattern.fromFrames([])).toThrow(RangeError);
    expect(() => HapticPattern.fromFrames(Array.from({ length: HAPTIC_MAX_FRAMES + 1 }, () => new HapticFrame(1, 1))))
      .toThrow(RangeError);
    expect(() => HapticPattern.fromBytes([2, 0, 1, 0, 10, 0, 1])).toThrow(ProtocolError);
    expect(() => HapticPattern.fromBytes([1, 0, 2, 0, 10, 0, 1])).toThrow(ProtocolError);
  });
});

describe("IMU samples", () => {
  it("decodes quaternion samples", () => {
    const payload = new Uint8Array(QUATERNION_LENGTH);
    const view = new DataView(payload.buffer);
    view.setInt16(0, 8192, true);
    view.setInt16(2, -8192, true);
    view.setInt16(4, 0, true);
    view.setInt16(6, 16384, true);
    view.setUint16(8, 1024, true);

    const sample = QuaternionSample.fromBytes(payload);

    expect(sample.toTuple()).toEqual([0.5, -0.5, 0, 1.0]);
    expect(sample.toTuple({ normalized: false })).toEqual([8192, -8192, 0, 16384]);
    expect(sample.accuracyRadians).toBeCloseTo(0.0625);
    expect(sample.accuracyDegrees).toBeCloseTo((0.0625 * 180.0) / Math.PI);
    expect(() => QuaternionSample.fromBytes(new Uint8Array(QUATERNION_LENGTH - 1))).toThrow(ProtocolError);
  });

  it("decodes linear acceleration samples", () => {
    const payload = new Uint8Array(LINEAR_ACCELERATION_LENGTH);
    const view = new DataView(payload.buffer);
    view.setInt16(0, 4096, true);
    view.setInt16(2, -2048, true);
    view.setInt16(4, 1024, true);

    const sample = LinearAccelerationSample.fromBytes(payload);

    expect(sample.toTuple()).toEqual([1.0, -0.5, 0.25]);
    expect(sample.toTuple({ scaled: false })).toEqual([4096, -2048, 1024]);
    expect(() => LinearAccelerationSample.fromBytes(new Uint8Array(LINEAR_ACCELERATION_LENGTH - 1))).toThrow(ProtocolError);
  });
});

describe("TemperatureSample", () => {
  it("decodes positive and negative temperature samples", () => {
    const positive = new Uint8Array(TEMPERATURE_SAMPLE_LENGTH);
    new DataView(positive.buffer).setInt32(0, 36_625, true);
    const negative = new Uint8Array(TEMPERATURE_SAMPLE_LENGTH);
    new DataView(negative.buffer).setInt32(0, -1250, true);

    const sample = TemperatureSample.fromBytes(positive);

    expect(sample.temperatureMdegC).toBe(36_625);
    expect(sample.temperatureC).toBe(36.625);
    expect(sample.temperatureF).toBeCloseTo(97.925);
    expect(TemperatureSample.fromBytes(negative).temperatureC).toBe(-1.25);
    expect(() => TemperatureSample.fromBytes(new Uint8Array(TEMPERATURE_SAMPLE_LENGTH - 1))).toThrow(ProtocolError);
  });
});
