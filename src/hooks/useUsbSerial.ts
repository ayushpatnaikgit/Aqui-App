import { useState, useEffect, useCallback, useRef } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { UsbSerialManager, Parity } from 'react-native-usb-serialport-for-android';
import { SensorCommands, ByteUtils, SensorPacket } from '../utils/sensorUtils';

/**
 * Interface for device information
 */
export interface Device {
  deviceId: number;
  productName?: string;
  manufacturer?: string;
}

/**
 * Interface for USB Serial connection state
 */
interface ConnectionState {
  connected: boolean;
  currentDevice: number | null;
  serialport: any;
  subscription: any;
  latestPM25: number | null;
  latestPM10: number | null;
  latestPacketType: 'standard' | 'modified' | null;
  latestTimestamp: number | null;
}

/**
 * Configuration options for USB Serial behavior
 */
interface UsbSerialConfig {
  autoConnect: boolean;
  autoRefresh: boolean;
}

/**
 * Type for timer references
 */
interface TimerRefs {
  refresh: NodeJS.Timeout | null;
  reconnect: NodeJS.Timeout | null;
  connectionCheck: NodeJS.Timeout | null;
  reattachDelay: NodeJS.Timeout | null;
}

/**
 * Type for state tracking references
 */
interface StateRefs {
  lastDataReceived: number;
  connectionErrorCount: number;
  lastDetachedDeviceId: number | null;
  deviceAttachmentTime: number;
}

// Type for a listener removal function
type ListenerRemover = { remove: () => void };

// Type for USB event handlers
type UsbEventHandler = () => void;

/**
 * Hook for interacting with USB Serial devices
 */
