import { assertLength, bytesFrom, dataView, readUint32LE } from "../binary";
import { POWER_CHARGER_STATE_UUID } from "../uuids";
import type { GattClient, MaybePromise } from "./shared";
import { invokeCallback } from "./shared";

export const CHARGER_STATE_LENGTH = 4;

export interface ChargerStateDict {
  flags: number;
  button_pressed: boolean;
  wake1: boolean;
  wake2: boolean;
  shipment_mode: boolean;
  shutdown_mode: boolean;
  power_good: boolean;
  charging: boolean;
  charged: boolean;
  thermal_regulation: boolean;
  battery_uvlo: boolean;
  thermal_normal: boolean;
  thermal_warm_or_hot: boolean;
  thermal_warm: boolean;
  thermal_cool: boolean;
  safety_timer_fault: boolean;
  thermal_system_fault: boolean;
  battery_uvlo_fault: boolean;
  battery_ocp_fault: boolean;
  has_fault: boolean;
}

export class ChargerState {
  constructor(readonly flags: number) {}

  static fromBytes(payload: Uint8Array | ArrayBuffer | ArrayBufferView | readonly number[]): ChargerState {
    const bytes = bytesFrom(payload);
    assertLength(bytes, CHARGER_STATE_LENGTH, "Charger");
    return new ChargerState(readUint32LE(dataView(bytes), 0));
  }

  get buttonPressed(): boolean {
    return this.bit(0);
  }

  get wake1(): boolean {
    return this.bit(1);
  }

  get wake2(): boolean {
    return this.bit(2);
  }

  get shipmentMode(): boolean {
    return this.bit(3);
  }

  get shutdownMode(): boolean {
    return this.bit(4);
  }

  get powerGood(): boolean {
    return this.bit(5);
  }

  get charging(): boolean {
    return this.bit(6);
  }

  get charged(): boolean {
    return this.bit(7);
  }

  get thermalRegulation(): boolean {
    return this.bit(8);
  }

  get batteryUvlo(): boolean {
    return this.bit(9);
  }

  get thermalNormal(): boolean {
    return this.bit(10);
  }

  get thermalWarmOrHot(): boolean {
    return this.bit(11);
  }

  get thermalWarm(): boolean {
    return this.bit(12);
  }

  get thermalCool(): boolean {
    return this.bit(13);
  }

  get safetyTimerFault(): boolean {
    return this.bit(14);
  }

  get thermalSystemFault(): boolean {
    return this.bit(15);
  }

  get batteryUvloFault(): boolean {
    return this.bit(16);
  }

  get batteryOcpFault(): boolean {
    return this.bit(17);
  }

  get hasFault(): boolean {
    return this.safetyTimerFault || this.thermalSystemFault || this.batteryUvloFault || this.batteryOcpFault;
  }

  get isZeroState(): boolean {
    return this.flags === 0;
  }

  get button_pressed(): boolean {
    return this.buttonPressed;
  }

  get shipment_mode(): boolean {
    return this.shipmentMode;
  }

  get shutdown_mode(): boolean {
    return this.shutdownMode;
  }

  get power_good(): boolean {
    return this.powerGood;
  }

  get thermal_regulation(): boolean {
    return this.thermalRegulation;
  }

  get battery_uvlo(): boolean {
    return this.batteryUvlo;
  }

  get thermal_normal(): boolean {
    return this.thermalNormal;
  }

  get thermal_warm_or_hot(): boolean {
    return this.thermalWarmOrHot;
  }

  get thermal_warm(): boolean {
    return this.thermalWarm;
  }

  get thermal_cool(): boolean {
    return this.thermalCool;
  }

  get safety_timer_fault(): boolean {
    return this.safetyTimerFault;
  }

  get thermal_system_fault(): boolean {
    return this.thermalSystemFault;
  }

  get battery_uvlo_fault(): boolean {
    return this.batteryUvloFault;
  }

  get battery_ocp_fault(): boolean {
    return this.batteryOcpFault;
  }

  get has_fault(): boolean {
    return this.hasFault;
  }

  get is_zero_state(): boolean {
    return this.isZeroState;
  }

  toDict(): ChargerStateDict {
    return {
      flags: this.flags,
      button_pressed: this.buttonPressed,
      wake1: this.wake1,
      wake2: this.wake2,
      shipment_mode: this.shipmentMode,
      shutdown_mode: this.shutdownMode,
      power_good: this.powerGood,
      charging: this.charging,
      charged: this.charged,
      thermal_regulation: this.thermalRegulation,
      battery_uvlo: this.batteryUvlo,
      thermal_normal: this.thermalNormal,
      thermal_warm_or_hot: this.thermalWarmOrHot,
      thermal_warm: this.thermalWarm,
      thermal_cool: this.thermalCool,
      safety_timer_fault: this.safetyTimerFault,
      thermal_system_fault: this.thermalSystemFault,
      battery_uvlo_fault: this.batteryUvloFault,
      battery_ocp_fault: this.batteryOcpFault,
      has_fault: this.hasFault,
    };
  }

  to_dict(): ChargerStateDict {
    return this.toDict();
  }

  private bit(bit: number): boolean {
    return Boolean(this.flags & (1 << bit));
  }
}

export type ChargerStateCallback = (state: ChargerState) => MaybePromise<void>;

export class ChargerModule {
  readonly characteristicUuid = POWER_CHARGER_STATE_UUID;

  constructor(private readonly client: GattClient) {}

  async read(): Promise<ChargerState> {
    const payload = await this.client.readGattChar(this.characteristicUuid);
    return ChargerState.fromBytes(payload);
  }

  async subscribe(callback: ChargerStateCallback): Promise<void> {
    await this.unsubscribe();
    await this.client.startNotify(this.characteristicUuid, (_sender, data) => {
      invokeCallback(callback, ChargerState.fromBytes(data));
    });
  }

  async unsubscribe(): Promise<void> {
    await this.client.stopNotify(this.characteristicUuid);
  }
}
