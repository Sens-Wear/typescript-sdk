# SensWear TypeScript SDK

TypeScript SDK for SensWear devices in React Native applications. It uses
[`react-native-ble-plx`](https://github.com/dotintent/react-native-ble-plx) and exposes typed,
firmware-compatible interfaces for battery and charging state, clock synchronization,
temperature, IMU, PPG, touch, RGB LED, and haptic output.

This document describes SDK version **0.2.0** and the current firmware protocol. It explains
both the convenient TypeScript API and the exact values transported over Bluetooth, so it can
also be used when integrating another BLE stack.

## Installation

```bash
npm install senswear react-native-ble-plx
```

Follow the `react-native-ble-plx` native setup instructions. Your application is responsible
for declaring and requesting the Bluetooth permissions required by its Android/iOS target.

The SDK requires Node 18 or newer for development and React Native 0.72 or newer.

## Quick start

```ts
import { SenswearClient } from "senswear";

const devices = await SenswearClient.discover({ timeoutMs: 5_000 });
if (devices.length === 0) throw new Error("No SensWear device found");

const client = new SenswearClient(devices[0].id, {
  onNotificationError(error, characteristicUuid) {
    console.error("Notification failed", characteristicUuid, error);
  },
});

await client.connect();

console.log("Battery:", (await client.battery.read()).percent, "%");
await client.led.set("#20A0FF");
await client.haptic.vibrate(150, 200);

await client.disconnect();
await client.destroy();
```

`destroy()` releases the internally created `BleManager`. If you supply your own manager,
the SDK never destroys it.

## Programming model

`SenswearClient` owns connection and GATT operations. Its typed modules are:

| Property | Capability |
|---|---|
| `battery` | Battery percentage |
| `power` | Battery presence, external power, charging state, charge level, faults |
| `time` | Read/set device UTC clock and read time metadata |
| `temperature` | Body-temperature indications and measurement interval |
| `imu` | Quaternion, acceleration, gyroscope, gesture, and activity |
| `ppg` | Red, infrared, and green optical ADC samples |
| `touch` | Touch coordinates, normalized gestures, and raw controller state |
| `led` | RGB output |
| `haptic` | Single vibrations and multi-frame patterns |

`client.charger` remains as a deprecated alias for `client.power`.

### Discovery and connection

```ts
const found = await SenswearClient.discover({
  timeoutMs: 7_500,
  namePrefixes: ["Sens Wear", "SensWear", "SenseWear"],
});

const client = new SenswearClient(found[0].id, {
  timeoutMs: 10_000,
});
await client.connect();
```

You may pass a device ID/address or a device name to the constructor. With `null`, the first
device matching a configured name prefix is used. `connect()` discovers all services and
characteristics before returning.

### Reads, writes, and subscriptions

Reads return typed objects:

```ts
const level = await client.battery.read();
console.log(level.percent);
```

Writes use a BLE write-with-response by default. Where a method accepts it, `{ response:
false }` selects write-without-response:

```ts
await client.led.set("#00FF40", { response: false });
```

Subscriptions parse every notification or indication before calling the application:

```ts
await client.imu.subscribeAccelerometer((sample) => {
  console.log(sample.timestampUs, sample.xG, sample.yG, sample.zG);
});

await client.imu.unsubscribe(IMU_ACCELEROMETER_UUID);
```

Only one subscription per characteristic is retained by a client. Starting it again replaces
the old monitor. `disconnect()` stops every active monitor.

Errors thrown while parsing notifications are sent to the module notification `onError` when
one is provided at the low-level API, otherwise to the client's `onNotificationError`.

## Data conventions

### Endianness

Every multibyte firmware value is little-endian. SDK users normally work with parsed fields;
the wire-layout tables below are included for protocol debugging and independent integrations.

### Timestamps

IMU and touch records contain signed 64-bit **microseconds**. PPG records contain unsigned
64-bit **milliseconds**. They are exposed as `bigint` (`timestampUs` or `timestampMs`) so no
integer precision is lost in JavaScript.

Each timestamped class also has a `timestamp: Date` convenience getter. `Date` only preserves
milliseconds and JavaScript numbers cannot exactly represent all 64-bit integers. Use the
`bigint` property for ordering, synchronization, or lossless storage.

Current Time and temperature timestamps are standard BLE calendar values interpreted as UTC.

### Units

| Field | Unit |
|---|---|
| `BatteryLevel.percent` | percent, integer 0–100 |
| `timestampUs` | microseconds |
| `timestampMs` | milliseconds |
| quaternion components | unitless Q14 converted to floating point |
| quaternion accuracy | radians; degrees convenience property also provided |
| accelerometer | g |
| gyroscope | raw firmware/BHI sample units |
| temperature | °C; °F convenience property also provided |
| PPG value | raw 18-bit ADC count |
| touch x/y | 12-bit controller coordinate |
| IMU drain period | milliseconds |
| temperature interval | seconds |
| haptic duration | milliseconds |

Malformed lengths and encodings throw `ProtocolError`. Invalid application input normally
throws `RangeError` or `TypeError`.

## Battery level

The standard Bluetooth Battery Service provides remaining charge.

```ts
const level = await client.battery.read();
console.log(level.percent); // integer 0..100

await client.battery.subscribe((next) => {
  console.log(`${next.percent}%`);
});
await client.battery.unsubscribe();
```

`BatteryLevel.percent` is a percentage, not a fraction: `75` means 75%, not 0.75. The
firmware clamps reported values to 0–100.

| Item | Value |
|---|---|
| Service | `0x180F` Battery Service |
| Characteristic | `0x2A19` Battery Level |
| Operations | read, notify |
| Payload | one unsigned byte, 0–100 |

## Power and charging status

```ts
const status = await client.power.read();

console.log({
  batteryPresent: status.batteryPresent,
  wiredPower: status.wiredPower,
  wirelessPower: status.wirelessPower,
  chargeState: status.chargeState,
  chargeLevel: status.chargeLevel,
  batteryLevel: status.batteryLevel,
  chargingFault: status.chargingFault,
});

await client.power.subscribe((next) => console.log(next.toDict()));
```

This is the standard Battery Level Status characteristic. `batteryLevelPresent` tells you
whether the final byte is present semantically; current firmware sets that flag.

Enums:

| `PowerSourceState` | Value | Meaning |
|---|---:|---|
| `NotConnected` | 0 | source is not connected |
| `Connected` | 1 | source is connected |
| `Unknown` | 2 | state cannot be determined |
| `Reserved` | 3 | reserved encoding |

| `ChargeState` | Value | Meaning |
|---|---:|---|
| `Unknown` | 0 | charging state unknown |
| `Charging` | 1 | energy is entering the battery |
| `DischargingActive` | 2 | battery is powering an active device |
| `DischargingInactive` | 3 | battery is discharging while inactive |

| `ChargeLevel` | Value | Meaning |
|---|---:|---|
| `Unknown` | 0 | level category unknown |
| `Good` | 1 | normal charge |
| `Low` | 2 | low charge |
| `Critical` | 3 | critically low charge |

`chargeType` is the 3-bit standard charge-type field. `chargingFault` is the 4-bit standard
fault field. The current firmware maps its charger fault indication to the “other” reason bit;
applications should treat any nonzero `chargingFault` as a fault and retain the numeric value
for diagnostics.

Wire format (`<BHB>`, four bytes):

| Offset | Type | Meaning |
|---:|---|---|
| 0 | `uint8` | flags; bit 1 means battery level is present |
| 1 | `uint16` | packed power state |
| 3 | `uint8` | battery percentage |

Packed `powerState`: bit 0 battery present; bits 1–2 wired source; 3–4 wireless source;
5–6 charge state; 7–8 charge level; 9–11 charge type; 12–15 charging fault.

## Device time

The device RTC uses the Bluetooth Current Time Service.

```ts
const current = await client.time.read();
console.log(current.value.toISOString(), current.adjustReason);

await client.time.set(new Date(), {
  adjustReason: AdjustReason.ExternalReference,
});

const local = await client.time.readLocalInformation();
console.log(local.utcOffsetMinutes); // number or null

const reference = await client.time.readReferenceInformation();
console.log(reference.accuracySeconds); // number or null
```

Dates passed to `set()` are serialized from their UTC fields. The firmware rejects dates
before 2020-01-01, and the SDK validates this before writing. `dayOfWeek` uses Bluetooth's
1=Monday through 7=Sunday convention. `fractions256` is the fractional second in units of
1/256 second.

`AdjustReason` is a bit field: `ManualUpdate=1`, `ExternalReference=2`,
`TimeZoneChange=4`, and `DstChange=8`. Values may be ORed together.

`LocalTimeInformation.timeZoneQuarterHours` is the UTC offset in 15-minute units; `-128`
means unknown. `utcOffsetMinutes` converts it and returns `null` for unknown. `dstOffset` is
the standard Bluetooth DST code; `255` means unknown.

`ReferenceTimeInformation.source` is the standard reference source code.
`accuracyEighthsSecond` is accuracy in 1/8 second; `255` means unknown.
`daysSinceUpdate` and `hoursSinceUpdate` are time since the last synchronization and use
`255` as unknown.

| Characteristic | UUID | Operations | Payload |
|---|---|---|---|
| Current Time | `0x2A2B` | read, write, notify | 10-byte calendar |
| Local Time Information | `0x2A0F` | read | signed zone byte + DST byte |
| Reference Time Information | `0x2A14` | read | source, accuracy, days, hours |

Current Time layout is little-endian year (`uint16`), then month, day, hour, minute, second,
day-of-week, fractions256, and adjust-reason bytes.

## Body temperature

Temperature Measurement is **indicate-only** in the firmware; it cannot be read directly.
Subscribe before waiting for a new measurement:

```ts
await client.temperature.subscribe((sample) => {
  console.log(sample.temperatureC);
  console.log(sample.temperatureF);
  console.log(sample.timestamp?.toISOString());
  console.log(sample.type); // TemperatureType.Body in current firmware
});

const type = await client.temperature.readTemperatureType();
const interval = await client.temperature.readMeasurementInterval();
await client.temperature.setMeasurementInterval(300);
```

`setMeasurementInterval(seconds)` accepts values the firmware can represent exactly:

- `0` disables scheduled measurements.
- Nonzero values must be whole-minute multiples from 60 through 65,520 seconds.
- Raw BLE writes with other nonzero values are rounded **up** by firmware, but the SDK rejects
  them so readback remains predictable.

`TemperatureType` values are: 1 armpit, 2 body, 3 ear, 4 finger, 5 gastrointestinal tract,
6 mouth, 7 rectum, 8 toe, and 9 tympanum.

Measurement wire format uses Bluetooth IEEE-11073 FLOAT:

| Field | Size | Current firmware |
|---|---:|---|
| flags | 1 | `0x06`: Celsius, timestamp present, type present |
| temperature | 4 | signed 24-bit mantissa + signed base-10 exponent |
| timestamp | 7 | year `uint16`, then month/day/hour/minute/second |
| type | 1 | body (`2`) |

The parser also handles legal packets where timestamp/type are absent or Fahrenheit is
selected, and always exposes `temperatureC`.

| Item | Value |
|---|---|
| Service | `0x1809` Health Thermometer |
| Measurement | `0x2A1C`, indicate |
| Temperature Type | `0x2A1D`, read |
| Measurement Interval | `0x2A21`, read/write/indicate |

## IMU

Physical streams are disabled after boot. Enable them before expecting quaternion,
accelerometer, or gyroscope data:

```ts
await client.imu.setEnabled(true);
console.log(await client.imu.isEnabled());

await client.imu.setDrainPeriodMs(100);
console.log(await client.imu.readDrainPeriodMs());
```

Quaternion, accelerometer, and gyroscope sampling is currently 100 Hz. `drainPeriodMs`
controls how often the firmware drains its FIFO and delivers accumulated samples; it changes
delivery latency/batching, **not** sensor sampling frequency. It must be nonzero.

Gesture and activity virtual sensors are event-driven and independent of the physical-stream
enable flag.

### Quaternion

```ts
await client.imu.subscribeQuaternion((q) => {
  console.log(q.timestampUs);
  console.log(q.x, q.y, q.z, q.w);
  console.log(q.accuracyRadians, q.accuracyDegrees);
});
```

Components and accuracy are Q14: raw / 16,384. `toTuple()` returns scaled `(x,y,z,w)`;
`toTuple({ normalized: false })` returns the signed raw integers. Accuracy is an angular
uncertainty, not a 0–100 quality score.

Payload `<qhhhhH>`: signed timestamp microseconds, signed x/y/z/w, unsigned accuracy.

### Accelerometer

```ts
await client.imu.subscribeAccelerometer((a) => {
  console.log(a.xG, a.yG, a.zG);
});
```

The firmware supplies the corrected wake-up accelerometer including gravity. Despite the
legacy 0.1 name “linear acceleration,” this is not gravity-removed linear acceleration.
Values are divided by 4096 to produce g. At rest, orientation permitting, one axis should be
near ±1 g.

Payload `<qhhh>`: timestamp microseconds then signed x/y/z.

### Gyroscope

```ts
await client.imu.subscribeGyroscope((g) => {
  console.log(g.x, g.y, g.z);
});
```

Gyroscope axes are exposed as signed raw firmware/BHI values because the firmware protocol
does not declare a physical scale. Do not label them degrees/second without applying a scale
established for the deployed firmware configuration.

### Gesture events

```ts
await client.imu.subscribeGesture((event) => {
  console.log(event.sensorId, event.gesture, event.timestampUs);
});
```

Normalized gesture values are `None=0`, `WristShake=3`, `FlickIn=4`, `FlickOut=5`.
Always inspect `sensorId`, because the same event channel can identify several virtual
sensors: any motion 142, wrist gesture 156, wrist wear 158, and no motion 159.

Payload `<qBB>`: timestamp, sensor ID, value.

### Activity events

```ts
await client.imu.subscribeActivity((event) => {
  console.log(event.activity, event.transition);
});
```

Activities: still 0, walking 1, running 2, bicycle 3, vehicle 4, tilting 5.
Transitions: ended 0, started 1. Wear-activity sensor ID is 154.

Payload `<qBBB>`: timestamp, sensor ID, activity, transition.

| Characteristic | UUID suffix | Size |
|---|---|---:|
| quaternion | `...6c11` | 18 |
| accelerometer | `...6c12` | 14 |
| gyroscope | `...6c13` | 14 |
| gesture | `...6c14` | 10 |
| activity | `...6c15` | 11 |
| stream enable | `...6c21` | 1 |
| drain period | `...6c22` | 4 |

Data service is `7d2b6c10-9d78-4f3c-a122-6d2c4e6d2a11`; configuration service uses
`...6c20`.

## PPG

The PPG interface exposes synchronized red, infrared, and green raw optical readings.
These are **ADC values**, not heart rate, oxygen saturation, absorbance, or calibrated light
intensity. Physiological metrics require signal-quality checks, filtering, motion-artifact
handling, calibration, and an application algorithm.

```ts
console.log(await client.ppg.isSamplingEnabled());
await client.ppg.setSamplingEnabled(true);

await client.ppg.subscribeRed((sample) => {
  console.log(sample.timestampMs, sample.value);
});
await client.ppg.subscribeIr(handleIr);
await client.ppg.subscribeGreen(handleGreen);
await client.ppg.unsubscribeAll();
```

Each `PpgSample.value` is a right-justified 18-bit value, normally 0–262,143. The wire field
is `uint32`; retain validation if receiving untrusted or mismatched firmware.

Current hardware configuration uses a 3200 Hz ADC rate with 16-sample averaging, producing
an effective 200 samples/second per color.

```ts
// IRQ cadence may only be changed while sampling is stopped.
await client.ppg.setSamplingEnabled(false);
await client.ppg.setPerSampleIrqEnabled(true);
await client.ppg.setSamplingEnabled(true);
```

Per-sample IRQ `false` allows batch/FIFO cadence; `true` requests an interrupt for each
effective sample. It changes delivery behavior, not the ADC data definition. Current firmware
boots with sampling enabled and per-sample IRQ disabled.

Every color payload is `<QI>`: unsigned timestamp milliseconds and unsigned ADC value.

| Channel/config | UUID |
|---|---|
| red | `029ca551-d022-4583-b483-91e9ea77034a` |
| infrared | `029ca552-d022-4583-b483-91e9ea77034a` |
| green | `029ca553-d022-4583-b483-91e9ea77034a` |
| sampling enable | `029ca561-d022-4583-b483-91e9ea77034a` |
| per-sample IRQ | `029ca562-d022-4583-b483-91e9ea77034a` |

Data and configuration services end in `...a54e...` and `...a560...`, respectively.

## Touch

```ts
await client.touch.setSamplingEnabled(true);
console.log(await client.touch.isSamplingEnabled());

await client.touch.subscribeState((state) => {
  if (state.touched) console.log(state.x, state.y);
});
```

Coordinates are 12-bit controller coordinates, normally 0–4095. They are sensor coordinates,
not screen pixels; map/rotate them according to the device mounting and UI. Firmware reports
x/y as zero when not touched.

### Normalized gestures

```ts
await client.touch.subscribeGesture((event) => {
  console.log(event.gesture, event.gestureState);
});
```

`gesture` is the stable application value:

| Value | Meaning |
|---:|---|
| 0 | none |
| 1 | single click |
| 2 | click and hold |
| 3 | double click |
| 4/5 | swipe down / swipe down and hold |
| 6/7 | swipe right / swipe right and hold |
| 8/9 | swipe up / swipe up and hold |
| 10/11 | swipe left / swipe left and hold |

`gestureState` retains the controller register for diagnostics. Current raw codes are `0x00`,
`0x10`, `0x11`, `0x20`, `0x31`, `0x32`, `0x41`, `0x42`, `0x51`, `0x52`, `0x61`, `0x62`.
Applications should branch on normalized `gesture`.

### Raw state

`subscribeRaw()` exposes `RawTouchSample`: timestamp, touched, x, y, and the controller's
raw `touchState` byte. Use this for diagnostics or controller-specific behavior; normal apps
should prefer state and gesture.

Use `unsubscribeState()`, `unsubscribeGesture()`, `unsubscribeRaw()`, or `unsubscribeAll()`
to stop monitors. `TouchGestureEvent`, `TouchRawState`, `isEnabled()`, and `setEnabled()` are
retained as deprecated compatibility aliases.

Wire layouts:

| Data | Layout | Size |
|---|---|---:|
| touch state | `<q?HH>` packed | 13 |
| gesture | `<qBB>` | 10 |
| raw state | ABI-aligned: timestamp at 0, bool at 8, pad at 9, x at 10, y at 12, state at 14, pad at 15 | 16 |

The raw-state padding is part of the current firmware ABI and is intentionally parsed.

| Characteristic | UUID suffix |
|---|---|
| state | `...eb42` |
| gesture | `...eb43` |
| raw | `...eb44` |
| enable | `...eb51` |

## RGB LED

```ts
await client.led.set("#FF8000");
await client.led.set(0xFF8000);
await client.led.set([255, 128, 0]);
await client.led.set({ red: 255, green: 128, blue: 0 });
await client.led.setRgb(255, 128, 0);
await client.led.off();
```

Each component is an integer 0–255. The semantic integer is `0xRRGGBB`; on the little-endian
wire its four-byte `uint32` representation is `[BB, GG, RR, 00]`. Thus red is semantically
`0xFF0000` and transported as `[0x00, 0x00, 0xFF, 0x00]`.

The current hardware interface is RGB only. The fourth transport byte is reserved/zero; the
old SDK's RGBW interpretation was incorrect.

Service `3c688942-4143-470d-a798-4629803a1983`, characteristic
`3c688943-4143-470d-a798-4629803a1983`, operations read/write/write-without-response.

## Haptic actuator

```ts
await client.haptic.vibrate(200, 255);

await client.haptic.play([
  [100, 255], // vibration
  [50, 0],    // pause
  [150, 160], // softer vibration
]);
```

Every frame has:

- `durationMs`: integer 1–65,535 milliseconds.
- `intensity`: integer 0–255. Zero is a silent pause; 255 is maximum requested intensity.

A pattern must contain 1–32 frames. The firmware rejects an overlapping command while an
existing pattern is busy, so serialize patterns or wait at least `pattern.totalDurationMs`.

Payload:

| Offset | Type | Meaning |
|---:|---|---|
| 0 | `uint8` | version, currently 1 |
| 1 | `uint8` | flags, currently 0 |
| 2 | `uint16` | frame count |
| 4... | repeated `<HB>` | duration milliseconds, intensity |

Service `daa05e91-f514-4a4e-8fc5-d1b80f25f24d`, write characteristic ending `...5e92`.

## UUID index

| Interface | Service | Characteristic(s) |
|---|---|---|
| Battery | `180F` | level `2A19`, level status `2BED` |
| Time | `1805` | current `2A2B`, local `2A0F`, reference `2A14` |
| Thermometer | `1809` | measurement `2A1C`, type `2A1D`, interval `2A21` |
| IMU data | `7d2b6c10-9d78-4f3c-a122-6d2c4e6d2a11` | `...11` through `...15` |
| IMU config | same base ending `...6c20...` | enable `...21`, drain `...22` |
| PPG data | `029ca54e-d022-4583-b483-91e9ea77034a` | red `...551`, IR `...552`, green `...553` |
| PPG config | same base ending `...a560...` | enable `...561`, IRQ `...562` |
| Touch data | `33a5eb3f-0e13-424f-8b7a-942be0ee5cfc` | state `...42`, gesture `...43`, raw `...44` |
| Touch config | same base ending `...eb50...` | enable `...51` |
| LED | `3c688942-4143-470d-a798-4629803a1983` | color `...8943` |
| Haptic | `daa05e91-f514-4a4e-8fc5-d1b80f25f24d` | pattern `...5e92` |

All constants are exported from `senswear`, and `serviceUuidForCharacteristic()` maps each
known characteristic to its owning service.

## Migration from 0.1

Version 0.2 follows the new firmware and contains intentional breaking corrections:

- The proprietary power service was replaced by SIG Battery Level and Battery Level Status.
  `client.charger` is retained as an alias for `client.power`; legacy charger flag meanings
  and the 16-byte fuel-gauge payload no longer exist.
- Temperature now uses Health Thermometer indications and an interval in seconds. The old
  sampling-rate and transfer-interval methods were removed.
- IMU samples now begin with a 64-bit microsecond timestamp. Accelerometer data includes
  gravity. Gyroscope, gesture, activity, enable, and drain-period endpoints were added.
- PPG and touch modules were added.
- LED encoding is RGB `0xRRGGBB`, transported little-endian. The former RGBW layout was wrong.
- The haptic maximum is 32 frames, not 64.

Recompile application code and update assumptions about payload lengths, timestamps, units,
and LED byte order when moving from 0.1.

## End-to-end streaming example

```ts
import {
  IMU_ACCELEROMETER_UUID,
  PPG_RED_UUID,
  SenswearClient,
  TOUCH_STATE_UUID,
} from "senswear";

const client = new SenswearClient(null, {
  onNotificationError(error, uuid) {
    console.error(`BLE decode/monitor error on ${uuid}`, error);
  },
});

try {
  await client.connect();

  await client.imu.setEnabled(true);
  await client.imu.setDrainPeriodMs(100);
  await client.touch.setSamplingEnabled(true);
  await client.ppg.setSamplingEnabled(true);

  await client.imu.subscribeAccelerometer((a) => {
    persist({ kind: "accel", tUs: a.timestampUs.toString(), xG: a.xG, yG: a.yG, zG: a.zG });
  });
  await client.ppg.subscribeRed((p) => {
    persist({ kind: "ppg-red", tMs: p.timestampMs.toString(), adc: p.value });
  });
  await client.touch.subscribeState((t) => {
    persist({ kind: "touch", tUs: t.timestampUs.toString(), touched: t.touched, x: t.x, y: t.y });
  });

  // Later:
  await client.imu.unsubscribe(IMU_ACCELEROMETER_UUID);
  await client.ppg.unsubscribe(PPG_RED_UUID);
  await client.touch.unsubscribe(TOUCH_STATE_UUID);
} finally {
  await client.destroy();
}

function persist(record: unknown): void {
  console.log(record);
}
```

Convert `bigint` timestamps to strings before JSON serialization: native
`JSON.stringify()` does not serialize `bigint`.

## Development

```bash
npm run typecheck
npm test
npm run build
```

Tests include exact firmware byte layouts, parsing, validation, module UUID routing, writes,
and notification callbacks.
