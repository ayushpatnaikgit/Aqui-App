import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import { UsbSerialManager, Parity } from 'react-native-usb-serialport-for-android';
import { ByteUtils, SensorCommands, SensorPacket } from '../utils/sensorUtils';

/**
 * Interface for device information
 */
export interface Device {
  deviceId: number;
  vendorId?: number;
  productId?: number;
  productName?: string;
  manufacturer?: string;
}

export type ConnectionStatus =
  | 'idle'
  | 'no-device'
  | 'waiting-permission'
  | 'connecting'
  | 'connected';

export interface Reading {
  pm25: number;
  pm10: number;
  packetType: 'standard';
  timestamp: number;
}

/**
 * The subset of the library's UsbSerial object that this hook relies on.
 * (react-native-usb-serialport-for-android 0.5.0 exposes only these three.)
 */
interface SerialPort {
  send(hexStr: string): Promise<unknown>;
  onReceived(listener: (event: { deviceId: number; data: string }) => void): { remove: () => void };
  close(): Promise<unknown>;
}

/**
 * The library has no attach/detach events, so device presence is polled.
 * The sensor reports once per second in active mode.
 */
const POLL_INTERVAL_MS = 2000;
const PERMISSION_RETRY_MS = 1000;
const PERMISSION_REASK_MS = 30000;
const CONNECT_RETRY_MS = 3000;
const DATA_STALE_MS = 15000;
const RX_BUFFER_LIMIT = 64;

/**
 * Everything the async machinery needs lives here, not in React state, so
 * timers and native callbacks always observe the current values rather than
 * the values of the render that created them.
 */
interface Session {
  port: SerialPort | null;
  subscription: { remove: () => void } | null;
  deviceId: number | null;
  connecting: boolean;
  polling: boolean;
  rxBuffer: number[];
  lastDataAt: number;
  staleWarned: boolean;
  permissionAskedFor: number | null;
  permissionAskedAt: number;
  suppressAutoConnectFor: number | null;
  lastDeviceCount: number;
  pollTimer: ReturnType<typeof setInterval> | null;
  retryTimer: ReturnType<typeof setTimeout> | null;
  autoConnect: boolean;
  autoRefresh: boolean;
  unmounted: boolean;
}

const sameDevices = (a: Device[], b: Device[]): boolean =>
  a.length === b.length && a.every((d, i) => d.deviceId === b[i].deviceId);

/**
 * Hook for interacting with the SDS011/SDS021 sensor over USB serial.
 */
