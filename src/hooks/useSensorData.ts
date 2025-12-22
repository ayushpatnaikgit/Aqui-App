import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for handling SDS011/SDS021 sensor data
 */
interface UseSensorDataProps {
  latestPM25: number | null;
  latestPM10: number | null;
  latestPacketType: 'standard' | 'modified' | null;
  latestTimestamp: number | null;
  onLog?: (message: string) => void;
}

interface ReadingData {
  pm25: number;
  pm10: number;
  timestamp: Date;
}

interface SensorData {
  pm25: number | null;
  pm10: number | null;
  avgPm25: number | null;
  avgPm10: number | null;
  readingsCount: number;
  lastUpdate: string | null;
  packetType: 'standard' | 'modified' | null;
}

/**
 * Hook for handling sensor data processing and averaging
 */
export const useSensorData = ({
  latestPM25,
  latestPM10,
  latestPacketType,
  latestTimestamp,
  onLog
}: UseSensorDataProps): SensorData => {
  const [sensorData, setSensorData] = useState<SensorData>({
    pm25: null,
    pm10: null,
    avgPm25: null,
    avgPm10: null,
    readingsCount: 0,
    lastUpdate: null,
    packetType: null,
  });

  const [readings, setReadings] = useState<ReadingData[]>([]);

  // Process new sensor readings whenever timestamp changes (indicating new data)
  useEffect(() => {
    // Check if we have valid new data
    if (latestPM25 === null || latestPM10 === null || latestTimestamp === null) {
      return;
    }

    // Create a new reading
    const newReading: ReadingData = {
      pm25: latestPM25,
      pm10: latestPM10,
      timestamp: new Date(latestTimestamp),
    };

    // Use functional setState to avoid stale closure and prevent dependency on readings
    setReadings(prevReadings => {
      // Add to readings array, keeping the most recent 10
      const updatedReadings = [...prevReadings, newReading].slice(-10);

      // Calculate averages
      const avgPm25Value = updatedReadings.reduce((sum, reading) => sum + reading.pm25, 0) / updatedReadings.length;
      const avgPm10Value = updatedReadings.reduce((sum, reading) => sum + reading.pm10, 0) / updatedReadings.length;

      // Batch all state updates into a single setState call to minimize re-renders
      setSensorData({
        pm25: latestPM25,
        pm10: latestPM10,
        avgPm25: parseFloat(avgPm25Value.toFixed(1)),
        avgPm10: parseFloat(avgPm10Value.toFixed(1)),
        readingsCount: updatedReadings.length,
        lastUpdate: new Date().toLocaleTimeString(),
        packetType: latestPacketType,
      });

      return updatedReadings;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestTimestamp]); // Only trigger on timestamp change (new data arrival)

  return sensorData;
};

export default useSensorData;