export const useUsbSerial = (onLog?: (message: string) => void) => {
  // Device state
  const [devices, setDevices] = useState<Device[]>([]);
  
  // Connection state - consolidated into a single object
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    currentDevice: null,
    serialport: null,
    subscription: null,
    latestPM25: null,
    latestPM10: null,
    latestPacketType: null,
    latestTimestamp: null,
  });
  
  // Configuration state
  const [config, setConfig] = useState<UsbSerialConfig>({
    autoConnect: true,
    autoRefresh: true,
  });
  
  // Refs for timers and state tracking
  const timers = useRef<TimerRefs>({
    refresh: null,
    reconnect: null,
    connectionCheck: null,
    reattachDelay: null,
  });

  // Track state that doesn't need to trigger re-renders
  const stateRefs = useRef<StateRefs>({
    lastDataReceived: Date.now(),
    connectionErrorCount: 0,
    lastDetachedDeviceId: null,
    deviceAttachmentTime: 0,
  });

  // Throttle state updates to prevent overwhelming React with too many re-renders
  const lastStateUpdateTime = useRef<number>(0);
  const THROTTLE_MS = 500; // Update state at most once per 500ms

  // Track previous device count to avoid logging spam
  const lastDeviceCount = useRef<number>(0);
  const lastConnectedDeviceId = useRef<number | null>(null);

  /**
   * Log a message if a logging function is provided
   */
  const logMessage = useCallback((message: string) => {
    if (onLog) onLog(message);
  }, [onLog]);

  /**
   * Request USB access permission
   */
  const requestUSBPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: "USB Permission",
            message: "This app needs access to USB devices",
            buttonNeutral: "Ask Me Later",
            buttonNegative: "Cancel",
            buttonPositive: "OK",
          },
        );
        logMessage(`USB permission ${granted === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied'}`);
      } catch (err) {
        logMessage(`Error: ${err}`);
      }
    }
  }, [logMessage]);

  /**
   * Update connection state with partial updates
   */
  const updateConnectionState = useCallback((updates: Partial<ConnectionState>) => {
    setConnectionState(prev => ({ ...prev, ...updates }));
  }, []);

  /**
   * Clear all timers to prevent memory leaks
   */
  const clearAllTimers = useCallback(() => {
    Object.entries(timers.current).forEach(([_, timer]) => {
      if (timer) clearTimeout(timer);
    });
    
    // Reset all timer refs
    timers.current = {
      refresh: null,
      reconnect: null,
      connectionCheck: null,
      reattachDelay: null,
    };
  }, []);

  // Forward declare these functions to avoid "used before declaration" errors
  let checkConnectionStatus: () => Promise<void>;
  let refreshDeviceList: () => Promise<Device[]>;
  let handleDeviceDisconnection: (isPhysicalDetachment?: boolean) => void;
  let connectDevice: (deviceId: number) => Promise<void>;

  /**
   * Disconnect from a USB device
   */
  const disconnectDevice = useCallback(async () => {
    try {
      // Clear connection check interval
      if (timers.current.connectionCheck) {
        clearInterval(timers.current.connectionCheck);
        timers.current.connectionCheck = null;
      }
      
      if (connectionState.serialport) {
        // Remove event listener
        if (connectionState.subscription) {
          connectionState.subscription.remove();
        }
        
        // Close connection
        connectionState.serialport.close();
        
        updateConnectionState({
          serialport: null,
          connected: false,
          currentDevice: null,
          subscription: null,
        });

        // Reset connection tracking
        lastConnectedDeviceId.current = null;
        
        // Refresh device list immediately after disconnection to update UI
        refreshDeviceList();
      }
    } catch (error) {
      logMessage(`Error disconnecting: ${error}`);
      // Even if there's an error, reset the connection state
      updateConnectionState({
        serialport: null,
        connected: false,
        currentDevice: null,
        subscription: null,
      });
      
      // Still refresh the device list on error
      refreshDeviceList();
    }
  }, [connectionState.serialport, connectionState.subscription, logMessage, updateConnectionState]);

  /**
   * Handle unexpected device disconnection
   */
  handleDeviceDisconnection = useCallback((isPhysicalDetachment = false) => {
    // Only log user-friendly messages (reduced technical spam)
    
    // Clean up the connection
    try {
      // Clear connection check interval
      if (timers.current.connectionCheck) {
        clearInterval(timers.current.connectionCheck);
        timers.current.connectionCheck = null;
      }
      
      if (connectionState.subscription) {
        connectionState.subscription.remove();
      }
      
      if (connectionState.serialport) {
        try {
          connectionState.serialport.close();
        } catch (e) {
          // Ignore errors during close on disconnection
        }
      }
    } catch (error) {
      logMessage(`Error during disconnection cleanup: ${error}`);
    }
    
    // Update state
    updateConnectionState({
      serialport: null,
      connected: false,
      subscription: null,
      // Keep the current device ID for physical detachments
      currentDevice: isPhysicalDetachment ? connectionState.currentDevice : null,
    });
    
    stateRefs.current.connectionErrorCount = 0;
    
    // Force device list refresh to update UI immediately
    refreshDeviceList();
    
    // Only attempt to reconnect for non-physical detachments
    if (config.autoConnect && !isPhysicalDetachment) {
      logMessage('Will try to reconnect in 3 seconds...');
      if (timers.current.reconnect) {
        clearTimeout(timers.current.reconnect);
      }
      timers.current.reconnect = setTimeout(() => {
        refreshDeviceList();
      }, 3000);
    }
  }, [connectionState, logMessage, config.autoConnect, updateConnectionState]);

  /**
   * Check if connection is still active
   */
  checkConnectionStatus = useCallback(async () => {
    if (!connectionState.connected || !connectionState.serialport) return;

    try {
      // Check if we've received data recently (within the last 15 seconds)
      const timeSinceLastData = Date.now() - stateRefs.current.lastDataReceived;
      const isStale = timeSinceLastData > 15000;

      // Try to send a "ping" command to test connection
      if (isStale || stateRefs.current.connectionErrorCount > 0) {
        // This call will throw an error if device is disconnected
        await connectionState.serialport.isOpen();
        
        // If we get here and had errors before, reset the counter
        if (stateRefs.current.connectionErrorCount > 0) {
          stateRefs.current.connectionErrorCount = 0;
          logMessage("Connection restored.");
        }
      }
    } catch (error) {
      stateRefs.current.connectionErrorCount++;

      // Only log and handle disconnection after multiple failures (reduce log spam)
      if (stateRefs.current.connectionErrorCount >= 2) {
        logMessage("Sensor connection lost. Attempting to reconnect...");
        handleDeviceDisconnection();
      }
    }
  }, [connectionState.connected, connectionState.serialport, logMessage, handleDeviceDisconnection]);

  /**
   * Refresh the list of USB devices
   */
  refreshDeviceList = useCallback(async () => {
    try {
      const deviceList = await UsbSerialManager.list();
      setDevices(deviceList || []);

      // Only log when device count changes (reduce spam from auto-refresh)
      if (deviceList.length !== lastDeviceCount.current) {
        logMessage(`Found ${deviceList.length} device(s)`);
        lastDeviceCount.current = deviceList.length;
      }

      // If auto-connect is enabled and we're not connected, try to connect to the first device
      if (config.autoConnect && !connectionState.connected && deviceList && deviceList.length > 0) {
        const deviceToConnect = deviceList[0];
        // Reduced logging spam - only log actual connection, not attempts
        connectDevice(deviceToConnect.deviceId);
      }

      return deviceList || [];
    } catch (error) {
      logMessage(`Error getting device list: ${error}`);
      setDevices([]);
      return [];
    }
  }, [logMessage, config.autoConnect, connectionState.connected]);

  /**
   * Connect to a USB device
   */
  connectDevice = useCallback(async (deviceId: number) => {
    try {
      // Check if we're trying to connect too soon after a device was attached
      const timeSinceAttachment = Date.now() - stateRefs.current.deviceAttachmentTime;
      if (timeSinceAttachment < 1000) {
        logMessage(`Device was attached only ${timeSinceAttachment}ms ago, waiting to stabilize...`);
        
        // Schedule a retry after a delay
        if (timers.current.reconnect) {
          clearTimeout(timers.current.reconnect);
        }
        timers.current.reconnect = setTimeout(() => {
          connectDevice(deviceId);
        }, 1000);
        return;
      }
      
      if (connectionState.connected && connectionState.currentDevice === deviceId) {
        logMessage(`Already connected to device ${deviceId}`);
        return;
      }
      
      // If connected to a different device, disconnect first
      if (connectionState.connected && connectionState.currentDevice !== null && connectionState.currentDevice !== deviceId) {
        await disconnectDevice();
      }
      
      // Reset connection error count
      stateRefs.current.connectionErrorCount = 0;
      
      // First request permission
      await UsbSerialManager.tryRequestPermission(deviceId);
      
      // SDS011/SDS021 uses 9600 baud rate
      const port = await UsbSerialManager.open(deviceId, {
        baudRate: 9600,
        parity: Parity.None,
        stopBits: 1,
        dataBits: 8,
      });
      
      // Set up data listener
      const sub = port.onReceived((event: any) => {
        try {
          // Update the timestamp for last received data
          stateRefs.current.lastDataReceived = Date.now();

          // The data is coming in as a hex string like "AAC01F00220057D870AB"
          const rawData = event.data;

          if (rawData && typeof rawData === 'string' && rawData.length > 0) {
            // Convert the hex string to an array of bytes
            const byteArray: number[] = [];
            for (let i = 0; i < rawData.length; i += 2) {
              if (i + 1 < rawData.length) {
                const byteValue = parseInt(rawData.substring(i, i + 2), 16);
                byteArray.push(byteValue);
              }
            }

            if (byteArray.length === 10) {
              // Parse the packet immediately to extract PM values
              let pm25: number | null = null;
              let pm10: number | null = null;
              let packetType: 'standard' | 'modified' | null = null;

              // Try standard format first (AA...AB markers)
              if (byteArray[0] === 0xAA && byteArray[9] === 0xAB) {
                const values = SensorPacket.extractValues(byteArray);
                if (values) {
                  pm25 = values.pm25;
                  pm10 = values.pm10;
                  packetType = 'standard';
                }
              }

              // If standard format didn't work, try raw format
              if (pm25 === null || pm10 === null) {
                const rawPm25 = (byteArray[3] * 256 + byteArray[2]) / 10;
                const rawPm10 = (byteArray[5] * 256 + byteArray[4]) / 10;

                if (rawPm25 >= 0 && rawPm25 <= 999 && rawPm10 >= 0 && rawPm10 <= 999) {
                  pm25 = rawPm25;
                  pm10 = rawPm10;
                  packetType = 'modified';
                }
              }

              // Update state with parsed values (throttled to prevent overwhelming React)
              if (pm25 !== null && pm10 !== null) {
                const now = Date.now();
                const timeSinceLastUpdate = now - lastStateUpdateTime.current;

                // Only update state if enough time has passed (throttling)
                if (timeSinceLastUpdate >= THROTTLE_MS) {
                  setConnectionState(prev => ({
                    ...prev,
                    latestPM25: pm25,
                    latestPM10: pm10,
                    latestPacketType: packetType,
                    latestTimestamp: now,
                  }));

                  lastStateUpdateTime.current = now;

                  // Single consolidated log message for valid data (reduces logging overhead)
                  logMessage(`Valid ${packetType} packet: PM2.5=${pm25.toFixed(1)}, PM10=${pm10.toFixed(1)}`);
                }

                // Reset error counter on successful data (even if we don't update state)
                stateRefs.current.connectionErrorCount = 0;
              }
            }
          }
        } catch (error) {
          logMessage(`Error parsing data: ${error}`);
          // Increment error counter on data errors
          stateRefs.current.connectionErrorCount++;

          // If we've had multiple consecutive data errors, check connection
          if (stateRefs.current.connectionErrorCount >= 3) {
            checkConnectionStatus();
          }
        }
      });
      
      // Update connection state
      updateConnectionState({
        serialport: port,
        connected: true,
        currentDevice: deviceId,
        subscription: sub,
      });

      // Track connection but don't spam logs - user will see data flowing
      lastConnectedDeviceId.current = deviceId;

      // Refresh device list immediately after connection to update UI
      refreshDeviceList();
      
      // Set up connection checking interval
      if (timers.current.connectionCheck) {
        clearInterval(timers.current.connectionCheck);
      }
      timers.current.connectionCheck = setInterval(checkConnectionStatus, 5000);
      
    } catch (error: any) {
      logMessage(`Error connecting: ${error}`);
      if (error.code === 'DEVICE_NOT_FOUND') {
        logMessage('Device not found or permission denied');
      }
      
      // Set up reconnect if auto-connect is enabled
      if (config.autoConnect) {
        logMessage('Will try to reconnect in 5 seconds...');
        if (timers.current.reconnect) {
          clearTimeout(timers.current.reconnect);
        }
        timers.current.reconnect = setTimeout(() => {
          refreshDeviceList();
        }, 5000);
      }
    }
  }, [connectionState, logMessage, disconnectDevice, checkConnectionStatus, updateConnectionState]);

  /**
   * Handle USB device attachment events
   */
  const handleDeviceAttached = useCallback(() => {
    logMessage('USB device attached');
    
    // Record the time of attachment to prevent rapid reconnect cycles
    stateRefs.current.deviceAttachmentTime = Date.now();
    
    // Clear any existing reconnect timeouts
    if (timers.current.reconnect) {
      clearTimeout(timers.current.reconnect);
      timers.current.reconnect = null;
    }
    
    // Clear any reattach delay timeout
    if (timers.current.reattachDelay) {
      clearTimeout(timers.current.reattachDelay);
      timers.current.reattachDelay = null;
    }
    
    // Force immediate device list refresh to show the attached device
    refreshDeviceList();
    
    // Set a short delay for refreshing device list again and attempting connection
    // to allow Android USB subsystem to stabilize
    logMessage('Will refresh device list in 1.5 seconds after device attachment');
    timers.current.reattachDelay = setTimeout(() => {
      refreshDeviceList().then(deviceList => {
        // If we have a remembered device ID that was detached, try to reconnect to it
        if (stateRefs.current.lastDetachedDeviceId !== null && config.autoConnect) {
          // Check if the device with that ID is in the list
          const deviceExists = deviceList.some(
            device => device.deviceId === stateRefs.current.lastDetachedDeviceId
          );
          
          if (deviceExists) {
            // Reconnect silently - success will be logged by connectDevice
            connectDevice(stateRefs.current.lastDetachedDeviceId);
          } else if (deviceList.length > 0) {
            // If the device ID changed after reattachment, connect to first available
            connectDevice(deviceList[0].deviceId);
          }
          // Reset the stored detached device ID
          stateRefs.current.lastDetachedDeviceId = null;
        }
      });
    }, 1500);
  }, [logMessage, refreshDeviceList, config.autoConnect, connectDevice]);

  /**
   * Handle USB device detachment events
   */
  const handleDeviceDetached = useCallback(() => {
    logMessage('USB device detached');
    
    // Store the current connected device ID before disconnection
    if (connectionState.connected && connectionState.currentDevice !== null) {
      stateRefs.current.lastDetachedDeviceId = connectionState.currentDevice;
      logMessage(`Remembered detached device ID: ${connectionState.currentDevice}`);
    }
    
    // If we're connected and device is detached, we'll need to disconnect
    if (connectionState.connected) {
      handleDeviceDisconnection(true); // true indicates it was a physical detachment
    } else {
      // If not connected, still force a refresh to update UI
      refreshDeviceList();
    }
  }, [logMessage, connectionState.connected, connectionState.currentDevice, handleDeviceDisconnection, refreshDeviceList]);

  /**
   * Send a command to the connected device
   */
  const sendCommand = useCallback(async (command: string) => {
    if (!connectionState.serialport) {
      logMessage('No device connected');
      return;
    }
    
    try {
      // Generate command bytes using the utility from sensorUtils
      const cmdArray = SensorCommands.generate(command);
      
      // Log the raw bytes we're sending
      logMessage(`Sending raw command bytes: ${ByteUtils.toHexString(cmdArray)}`);
      
      // The port.send method may require data in different formats
      // Some implementations expect a hex string, others expect a byte array
      // Let's try both approaches if one fails
      
      try {
        // First try to send as raw byte array
        await connectionState.serialport.send(cmdArray);
        logMessage(`Command sent successfully as byte array`);
      } catch (sendError) {
        // If that fails, try sending as hex string
        logMessage(`Sending as byte array failed, trying hex string format`);
        const hexData = ByteUtils.toHexStringCompact(cmdArray);
        await connectionState.serialport.send(hexData);
        logMessage(`Command sent successfully as hex string`);
      }
    } catch (error) {
      logMessage(`Error sending command: ${error}`);
    }
  }, [connectionState.serialport, logMessage]);

  /**
   * Toggle auto-connect feature
   */
  const toggleAutoConnect = useCallback(() => {
    setConfig(prev => {
      const newAutoConnect = !prev.autoConnect;
      logMessage(`Auto-connect ${newAutoConnect ? 'enabled' : 'disabled'}`);
      
      // If enabling auto-connect and not connected, trigger a refresh
      if (newAutoConnect && !connectionState.connected) {
        refreshDeviceList();
      }
      
      return { ...prev, autoConnect: newAutoConnect };
    });
  }, [connectionState.connected, refreshDeviceList, logMessage]);

  /**
   * Toggle auto-refresh feature
   */
  const toggleAutoRefresh = useCallback(() => {
    setConfig(prev => {
      const newAutoRefresh = !prev.autoRefresh;
      logMessage(`Auto-refresh ${newAutoRefresh ? 'enabled' : 'disabled'}`);
      
      // If disabling, clear the interval
      if (!newAutoRefresh && timers.current.refresh) {
        clearInterval(timers.current.refresh);
        timers.current.refresh = null;
      }
      
      // If enabling, start the interval
      if (newAutoRefresh) {
        // Perform an immediate refresh
        refreshDeviceList();
        
        // Then set up interval for future refreshes
        timers.current.refresh = setInterval(refreshDeviceList, 10000);
      }
      
      return { ...prev, autoRefresh: newAutoRefresh };
    });
  }, [refreshDeviceList, logMessage]);


  /**
   * Initialize USB Serial and set up permissions
   */
  useEffect(() => {
    // Request permissions
    requestUSBPermission();

    // Set up USB device connection monitoring
    if (Platform.OS === 'android') {
      refreshDeviceList();
      
      // Set up auto refresh interval
      if (config.autoRefresh) {
        timers.current.refresh = setInterval(refreshDeviceList, 10000);
      }
      
      // Subscribe to USB attachment/detachment events
      let attachListener: ListenerRemover | null = null;
      let detachListener: ListenerRemover | null = null;
      
      // Safely attempt to add event listeners if supported
      try {
        // @ts-ignore - USB Manager from library may provide addListener
        if (typeof UsbSerialManager.addListener === 'function') {
          // @ts-ignore - Access dynamically
          attachListener = UsbSerialManager.addListener('onDeviceAttached', handleDeviceAttached);
          // @ts-ignore - Access dynamically
          detachListener = UsbSerialManager.addListener('onDeviceDetached', handleDeviceDetached);
        }
      } catch (error) {
        logMessage('USB event listeners not supported');
      }
      
      // Cleanup function
      return () => {
        // Clear all timers
        clearAllTimers();
        
        // Remove USB event listeners
        if (attachListener) attachListener.remove();
        if (detachListener) detachListener.remove();
        
        // Disconnect if connected
        if (connectionState.connected && connectionState.currentDevice && connectionState.serialport) {
          connectionState.serialport.close();
          
          // No need to update state on unmount
        }
        
        // Remove subscription if exists
        if (connectionState.subscription) {
          connectionState.subscription.remove();
        }
      };
    }
  }, []);

  return {
    devices,
    connected: connectionState.connected,
    currentDevice: connectionState.currentDevice,
    latestPM25: connectionState.latestPM25,
    latestPM10: connectionState.latestPM10,
    latestPacketType: connectionState.latestPacketType,
    latestTimestamp: connectionState.latestTimestamp,
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