export const useUsbSerial = (onLog?: (message: string) => void) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [currentDevice, setCurrentDevice] = useState<number | null>(null);
  const [latest, setLatest] = useState<Reading | null>(null);
  const [config, setConfig] = useState({ autoConnect: true, autoRefresh: true });

  const session = useRef<Session>({
    port: null,
    subscription: null,
    deviceId: null,
    connecting: false,
    polling: false,
    rxBuffer: [],
    lastDataAt: 0,
    staleWarned: false,
    permissionAskedFor: null,
    permissionAskedAt: 0,
    suppressAutoConnectFor: null,
    lastDeviceCount: -1,
    pollTimer: null,
    retryTimer: null,
    autoConnect: true,
    autoRefresh: true,
    unmounted: false,
  });

  // Keep the latest logger without making every callback depend on it.
  const onLogRef = useRef(onLog);
  useEffect(() => {
    onLogRef.current = onLog;
  }, [onLog]);

  const log = useCallback((message: string) => {
    if (onLogRef.current) {
      onLogRef.current(message);
    }
  }, []);

  /**
   * Parse incoming bytes. Chunks are reassembled so frames split across
   * reads, or several frames in one read, are all handled.
   */
  const handleData = useCallback(
    (event: { deviceId: number; data: string }) => {
      const s = session.current;
      if (!event || typeof event.data !== 'string' || event.data.length === 0) {
        return;
      }
      s.lastDataAt = Date.now();
      s.staleWarned = false;

      const incoming = ByteUtils.fromHexString(event.data);
      const { frames, rest } = SensorPacket.extractFrames(s.rxBuffer.concat(incoming));
      s.rxBuffer = rest.length > RX_BUFFER_LIMIT ? rest.slice(-RX_BUFFER_LIMIT) : rest;

      for (const frame of frames) {
        if (frame[1] === SensorPacket.TYPE_REPLY) {
          log(`Sensor reply: ${ByteUtils.toHexString(frame)}`);
          continue;
        }
        const values = SensorPacket.extractValues(frame);
        if (!values) {
          continue;
        }
        const reading: Reading = {
          pm25: values.pm25,
          pm10: values.pm10,
          packetType: 'standard',
          timestamp: Date.now(),
        };
        if (!s.unmounted) {
          setLatest(reading);
        }
        log(`Reading: PM2.5=${values.pm25.toFixed(1)}, PM10=${values.pm10.toFixed(1)}`);
      }
    },
    [log],
  );

  const clearRetry = useCallback(() => {
    const s = session.current;
    if (s.retryTimer) {
      clearTimeout(s.retryTimer);
      s.retryTimer = null;
    }
  }, []);

  /**
   * Close the port (if any) and reset connection state.
   */
  const disconnect = useCallback(
    async (reason?: string) => {
      const s = session.current;
      const { port, subscription, deviceId } = s;
      s.port = null;
      s.subscription = null;
      s.deviceId = null;
      s.rxBuffer = [];

      if (subscription) {
        try {
          subscription.remove();
        } catch (e) {
          // nothing to do
        }
      }
      if (port) {
        try {
          await port.close();
        } catch (e) {
          // Already closed natively (for example after an unplug); fine.
        }
      }
      if (!s.unmounted) {
        setCurrentDevice(null);
        setStatus('idle');
      }
      if (deviceId !== null) {
        log(reason ? `Disconnected from device ${deviceId} (${reason})` : `Disconnected from device ${deviceId}`);
      }
    },
    [log],
  );

  // Declared with a ref so connect/poll can call each other without
  // depending on declaration order.
  const pollRef = useRef<() => Promise<Device[]>>(async () => []);

  const scheduleRetry = useCallback(
    (delayMs: number) => {
      const s = session.current;
      clearRetry();
      s.retryTimer = setTimeout(() => {
        s.retryTimer = null;
        pollRef.current();
      }, delayMs);
    },
    [clearRetry],
  );

  /**
   * Connect to a device. Single-flight: concurrent calls are ignored.
   */
  const connect = useCallback(
    async (deviceId: number) => {
      const s = session.current;
      if (s.connecting || s.unmounted) {
        return;
      }
      if (s.port && s.deviceId === deviceId) {
        return;
      }
      s.connecting = true;
      try {
        if (s.port) {
          await disconnect('switching device');
        }
        setStatus('connecting');

        // tryRequestPermission resolves true when permission is already held.
        // When it is not, it shows the system dialog and resolves false at
        // once; open() would then fail, so wait and poll hasPermission instead
        // of stacking dialogs. Ask again only after a long pause.
        let granted: boolean;
        const askedRecently =
          s.permissionAskedFor === deviceId && Date.now() - s.permissionAskedAt < PERMISSION_REASK_MS;
        if (askedRecently) {
          granted = await UsbSerialManager.hasPermission(deviceId);
        } else {
          granted = await UsbSerialManager.tryRequestPermission(deviceId);
          if (!granted) {
            s.permissionAskedFor = deviceId;
            s.permissionAskedAt = Date.now();
            log('Waiting for USB permission...');
          }
        }
        if (!granted) {
          setStatus('waiting-permission');
          scheduleRetry(PERMISSION_RETRY_MS);
          return;
        }

        // SDS011/SDS021: 9600 8N1
        const port: SerialPort = await UsbSerialManager.open(deviceId, {
          baudRate: 9600,
          parity: Parity.None,
          stopBits: 1,
          dataBits: 8,
        });

        if (s.unmounted) {
          port.close().catch(() => undefined);
          return;
        }

        s.port = port;
        s.deviceId = deviceId;
        s.rxBuffer = [];
        s.lastDataAt = Date.now();
        s.staleWarned = false;
        s.permissionAskedFor = null;
        s.subscription = port.onReceived(handleData);

        setCurrentDevice(deviceId);
        setStatus('connected');
        log(`Connected to device ${deviceId}`);
      } catch (error: any) {
        const code = error && error.code;
        if (code === 'permission_denied') {
          setStatus('waiting-permission');
          log('Permission denied for USB device');
          scheduleRetry(PERMISSION_RETRY_MS);
        } else if (code === 'device_not_found') {
          setStatus('no-device');
          log('Device not found');
          scheduleRetry(CONNECT_RETRY_MS);
        } else {
          setStatus('idle');
          log(`Error connecting: ${error && error.message ? error.message : error}`);
          scheduleRetry(CONNECT_RETRY_MS);
        }
      } finally {
        s.connecting = false;
      }
    },
    [disconnect, handleData, log, scheduleRetry],
  );

  /**
   * One tick of the presence poll: refresh the device list, notice unplug or
   * silence, and auto-connect when appropriate. Also the manual "refresh".
   */
  const poll = useCallback(async (): Promise<Device[]> => {
    const s = session.current;
    if (s.unmounted || s.polling) {
      return [];
    }
    s.polling = true;
    try {
      let list: Device[] = [];
      try {
        list = (await UsbSerialManager.list()) || [];
      } catch (error) {
        log(`Error getting device list: ${error}`);
      }
      if (s.unmounted) {
        return list;
      }
      setDevices(prev => (sameDevices(prev, list) ? prev : list));
      if (list.length !== s.lastDeviceCount) {
        log(`Found ${list.length} device(s)`);
        s.lastDeviceCount = list.length;
      }

      if (s.port && s.deviceId !== null) {
        const stillPresent = list.some(d => d.deviceId === s.deviceId);
        if (!stillPresent) {
          log('USB device detached');
          await disconnect('device unplugged');
        } else if (Date.now() - s.lastDataAt > DATA_STALE_MS) {
          if (!s.staleWarned) {
            s.staleWarned = true;
            log('No data from sensor for 15 seconds, reconnecting');
          }
          await disconnect('no data');
        }
      }

      if (!s.port && !s.connecting) {
        const candidate = list.find(d => d.deviceId !== s.suppressAutoConnectFor);
        if (s.autoConnect && candidate) {
          await connect(candidate.deviceId);
        } else if (list.length === 0) {
          s.suppressAutoConnectFor = null;
          setStatus('no-device');
        }
      }
      return list;
    } finally {
      s.polling = false;
    }
  }, [connect, disconnect, log]);

  useEffect(() => {
    pollRef.current = poll;
  }, [poll]);

  const startPolling = useCallback(() => {
    const s = session.current;
    if (!s.pollTimer) {
      s.pollTimer = setInterval(() => {
        pollRef.current();
      }, POLL_INTERVAL_MS);
    }
  }, []);

  const stopPolling = useCallback(() => {
    const s = session.current;
    if (s.pollTimer) {
      clearInterval(s.pollTimer);
      s.pollTimer = null;
    }
  }, []);

  /**
   * Public API
   */
  const refreshDeviceList = useCallback((): Promise<Device[]> => pollRef.current(), []);

  const connectDevice = useCallback(
    async (deviceId: number) => {
      const s = session.current;
      s.suppressAutoConnectFor = null;
      s.permissionAskedFor = null; // a manual tap may ask for permission again
      await connect(deviceId);
    },
    [connect],
  );

  const disconnectDevice = useCallback(async () => {
    const s = session.current;
    // Do not let the next poll immediately reconnect to the device the user
    // just disconnected; re-plugging (new id) or a manual connect clears this.
    s.suppressAutoConnectFor = s.deviceId;
    clearRetry();
    await disconnect('requested');
  }, [clearRetry, disconnect]);

  const sendCommand = useCallback(
    async (command: string) => {
      const s = session.current;
      if (!s.port) {
        log('No device connected');
        return;
      }
      try {
        const bytes = SensorCommands.generate(command);
        const hex = ByteUtils.toHexStringCompact(bytes);
        log(`Sending command ${command}: ${ByteUtils.toHexString(bytes)}`);
        await s.port.send(hex);
      } catch (error) {
        log(`Error sending command: ${error}`);
      }
    },
    [log],
  );

  const toggleAutoConnect = useCallback(() => {
    const s = session.current;
    s.autoConnect = !s.autoConnect;
    s.suppressAutoConnectFor = null;
    log(`Auto-connect ${s.autoConnect ? 'enabled' : 'disabled'}`);
    setConfig(prev => ({ ...prev, autoConnect: s.autoConnect }));
    if (s.autoConnect) {
      pollRef.current();
    }
  }, [log]);

  const toggleAutoRefresh = useCallback(() => {
    const s = session.current;
    s.autoRefresh = !s.autoRefresh;
    log(`Auto-refresh ${s.autoRefresh ? 'enabled' : 'disabled'}`);
    setConfig(prev => ({ ...prev, autoRefresh: s.autoRefresh }));
    if (s.autoRefresh) {
      startPolling();
      pollRef.current();
    } else {
      stopPolling();
    }
  }, [log, startPolling, stopPolling]);

  /**
   * Start polling on mount, tear everything down on unmount.
   */
  useEffect(() => {
    if (Platform.OS !== 'android') {
      return undefined;
    }
    const s = session.current;
    s.unmounted = false;
    pollRef.current();
    if (s.autoRefresh) {
      startPolling();
    }

    return () => {
      s.unmounted = true;
      stopPolling();
      clearRetry();
      const { port, subscription } = s;
      s.port = null;
      s.subscription = null;
      s.deviceId = null;
      if (subscription) {
        try {
          subscription.remove();
        } catch (e) {
          // nothing to do
        }
      }
      if (port) {
        port.close().catch(() => undefined);
      }
    };
  }, [startPolling, stopPolling, clearRetry]);

  return {
    devices,
    status,
    connected: status === 'connected',
    currentDevice,
    latestPM25: latest ? latest.pm25 : null,
    latestPM10: latest ? latest.pm10 : null,
    latestPacketType: latest ? latest.packetType : null,
    latestTimestamp: latest ? latest.timestamp : null,
    autoConnect: config.autoConnect,
    autoRefresh: config.autoRefresh,
    refreshDeviceList,
    connectDevice,
    disconnectDevice,
    sendCommand,
    toggleAutoConnect,
    toggleAutoRefresh,
  };
};

export default useUsbSerial;
