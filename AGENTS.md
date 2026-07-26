# AGENTS.md

## Project overview

This is the SensWear TypeScript SDK for React Native. It wraps `react-native-ble-plx` and
provides typed discovery, connection, GATT modules, binary parsers, and output encoders.
TypeScript is strict and compiled to CommonJS declarations/JavaScript in `dist/`.

Firmware Bluetooth services are the wire-protocol source of truth. The Python SDK should remain
semantically equivalent, and the mobile app consumes this package.

## Repository map

- `src/client.ts`: BLE manager ownership, discovery, connection, GATT operations, subscriptions.
- `src/uuids.ts`: UUID constants and characteristic-to-service registry.
- `src/binary.ts`: byte normalization, endian reads/writes, and base64 conversion.
- `src/modules/`: typed service models and module APIs.
- `src/index.ts` and `src/modules/index.ts`: public exports.
- `tests/protocol.test.ts`: exact payload parsing/encoding and registry coverage.
- `tests/modules.test.ts`: module routing, reads, writes, configuration, and callbacks.
- `dist/`: generated build output; never hand-edit.

## Setup and commands

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Use `npm install` instead of `npm ci` only when intentionally changing dependencies and the
lockfile. Node.js 18+ is required.

Focused test:

```sh
npx vitest run tests/protocol.test.ts
```

Do not publish the package or connect to physical hardware unless explicitly requested.

## TypeScript conventions

- Keep strict typing; do not solve errors with broad `any`, unchecked casts, or disabled rules.
- Use two-space indentation, double quotes, semicolons, and the existing import style.
- Use `import type` for type-only imports.
- Keep transport-independent parsing in data classes and GATT routing in module classes.
- Validate exact payload lengths with `ProtocolError`.
- Validate caller input before writes using `TypeError` or `RangeError`.
- Preserve exact 64-bit timestamps as `bigint`; a `Date` may be a lossy convenience only.
- Avoid bigint literals because the current compilation target is ES2019; use `BigInt(...)`.
- Export public additions from module and root barrel files.
- Keep the client responsible for subscription cleanup and BLE manager ownership.

## Bluetooth protocol changes

Inspect the corresponding implementation in the firmware repository's `src/bluetooth/`; do not
copy assumptions from an older SDK.

For a new or changed endpoint:

1. Add/update service and characteristic UUID constants.
2. Register every characteristic in `serviceUuidForCharacteristic`.
3. Implement a typed parser/encoder with explicit lengths, offsets, units, enums, and validation.
4. Add module read/write/subscribe/unsubscribe APIs and expose the module on `SenswearClient`.
5. Export all intended public types.
6. Test valid layouts, malformed payloads, boundaries, write bytes, callbacks, and endpoint
   routing.
7. Update README API examples, semantic meanings, wire tables, defaults, ordering constraints,
   limitations, and migration notes.
8. Update package version for a public compatibility change.

Keep UUIDs, binary layouts, ranges, units, and limits aligned with the Python SDK. Preserve
firmware distinctions such as notify versus indicate, raw versus derived data, and sampling
frequency versus delivery/drain cadence.

## Tests and build expectations

- Parser tests must construct exact firmware byte arrays, including ABI padding.
- Module tests use a fake `GattClient`; they must not require native React Native BLE bindings.
- The endpoint registry test must include every current characteristic.
- Run the full test suite after changes to binary helpers, UUIDs, exports, or client lifecycle.
- Run both `typecheck` and `build`; declaration generation catches public API problems that
  runtime tests can miss.

## Mobile app packaging

The mobile app vendors a packed copy of this SDK. After an SDK change that must be consumed by
the app:

```powershell
npm.cmd run build
npm.cmd pack . --pack-destination C:\SenswearMobileApp\vendor
```

Then update the app's `package.json`/lockfile and reinstall its `file:vendor/...tgz` dependency.
Do not make the app depend on an external junction: Metro may not resolve it. Keep the vendored
tarball version synchronized with this package version.

## Documentation rules

For each field, document type, byte offset, unit, range, scale, enum meaning, timestamp
epoch/unit, and whether it is raw or converted. Explicitly document firmware behavior such as
rounding and configuration ordering. Raw PPG is not heart rate/SpO2. Do not assign physical
units to raw gyroscope values without a firmware-declared scale.

## Repository hygiene

- Do not edit `node_modules/` or `dist/` by hand.
- Preserve unrelated working-tree changes.
- Avoid dependency updates unless required by the task.
- Run `git diff --check` before handoff.

## Completion checklist

- `npm run typecheck`, `npm test`, and `npm run build` pass.
- Public exports and endpoint registry are complete.
- README and tests match firmware.
- Python SDK and mobile vendored package are synchronized when in scope.
