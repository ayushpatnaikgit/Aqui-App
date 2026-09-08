/**
 * Aqui: PM2.5 and PM10 from an SDS011/SDS021 sensor over USB.
 *
 * One screen at a time, all on the same paper: the live reading, "plug in the
 * sensor", "allow USB access", and the log.
 */

import React, { useState, useCallback, useRef } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import TopBar, { SensorPresence } from './src/components/TopBar';
import LiveReading from './src/components/LiveReading';
import EmptyState, { LastReading } from './src/components/EmptyState';
import LogsScreen, { LogEntry } from './src/components/LogsScreen';
import { colors } from './src/theme';

import useUsbSerial from './src/hooks/useUsbSerial';
import useSensorData from './src/hooks/useSensorData';

const MAX_LOG_ENTRIES = 200;

/**
 * Plain-language wording for the hook's log lines. Returns null for lines
 * that only matter in developer mode.
 */
const friendlyMessage = (message: string): string | null => {
  if (message.startsWith('Found ')) {
    return message === 'Found 0 device(s)' ? 'No sensor on the USB port' : 'Sensor found';
  }
  if (message.startsWith('Connected to device')) {
    return 'Connected to sensor';
  }
  if (message.startsWith('Disconnected from device')) {
    return 'Disconnected from sensor';
  }
  if (message.startsWith('USB device detached')) {
    return 'Sensor unplugged';
  }
  if (message.startsWith('Waiting for USB permission')) {
    return 'Waiting for you to allow USB access';
  }
  if (message.startsWith('Permission denied')) {
    return 'USB access was denied';
  }
  if (message.startsWith('No data from sensor')) {
    return 'Sensor connected but silent, reconnecting';
  }
  if (message.startsWith('Error connecting')) {
    return 'Could not connect to the sensor';
  }
  if (message.startsWith('Error')) {
    return 'A sensor error occurred';
  }
  return null;
};

function Screen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [developer, setDeveloper] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const nextId = useRef(1);

  const addLog = useCallback((raw: string) => {
    const entry: LogEntry = {
      id: nextId.current++,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
      raw,
      friendly: friendlyMessage(raw),
    };
    setLogs(prev => [...prev, entry].slice(-MAX_LOG_ENTRIES));
  }, []);

  const { status, sensorId, latestPM25, latestPM10, latestPacketType, latestTimestamp, connectDevice, devices } =
    useUsbSerial(addLog);

  const { pm25, pm10, avgPm25, avgPm10, readingsCount, lastUpdate } = useSensorData({
    latestPM25,
    latestPM10,
    latestPacketType,
    latestTimestamp,
  });

  const presence: SensorPresence =
    status === 'connected' ? 'connected' : status === 'waiting-permission' || status === 'connecting' ? 'found' : 'none';
  const sensorLabel =
    status === 'connected'
      ? sensorId
        ? `Sensor ${sensorId}`
        : 'Connected'
      : presence === 'found'
      ? 'Sensor found'
      : 'No sensor';

  const askAgain = useCallback(() => {
    if (devices.length > 0) {
      connectDevice(devices[0].deviceId);
    }
  }, [connectDevice, devices]);

  let screen: React.ReactNode;
  if (showLogs) {
    screen = (
      <LogsScreen entries={logs} developer={developer} onToggleDeveloper={setDeveloper} onClear={() => setLogs([])} />
    );
  } else if (status === 'connected' && pm25 !== null && pm10 !== null) {
    screen = (
      <LiveReading
        pm25={pm25}
        pm10={pm10}
        avgPm25={avgPm25}
        avgPm10={avgPm10}
        readingsCount={readingsCount}
        lastUpdate={lastUpdate}
        onShowLogs={() => setShowLogs(true)}
      />
    );
  } else if (status === 'connected' || status === 'connecting') {
    screen = (
      <EmptyState
        icon="usb"
        title="Listening"
        body="The sensor is connected. The first reading arrives within a few seconds."
        footerLeft={sensorLabel}
        buttonLabel="Logs"
        onButton={() => setShowLogs(true)}
      />
    );
  } else if (status === 'waiting-permission') {
    screen = (
      <EmptyState
        icon="lock"
        title="Allow USB access"
        body={
          'Android is asking whether Aqui may use the sensor. Tap Allow, and tick "use by default" if you don\'t want to be asked each time it\'s plugged in.'
        }
        footerLeft="Waiting for permission"
        buttonLabel="Ask again"
        onButton={askAgain}
      />
    );
  } else {
    screen = (
      <EmptyState
        icon="usb"
        title="Plug in the sensor"
        body="Connect the SDS011 to the USB-C port. Aqui connects on its own and starts reading within a few seconds."
        footerLeft={pm25 !== null && lastUpdate ? `Last reading ${lastUpdate}` : 'No readings yet'}
        footerRight={pm25 !== null && pm10 !== null ? <LastReading pm25={pm25} pm10={pm10} /> : undefined}
        buttonLabel="Logs"
        onButton={() => setShowLogs(true)}
      />
    );
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} translucent={true} />
      <View style={styles.content}>
        <TopBar
          title={showLogs ? 'Logs' : 'Aqui'}
          presence={presence}
          sensorLabel={sensorLabel}
          onBack={showLogs ? () => setShowLogs(false) : undefined}
        />
        {screen}
      </View>
    </View>
  );
}

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider style={styles.safe}>
      <Screen />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  page: {
    flex: 1,
    backgroundColor: colors.paper,
    paddingHorizontal: 28,
  },
  content: {
    flex: 1,
    gap: 20,
  },
});

export default App;
