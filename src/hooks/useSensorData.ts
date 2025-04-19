import { useState, useEffect } from 'react';
import { extractPMValues, byteArrayToHexString, extractPMValuesFromModifiedFormat, byteArrayToDecString, padHex } from '../utils/sensorUtils';

/**
 * Custom hook for handling SDS011/SDS021 sensor data
 */
interface UseSensorDataProps {
  dataBuffer: number[];
  onLog?: (message: string) => void;
  clearBuffer?: () => void;
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
 * Hook for handling sensor data processing
 */
export const useSensorData = ({ dataBuffer, onLog, clearBuffer }: UseSensorDataProps): SensorData => {
  const [pm25, setPm25] = useState<number | null>(null);
  const [pm10, setPm10] = useState<number | null>(null); 
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [packetType, setPacketType] = useState<'standard' | 'modified' | null>(null);
  const [readings, setReadings] = useState<ReadingData[]>([]);
  const [avgPm25, setAvgPm25] = useState<number | null>(null);
  const [avgPm10, setAvgPm10] = useState<number | null>(null);
  
  // Function to add a new reading and calculate averages
  const addReading = (newPm25: number, newPm10: number) => {
    // Create a new reading
    const newReading: ReadingData = {
      pm25: newPm25,
      pm10: newPm10,
      timestamp: new Date()
    };
    
    // Add to readings array, keeping the most recent 10
    const updatedReadings = [...readings, newReading].slice(-10);
    setReadings(updatedReadings);
    
    // Set current values
    setPm25(newPm25);
    setPm10(newPm10);
    setLastUpdate(new Date().toLocaleTimeString());
    
    // Calculate averages
    const avgPm25Value = updatedReadings.reduce((sum, reading) => sum + reading.pm25, 0) / updatedReadings.length;
    const avgPm10Value = updatedReadings.reduce((sum, reading) => sum + reading.pm10, 0) / updatedReadings.length;
    
    // Set average values
    setAvgPm25(parseFloat(avgPm25Value.toFixed(1)));
    setAvgPm10(parseFloat(avgPm10Value.toFixed(1)));
    
    console.log(`[DEBUG] Added reading: PM2.5=${newPm25}, PM10=${newPm10}`);
    console.log(`[DEBUG] Current averages (${updatedReadings.length} readings): PM2.5=${avgPm25Value.toFixed(1)}, PM10=${avgPm10Value.toFixed(1)}`);
  };
  
  // Process buffer whenever it changes
  useEffect(() => {
    console.log(`[DEBUG] Processing buffer of length: ${dataBuffer?.length || 0}`);
    
    if (!dataBuffer || dataBuffer.length === 0) {
      console.log('[DEBUG] Buffer empty, skipping processing');
      return;
    }
    
    // We should now just have a direct 10-byte array from a single packet
    if (dataBuffer.length === 10) {
      console.log('[DEBUG] Processing 10-byte packet');
      
      // Check if it's a standard SDS011 packet (starts with 0xAA, ends with 0xAB)
      if (dataBuffer[0] === 0xAA && dataBuffer[9] === 0xAB) {
        console.log(`[DEBUG] Standard SDS011 packet found (HEX): ${byteArrayToHexString(dataBuffer)}`);
        
        const values = extractPMValues(dataBuffer);
        
        if (values) {
          console.log(`[DEBUG] Valid values extracted: PM2.5=${values.pm25}, PM10=${values.pm10}`);
          
          // Add reading and update averages
          addReading(values.pm25, values.pm10);
          setPacketType('standard');
          
          if (onLog) {
            onLog(`Valid SDS011 packet: ${byteArrayToHexString(dataBuffer)}`);
            onLog(`Values: PM2.5=${values.pm25.toFixed(1)}, PM10=${values.pm10.toFixed(1)}`);
          }
          
          // Clear buffer after successful processing
          if (clearBuffer) {
            clearBuffer();
          }
          
          return;
        }
      }
      
      // Even if it's not a standard packet (doesn't have AA/AB markers)
      // Try to extract values from the raw bytes
      try {
        // Use the formula matching the Java code: (high_byte*256 + low_byte)/10
        const pm25 = (dataBuffer[3]*256 + dataBuffer[2])/10;
        const pm10 = (dataBuffer[5]*256 + dataBuffer[4])/10;
        
        // Check if values are reasonable
        if (pm25 >= 0 && pm25 <= 999 && pm10 >= 0 && pm10 <= 999) {
          console.log(`[DEBUG] Raw data values: PM2.5=${pm25}, PM10=${pm10}`);
          
          // Add reading and update averages
          addReading(pm25, pm10);
          setPacketType('modified');
          
          if (onLog) {
            onLog(`Raw data packet: ${byteArrayToHexString(dataBuffer)}`);
            onLog(`Values: PM2.5=${pm25.toFixed(1)}, PM10=${pm10.toFixed(1)}`);
          }
          
          // Clear buffer after successful processing
          if (clearBuffer) {
            clearBuffer();
          }
          
          return;
        } else {
          console.log('[DEBUG] Values out of reasonable range:', pm25, pm10);
        }
      } catch (err) {
        console.log('[DEBUG] Error processing bytes:', err);
      }
    } else {
      console.log(`[DEBUG] Unexpected buffer length: ${dataBuffer.length}, expected 10 bytes`);
    }
    
    console.log('[DEBUG] No valid data could be extracted');
  }, [dataBuffer, onLog, clearBuffer]);
  
  return { 
    pm25, 
    pm10, 
    avgPm25,
    avgPm10,
    readingsCount: readings.length,
    lastUpdate, 
    packetType 
  };
};

export default useSensorData; 