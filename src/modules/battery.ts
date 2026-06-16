import { assertLength, bytesFrom, dataView, readInt16LE, readUint16LE } from "../binary";
import { POWER_GAUGE_STATE_UUID } from "../uuids";
import type { GattClient, MaybePromise } from "./shared";
import { invokeCallback } from "./shared";

export const GAUGE_STATE_LENGTH = 16;

export interface BatteryGaugeDict {
  temperature_deci_c: number;
  voltage_mv: number;
  average_current_ma: number;
  average_power_mw: number;
  state_of_charge_deci_percent: number;
  nominal_available_capacity_mah: number;
  full_battery_capacity_mah: number;
  remaining_capacity_mah: number;
}

export class BatteryGaugeState {
  readonly temperatureDeciC: number;
  readonly voltageMv: number;
  readonly averageCurrentMa: number;
  readonly averagePowerMw: number;
  readonly stateOfChargeDeciPercent: number;
  readonly nominalAvailableCapacityMah: number;
  readonly fullBatteryCapacityMah: number;
  readonly remainingCapacityMah: number;

  constructor(fields: {
    temperatureDeciC: number;
    voltageMv: number;
    averageCurrentMa: number;
    averagePowerMw: number;
    stateOfChargeDeciPercent: number;
    nominalAvailableCapacityMah: number;
    fullBatteryCapacityMah: number;
    remainingCapacityMah: number;
  }) {
    this.temperatureDeciC = fields.temperatureDeciC;
    this.voltageMv = fields.voltageMv;
    this.averageCurrentMa = fields.averageCurrentMa;
    this.averagePowerMw = fields.averagePowerMw;
    this.stateOfChargeDeciPercent = fields.stateOfChargeDeciPercent;
    this.nominalAvailableCapacityMah = fields.nominalAvailableCapacityMah;
    this.fullBatteryCapacityMah = fields.fullBatteryCapacityMah;
    this.remainingCapacityMah = fields.remainingCapacityMah;
  }

  static fromBytes(payload: Uint8Array | ArrayBuffer | ArrayBufferView | readonly number[]): BatteryGaugeState {
    const bytes = bytesFrom(payload);
    assertLength(bytes, GAUGE_STATE_LENGTH, "Battery gauge");
    const view = dataView(bytes);
    return new BatteryGaugeState({
      temperatureDeciC: readInt16LE(view, 0),
      voltageMv: readUint16LE(view, 2),
      averageCurrentMa: readInt16LE(view, 4),
      averagePowerMw: readInt16LE(view, 6),
      stateOfChargeDeciPercent: readUint16LE(view, 8),
      nominalAvailableCapacityMah: readUint16LE(view, 10),
      fullBatteryCapacityMah: readUint16LE(view, 12),
      remainingCapacityMah: readUint16LE(view, 14),
    });
  }

  get temperatureC(): number {
    return this.temperatureDeciC / 10.0;
  }

  get stateOfChargePercent(): number {
    return this.stateOfChargeDeciPercent / 10.0;
  }

  get isZeroState(): boolean {
    return Object.values(this.toDict()).every((value) => value === 0);
  }

  get temperature_deci_c(): number {
    return this.temperatureDeciC;
  }

  get voltage_mv(): number {
    return this.voltageMv;
  }

  get average_current_ma(): number {
    return this.averageCurrentMa;
  }

  get average_power_mw(): number {
    return this.averagePowerMw;
  }

  get state_of_charge_deci_percent(): number {
    return this.stateOfChargeDeciPercent;
  }

  get nominal_available_capacity_mah(): number {
    return this.nominalAvailableCapacityMah;
  }

  get full_battery_capacity_mah(): number {
    return this.fullBatteryCapacityMah;
  }

  get remaining_capacity_mah(): number {
    return this.remainingCapacityMah;
  }

  get temperature_c(): number {
    return this.temperatureC;
  }

  get state_of_charge_percent(): number {
    return this.stateOfChargePercent;
  }

  get is_zero_state(): boolean {
    return this.isZeroState;
  }

  toDict(): BatteryGaugeDict {
    return {
      temperature_deci_c: this.temperatureDeciC,
      voltage_mv: this.voltageMv,
      average_current_ma: this.averageCurrentMa,
      average_power_mw: this.averagePowerMw,
      state_of_charge_deci_percent: this.stateOfChargeDeciPercent,
      nominal_available_capacity_mah: this.nominalAvailableCapacityMah,
      full_battery_capacity_mah: this.fullBatteryCapacityMah,
      remaining_capacity_mah: this.remainingCapacityMah,
    };
  }

  to_dict(): BatteryGaugeDict {
    return this.toDict();
  }
}

export type BatteryGaugeCallback = (state: BatteryGaugeState) => MaybePromise<void>;

export class BatteryGaugeModule {
  readonly characteristicUuid = POWER_GAUGE_STATE_UUID;

  constructor(private readonly client: GattClient) {}

  async read(): Promise<BatteryGaugeState> {
    const payload = await this.client.readGattChar(this.characteristicUuid);
    return BatteryGaugeState.fromBytes(payload);
  }

  async subscribe(callback: BatteryGaugeCallback): Promise<void> {
    await this.unsubscribe();
    await this.client.startNotify(this.characteristicUuid, (_sender, data) => {
      invokeCallback(callback, BatteryGaugeState.fromBytes(data));
    });
  }

  async unsubscribe(): Promise<void> {
    await this.client.stopNotify(this.characteristicUuid);
  }
}
