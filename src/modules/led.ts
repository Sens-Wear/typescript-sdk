import { assertLength, bytesFrom, dataView, readUint32LE, writeUint32LE } from "../binary";
import { LED_COLOR_UUID } from "../uuids";
import type { GattClient } from "./shared";

export const LED_COLOR_LENGTH = 4;
const HEX_COLOR_RE = /^#?([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export type LedColorTuple = [number, number, number] | [number, number, number, number];
export type LedColorInput = LedColor | number | string | LedColorTuple | {
  red: number;
  green: number;
  blue: number;
  white?: number;
};

export interface LedColorDict {
  red: number;
  green: number;
  blue: number;
  white: number;
}

export class LedColor {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
  readonly white: number;

  constructor(red: number, green: number, blue: number, white = 0) {
    validateByte(red, "red");
    validateByte(green, "green");
    validateByte(blue, "blue");
    validateByte(white, "white");
    this.red = red;
    this.green = green;
    this.blue = blue;
    this.white = white;
  }

  static fromBytes(payload: Uint8Array | ArrayBuffer | ArrayBufferView | readonly number[]): LedColor {
    const bytes = bytesFrom(payload);
    assertLength(bytes, LED_COLOR_LENGTH, "LED color");
    return LedColor.fromInt(readUint32LE(dataView(bytes), 0));
  }

  static fromInt(color: number): LedColor {
    if (!Number.isInteger(color) || color < 0 || color > 0xffffffff) {
      throw new RangeError("color must be an integer between 0x00000000 and 0xffffffff.");
    }
    return new LedColor(
      color & 0xff,
      (color >>> 8) & 0xff,
      (color >>> 16) & 0xff,
      (color >>> 24) & 0xff,
    );
  }

  static fromHex(color: string): LedColor {
    const match = HEX_COLOR_RE.exec(color.trim());
    if (match === null) {
      throw new Error("color must be '#RRGGBB' or '#RRGGBBWW'.");
    }

    const value = match[1];
    return new LedColor(
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16),
      value.length === 8 ? Number.parseInt(value.slice(6, 8), 16) : 0,
    );
  }

  static coerce(color: LedColorInput): LedColor {
    if (color instanceof LedColor) {
      return color;
    }
    if (typeof color === "number") {
      return LedColor.fromInt(color);
    }
    if (typeof color === "string") {
      return LedColor.fromHex(color);
    }
    if (Array.isArray(color) && (color.length === 3 || color.length === 4)) {
      return new LedColor(color[0], color[1], color[2], color[3] ?? 0);
    }
    if (typeof color === "object" && color !== null) {
      return new LedColor(color.red, color.green, color.blue, color.white ?? 0);
    }
    throw new TypeError("color must be LedColor, int, '#RRGGBB', '#RRGGBBWW', a tuple, or an RGBW object.");
  }

  get isOff(): boolean {
    return this.toInt() === 0;
  }

  get is_off(): boolean {
    return this.isOff;
  }

  toInt(): number {
    return (this.red | (this.green << 8) | (this.blue << 16) | (this.white << 24)) >>> 0;
  }

  to_int(): number {
    return this.toInt();
  }

  toBytes(): Uint8Array {
    return writeUint32LE(this.toInt());
  }

  to_bytes(): Uint8Array {
    return this.toBytes();
  }

  toHex(options: { includeWhite?: boolean } = {}): string {
    const rgb = `#${toHexByte(this.red)}${toHexByte(this.green)}${toHexByte(this.blue)}`;
    return options.includeWhite ? `${rgb}${toHexByte(this.white)}` : rgb;
  }

  to_hex(options: { include_white?: boolean } = {}): string {
    return this.toHex({ includeWhite: options.include_white });
  }

  toDict(): LedColorDict {
    return {
      red: this.red,
      green: this.green,
      blue: this.blue,
      white: this.white,
    };
  }

  to_dict(): LedColorDict {
    return this.toDict();
  }
}

export class LedModule {
  readonly characteristicUuid = LED_COLOR_UUID;

  constructor(private readonly client: GattClient) {}

  async read(): Promise<LedColor> {
    const payload = await this.client.readGattChar(this.characteristicUuid);
    return LedColor.fromBytes(payload);
  }

  async set(color: LedColorInput, options: { response?: boolean } = {}): Promise<void> {
    const ledColor = LedColor.coerce(color);
    await this.client.writeGattChar(this.characteristicUuid, ledColor.toBytes(), {
      response: options.response ?? true,
    });
  }

  async setRgb(
    red: number,
    green: number,
    blue: number,
    options: { white?: number; response?: boolean } = {},
  ): Promise<void> {
    await this.set(new LedColor(red, green, blue, options.white ?? 0), { response: options.response ?? true });
  }

  async set_rgb(
    red: number,
    green: number,
    blue: number,
    options: { white?: number; response?: boolean } = {},
  ): Promise<void> {
    await this.setRgb(red, green, blue, options);
  }

  async off(options: { response?: boolean } = {}): Promise<void> {
    await this.set(new LedColor(0, 0, 0, 0), { response: options.response ?? true });
  }
}

function validateByte(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${name} must be an integer between 0 and 255.`);
  }
}

function toHexByte(value: number): string {
  return value.toString(16).padStart(2, "0");
}
