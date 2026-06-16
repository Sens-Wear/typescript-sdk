# SensWear TypeScript SDK

TypeScript SDK for connecting to SensWear hardware from React Native mobile apps over BLE.

This SDK mirrors the SensWear Python SDK and uses `react-native-ble-plx` for BLE access. It supports:

- Discovering and connecting to SensWear devices advertising as `Sens Wear ...`, `SensWear ...`, or `SenseWear ...`.
- Reading and subscribing to the battery gauge characteristic.
- Reading and subscribing to charger state.
- Reading and writing the RGBW LED color characteristic.
- Subscribing to IMU quaternion and linear acceleration notifications.
- Reading, configuring, and subscribing to temperature notifications.
- Writing haptic vibration patterns.

## Install

```sh
npm install senswear react-native-ble-plx
```

Follow the `react-native-ble-plx` iOS, Android, and permission setup for your app. The SDK does not request Bluetooth permissions for you.

## Basic usage

```ts
import { BleManager } from "react-native-ble-plx";
import { SenswearClient } from "senswear";

const manager = new BleManager();
const device = new SenswearClient(null, { manager });

await device.connect();

const battery = await device.battery.read();
console.log(`Battery: ${battery.stateOfChargePercent.toFixed(1)}%`);
console.log(`Voltage: ${battery.voltageMv} mV`);

await device.disconnect();
```

To connect to a known BLE device id or exact advertised name:

```ts
const device = new SenswearClient("Sens Wear (Regulator)", { manager });
await device.connect();
```

## Discovery

```ts
import { SenswearClient } from "senswear";

const devices = await SenswearClient.discover({ timeoutMs: 5000 });
for (const device of devices) {
  console.log(device.id, device.name, device.rssi);
}
```

If you already own a `BleManager`, pass it to avoid creating a short-lived manager:

```ts
const devices = await SenswearClient.discover({ manager });
```

## Battery gauge

```ts
const state = await device.battery.read();
console.log(state.temperatureC);
console.log(state.stateOfChargePercent);

await device.battery.subscribe((sample) => {
  console.log(sample.toDict());
});

await device.battery.unsubscribe();
```

Battery raw fields match the firmware payload:

| SDK field | Unit |
| --- | --- |
| `temperatureDeciC` | 0.1 degrees Celsius |
| `voltageMv` | millivolts |
| `averageCurrentMa` | milliamps |
| `averagePowerMw` | milliwatts |
| `stateOfChargeDeciPercent` | 0.1 percent |
| `nominalAvailableCapacityMah` | mAh |
| `fullBatteryCapacityMah` | mAh |
| `remainingCapacityMah` | mAh |

Python-compatible snake_case aliases are also available, for example `state.state_of_charge_percent`.

## Charger

```ts
const state = await device.charger.read();
console.log(state.powerGood);
console.log(state.charging);
console.log(state.charged);
console.log(state.hasFault);
```

The charger payload is a 32-bit flags value. Convenience getters expose the firmware bits as booleans:

`buttonPressed`, `wake1`, `wake2`, `shipmentMode`, `shutdownMode`, `powerGood`, `charging`, `charged`, `thermalRegulation`, `batteryUvlo`, `thermalNormal`, `thermalWarmOrHot`, `thermalWarm`, `thermalCool`, `safetyTimerFault`, `thermalSystemFault`, `batteryUvloFault`, `batteryOcpFault`, and `hasFault`.

## LED

```ts
import { LedColor } from "senswear";

await device.led.set(new LedColor(255, 0, 0));
await device.led.set("#00ff00");
await device.led.set([0, 0, 255, 0]);
await device.led.set(0x000000ff);

const current = await device.led.read();
console.log(current.toHex({ includeWhite: true }));

await device.led.off();
```

The LED characteristic is a 4-byte little-endian RGBW value: red byte 0, green byte 1, blue byte 2, white byte 3.

## IMU

The IMU service is notify-only. Subscribing to either IMU characteristic enables firmware-side streaming.

```ts
await device.imu.subscribeQuaternion((sample) => {
  console.log(sample.toTuple());
  console.log(sample.accuracyDegrees);
});

await device.imu.subscribeLinearAcceleration((sample) => {
  console.log(sample.toTuple());
});

await device.imu.unsubscribeAll();
```

Quaternion values are raw signed Q14 with normalized getters `xFloat`, `yFloat`, `zFloat`, `wFloat`; accuracy is raw unsigned Q14 radians with `accuracyRadians` and `accuracyDegrees`.

Linear acceleration exposes raw `x`, `y`, `z` and scaled `xG`, `yG`, `zG` using `value / 4096.0`.

## Temperature

```ts
await device.temperature.setSamplingRateHz(2);

const latest = await device.temperature.read();
console.log(latest.temperatureC);

await device.temperature.subscribe((sample) => {
  console.log(sample.temperatureF);
});

await device.temperature.unsubscribe();
```

`setSamplingRateHz()` and `setTransferInterval()` write nonzero little-endian `uint16` values.

## Haptic

```ts
import { HapticFrame, HapticPattern } from "senswear";

await device.haptic.vibrate(150, 255);

const pattern = HapticPattern.fromFrames([
  new HapticFrame(80, 220),
  new HapticFrame(60, 0),
  new HapticFrame(120, 180),
]);

await device.haptic.play(pattern);
```

Pattern payload layout:

| Field | Format |
| --- | --- |
| `version` | byte, currently `1` |
| `flags` | byte, reserved, send `0` |
| `frame_count` | little-endian `uint16`, 1 to 64 |
| frame `duration_ms` | little-endian `uint16`, nonzero |
| frame `intensity` | byte, 0 to 255 |

An intensity of `0` acts as an off/pause frame.

## Development

```sh
npm install
npm test
npm run build
npm publish
```
