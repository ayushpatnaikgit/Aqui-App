import React from 'react';
import { Platform } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import useUsbSerial from '../src/hooks/useUsbSerial';

// The library is replaced by the manual mock in __mocks__/ (applied automatically).
import * as usbSerialLib from 'react-native-usb-serialport-for-android';

const { __fake: fake } = usbSerialLib as unknown as typeof import('../__mocks__/react-native-usb-serialport-for-android');

type Hook = ReturnType<typeof useUsbSerial>;
let hook: Hook;
const logs: string[] = [];

function Harness() {
  hook = useUsbSerial(m => logs.push(m));
  return null;
}

const CH340 = { vendorId: 6790, productId: 29987 };
const FRAME_A = 'AAC0F2007E01565118AB'; // 24.2 / 38.2
const FRAME_B = 'AAC0F3006D01565108AB'; // 24.3 / 36.5

const flush = async () => {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
};
const advance = (ms: number) =>
  ReactTestRenderer.act(async () => {
    // step so every poll tick gets its promises flushed before the next fires
    let left = ms;
    while (left > 0) {
      const step = Math.min(left, 1000);
      jest.advanceTimersByTime(step);
      left -= step;
      await flush();
    }
  });

let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
const mount = async () => {
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
    await flush();
  });
};
const unmount = async () => {
  await ReactTestRenderer.act(async () => {
    renderer?.unmount();
    await flush();
  });
  renderer = null;
};

beforeAll(() => {
  Object.defineProperty(Platform, 'OS', { get: () => 'android', configurable: true });
});

beforeEach(() => {
  jest.useFakeTimers();
  fake.reset();
  logs.length = 0;
});

afterEach(async () => {
  if (renderer) {
    await unmount();
  }
  jest.useRealTimers();
});

