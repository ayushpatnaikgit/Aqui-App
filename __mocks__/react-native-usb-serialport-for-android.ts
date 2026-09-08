/**
 * Jest manual mock for react-native-usb-serialport-for-android 0.5.0.
 *
 * Applied automatically (root-level __mocks__ next to node_modules). It mirrors
 * the behaviour the app depends on:
 *  - the manager exposes only list / tryRequestPermission / hasPermission / open
 *  - tryRequestPermission resolves false after "showing a dialog" when not granted
 *  - open() rejects with the library's permission_denied / device_not_found codes
 *  - native open() on an already-open device resolves and hands out a fresh
 *    UsbSerial object (so a naive caller can leak listeners)
 *  - every onReceived adds one emitter listener; close() removes that port's
 *
 * Tests drive it through the `__fake` export.
 */
type Listener = (e: { deviceId: number; data: string }) => void;

interface FakeDevice {
  deviceId: number;
  vendorId: number;
  productId: number;
}

export const __fake = {
  devices: [] as FakeDevice[],
  permitted: new Set<number>(),
  open: new Set<number>(),
  listeners: [] as Listener[],
  calls: {
    list: 0,
    tryRequestPermission: 0,
    hasPermission: 0,
    open: 0,
    close: 0,
    dialogs: 0,
    send: [] as string[],
  },
  emit(deviceId: number, hex: string) {
    for (const l of [...__fake.listeners]) {
      l({ deviceId, data: hex });
    }
  },
  reset() {
    __fake.devices = [];
    __fake.permitted = new Set();
    __fake.open = new Set();
    __fake.listeners = [];
    __fake.calls = { list: 0, tryRequestPermission: 0, hasPermission: 0, open: 0, close: 0, dialogs: 0, send: [] };
  },
};

const err = (code: string) => Object.assign(new Error(code), { code });
const has = (id: number) => __fake.devices.some(d => d.deviceId === id);

export class UsbSerial {
  deviceId: number;
  private subs: Listener[] = [];

  constructor(deviceId: number) {
    this.deviceId = deviceId;
  }

  onReceived(listener: Listener) {
    const proxy: Listener = e => {
      if (e.deviceId === this.deviceId && e.data) {
        listener(e);
      }
    };
    this.subs.push(proxy);
    __fake.listeners.push(proxy);
    return {
      remove: () => {
        const i = __fake.listeners.indexOf(proxy);
        if (i >= 0) {
          __fake.listeners.splice(i, 1);
        }
      },
    };
  }

  send(hex: string): Promise<null> {
    __fake.calls.send.push(hex);
    return Promise.resolve(null);
  }

  close(): Promise<null> {
    for (const p of this.subs) {
      const i = __fake.listeners.indexOf(p);
      if (i >= 0) {
        __fake.listeners.splice(i, 1);
      }
    }
    __fake.calls.close++;
    if (!__fake.open.has(this.deviceId)) {
      return Promise.reject(err('device_not_open_or_closed'));
    }
    __fake.open.delete(this.deviceId);
    return Promise.resolve(null);
  }
}

export const Parity = { None: 0, Odd: 1, Even: 2, Mark: 3, Space: 4 };

export const Codes = {
  DEVICE_NOT_FOND: 'device_not_found',
  DRIVER_NOT_FOND: 'driver_not_found',
  NOT_ENOUGH_PORTS: 'not_enough_ports',
  PERMISSION_DENIED: 'permission_denied',
  OPEN_FAILED: 'open_failed',
  DEVICE_NOT_OPEN: 'device_not_open',
  SEND_FAILED: 'send_failed',
  DEVICE_NOT_OPEN_OR_CLOSED: 'device_not_open_or_closed',
};

export const UsbSerialManager = {
  async list() {
    __fake.calls.list++;
    return __fake.devices.map(d => ({ ...d }));
  },
  async tryRequestPermission(id: number) {
    __fake.calls.tryRequestPermission++;
    if (!has(id)) {
      throw err('device_not_found');
    }
    if (__fake.permitted.has(id)) {
      return true;
    }
    __fake.calls.dialogs++;
    return false;
  },
  async hasPermission(id: number) {
    __fake.calls.hasPermission++;
    if (!has(id)) {
      throw err('device_not_found');
    }
    return __fake.permitted.has(id);
  },
  async open(id: number) {
    __fake.calls.open++;
    if (__fake.open.has(id)) {
      return new UsbSerial(id);
    }
    if (!has(id)) {
      throw err('device_not_found');
    }
    if (!__fake.permitted.has(id)) {
      throw err('permission_denied');
    }
    __fake.open.add(id);
    return new UsbSerial(id);
  },
};
