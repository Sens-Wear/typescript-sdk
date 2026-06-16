export { SenswearClient, DEFAULT_NAME_PREFIXES } from "./client";
export type { DiscoveredDevice, SenswearClientOptions, SenswearDiscoveryOptions } from "./client";
export {
  DeviceNotFoundError,
  NotConnectedError,
  ProtocolError,
  SenswearError,
} from "./errors";
export * from "./modules";
export * from "./uuids";