describe('useUsbSerial', () => {
  it('connects once to a permitted device and never reconnects while it stays connected', async () => {
    fake.devices = [{ deviceId: 1001, ...CH340 }];
    fake.permitted.add(1001);
    await mount();

    expect(hook.connected).toBe(true);
    expect(hook.currentDevice).toBe(1001);
    expect(fake.calls.open).toBe(1);
    expect(fake.listeners).toHaveLength(1);

    // a live sensor reports every second; emit every 5 s for 30 s
    for (let i = 0; i < 6; i++) {
      await advance(5000);
      await ReactTestRenderer.act(async () => {
        fake.emit(1001, FRAME_A);
        await flush();
      });
    }

    expect(fake.calls.open).toBe(1);
    expect(fake.calls.close).toBe(0);
    expect(fake.listeners).toHaveLength(1);
    expect(fake.calls.list).toBeGreaterThanOrEqual(10); // still polling for unplug
    expect(logs.filter(l => l.startsWith('Connected to device'))).toHaveLength(1);
    expect(logs.filter(l => l.startsWith('Reading:'))).toHaveLength(6);
  });

  it('waits for the permission dialog instead of failing, and does not stack dialogs', async () => {
    fake.devices = [{ deviceId: 1001, ...CH340 }];
    await mount();

    expect(fake.calls.dialogs).toBe(1);
    expect(fake.calls.open).toBe(0);
    expect(hook.status).toBe('waiting-permission');

    await advance(5000);
    expect(fake.calls.dialogs).toBe(1); // polled hasPermission silently
    expect(fake.calls.hasPermission).toBeGreaterThan(0);
    expect(fake.calls.open).toBe(0);

    fake.permitted.add(1001); // user taps Allow
    await advance(1000);

    expect(fake.calls.open).toBe(1);
    expect(hook.connected).toBe(true);
    expect(fake.listeners).toHaveLength(1);
  });

  it('reassembles split frames, handles coalesced frames, and ignores garbage', async () => {
    fake.devices = [{ deviceId: 1001, ...CH340 }];
    fake.permitted.add(1001);
    await mount();

    await ReactTestRenderer.act(async () => {
      fake.emit(1001, FRAME_A.slice(0, 8));
      await flush();
    });
    expect(hook.latestPM25).toBeNull();

    await ReactTestRenderer.act(async () => {
      fake.emit(1001, FRAME_A.slice(8));
      await flush();
    });
    expect(hook.latestPM25).toBe(24.2);
    expect(hook.latestPM10).toBe(38.2);
    expect(hook.latestPacketType).toBe('standard');

    await ReactTestRenderer.act(async () => {
      fake.emit(1001, FRAME_B + FRAME_A);
      await flush();
    });
    expect(hook.latestPM25).toBe(24.2); // last of the two
    expect(logs.filter(l => l.startsWith('Reading:'))).toHaveLength(3);

    await ReactTestRenderer.act(async () => {
      fake.emit(1001, '01020500070000000000'); // 10 bytes, small values, no markers
      await flush();
    });
    expect(logs.filter(l => l.startsWith('Reading:'))).toHaveLength(3);
    expect(hook.latestPM25).toBe(24.2);
  });

  it('notices an unplug, closes the port, and reconnects to the re-plugged device', async () => {
    fake.devices = [{ deviceId: 1001, ...CH340 }];
    fake.permitted.add(1001);
    await mount();
    expect(hook.connected).toBe(true);

    // unplug: the native reader dies silently; only list() reflects it
    fake.devices = [];
    fake.open.clear();
    await advance(2000);

    expect(hook.connected).toBe(false);
    expect(hook.currentDevice).toBeNull();
    expect(fake.calls.close).toBe(1);
    expect(fake.listeners).toHaveLength(0);
    expect(logs).toContain('USB device detached');

    // re-plug: Android hands out a new id
    fake.devices = [{ deviceId: 1002, ...CH340 }];
    fake.permitted.add(1002);
    await advance(2000);

    expect(hook.connected).toBe(true);
    expect(hook.currentDevice).toBe(1002);
    expect(fake.calls.open).toBe(2);
    expect(fake.listeners).toHaveLength(1);
  });

  it('reconnects when the sensor goes silent', async () => {
    fake.devices = [{ deviceId: 1001, ...CH340 }];
    fake.permitted.add(1001);
    await mount();

    await advance(10000);
    await ReactTestRenderer.act(async () => {
      fake.emit(1001, FRAME_A);
      await flush();
    });
    await advance(10000);
    expect(fake.calls.open).toBe(1); // data 10 s ago: not stale yet

    await advance(8000);
    expect(fake.calls.close).toBe(1);
    expect(fake.calls.open).toBe(2);
    expect(hook.connected).toBe(true);
    expect(fake.listeners).toHaveLength(1);
  });

  it('does not undo a manual disconnect on the next poll', async () => {
    fake.devices = [{ deviceId: 1001, ...CH340 }];
    fake.permitted.add(1001);
    await mount();

    await ReactTestRenderer.act(async () => {
      await hook.disconnectDevice();
      await flush();
    });
    expect(hook.connected).toBe(false);
    expect(fake.calls.close).toBe(1);

    await advance(6000);
    expect(fake.calls.open).toBe(1);
    expect(hook.connected).toBe(false);

    await ReactTestRenderer.act(async () => {
      await hook.connectDevice(1001);
      await flush();
    });
    expect(hook.connected).toBe(true);
    expect(fake.calls.open).toBe(2);
  });

  it('sends a correctly framed command as a hex string', async () => {
    fake.devices = [{ deviceId: 1001, ...CH340 }];
    fake.permitted.add(1001);
    await mount();

    await ReactTestRenderer.act(async () => {
      await hook.sendCommand('version');
    });
    expect(fake.calls.send).toEqual(['AAB407000000000000000000000000FFFF05AB']);
  });

  it('closes the port and removes the listener on unmount', async () => {
    fake.devices = [{ deviceId: 1001, ...CH340 }];
    fake.permitted.add(1001);
    await mount();
    expect(fake.listeners).toHaveLength(1);

    await unmount();

    expect(fake.calls.close).toBe(1);
    expect(fake.listeners).toHaveLength(0);
    await advance(10000); // nothing keeps running
    expect(fake.calls.open).toBe(1);
  });
});
