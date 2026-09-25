import { DeviceFeature, SenswearClient } from "senswear";

/** Call from a React Native app after obtaining Bluetooth permissions. */
export async function readDeviceInfo(deviceId: string): Promise<void> {
  const client = new SenswearClient(deviceId);
  try {
    await client.connect();
    const info = await client.deviceInfo.read();
    console.log("Firmware:", info.firmwareVersion);
    console.log("Firmware shields:", info.capabilities.shields);
    console.log("PPG supported:", info.capabilities.hasFeature(DeviceFeature.Ppg));
  } finally {
    await client.destroy();
  }
}
