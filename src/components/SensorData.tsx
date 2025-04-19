import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { AirQualityIndex } from '../utils/sensorUtils';

interface SensorDataProps {
  pm25: number | null;
  pm10: number | null;
  avgPm25?: number | null;
  avgPm10?: number | null;
  readingsCount?: number;
  lastUpdate: string | null;
  connected: boolean;
  packetType?: 'standard' | 'modified' | null;
}

// Define the style category types
type AqiStyleCategory = 
  | 'goodReading'
  | 'moderateReading'
  | 'unhealthySensitiveReading'
  | 'unhealthyReading'
  | 'veryUnhealthyReading'
  | 'hazardousReading';

const SensorData: React.FC<SensorDataProps> = ({ 
  pm25, 
  pm10, 
  avgPm25 = null,
  avgPm10 = null,
  readingsCount = 0,
  lastUpdate, 
  connected,
  packetType
}) => {
  // Use average values if available, otherwise fall back to current readings
  const displayPm25 = avgPm25 !== null && readingsCount > 0 ? avgPm25 : pm25;
  const displayPm10 = avgPm10 !== null && readingsCount > 0 ? avgPm10 : pm10;
  
  // Animation for status indicator
  const [pulseAnim] = useState(new Animated.Value(1));
  
  // Get the style category for PM values
  const getPm25StyleCategory = (value: number): AqiStyleCategory => {
    return AirQualityIndex.getCategoryStyle(value, true) as AqiStyleCategory;
  };
  
  const getPm10StyleCategory = (value: number): AqiStyleCategory => {
    return AirQualityIndex.getCategoryStyle(value, false) as AqiStyleCategory;
  };
  
  // Start pulsing animation for connected state
  useEffect(() => {
    if (connected) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          })
        ])
      ).start();
    } else {
      // Stop animation when disconnected
      pulseAnim.setValue(1);
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 0,
        useNativeDriver: true,
      }).stop();
    }
    
    return () => {
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 0,
        useNativeDriver: true,
      }).stop();
    };
  }, [connected, pulseAnim]);

  return (
    <View style={styles.sensorDataContainer}>
      <View style={styles.statusBar}>
        <View style={styles.statusContainer}>
          <Animated.View 
            style={[
              styles.statusIndicator, 
              connected ? styles.statusConnected : styles.statusDisconnected,
              { opacity: connected ? pulseAnim : 1 }
            ]} 
          />
          <Text style={styles.statusText}>
            {connected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
      </View>
      
      {displayPm25 === null || displayPm10 === null ? (
        <View style={styles.noDataContainer}>
          <Text style={styles.noDataText}>No valid data packets detected. Please force stop and restart the app also reconnect the sensor.</Text>
          <Text style={styles.noDataSubtext}>
            {connected 
              ? 'Sensor connected. Waiting for valid data...' 
              : 'Connect to a device to start reading'
            }
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.readingTabs}>
            <Text style={styles.tabHeader}>Air Quality</Text>
            <View style={styles.sensorRow}>
              <View style={styles.sensorValue}>
                <Text style={styles.sensorLabel}>PM2.5</Text>
                <Text style={[
                  styles.sensorReading, 
                  styles[displayPm25 ? getPm25StyleCategory(displayPm25) : 'goodReading']
                ]}>
                  {displayPm25.toFixed(1)}
                </Text>
                <Text style={styles.sensorUnit}>µg/m³</Text>
                <Text style={styles.sensorInfo}>
                  {AirQualityIndex.getPM25Category(displayPm25)}
                </Text>
              </View>
              
              <View style={styles.sensorValue}>
                <Text style={styles.sensorLabel}>PM10</Text>
                <Text style={[
                  styles.sensorReading,
                  styles[displayPm10 ? getPm10StyleCategory(displayPm10) : 'goodReading']
                ]}>
                  {displayPm10.toFixed(1)}
                </Text>
                <Text style={styles.sensorUnit}>µg/m³</Text>
                <Text style={styles.sensorInfo}>
                  {AirQualityIndex.getPM10Category(displayPm10)}
                </Text>
              </View>
            </View>
          </View>
          
          {lastUpdate && (
            <View style={styles.infoContainer}>
              <Text style={styles.lastUpdate}>Last updated: {lastUpdate}</Text>
              {packetType && (
                <Text style={styles.packetType}>
                  Packet format: {packetType === 'standard' 
                    ? 'Standard (AA...AB)' 
                    : 'Modified (0A prefix for each byte)'
                  }
                </Text>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sensorDataContainer: {
    alignItems: 'center',
    padding: 16,
  },
  statusBar: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 5,
  },
  statusConnected: {
    backgroundColor: '#4CAF50',
  },
  statusDisconnected: {
    backgroundColor: '#F44336',
  },
  statusText: {
    fontSize: 12,
    color: '#666',
  },
  readingTabs: {
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 10,
  },
  tabHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  sensorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  sensorValue: {
    alignItems: 'center',
    flex: 1,
    padding: 10,
  },
  sensorLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#666',
  },
  sensorReading: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  sensorUnit: {
    fontSize: 14,
    color: '#666',
  },
  sensorInfo: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  infoContainer: {
    marginTop: 8,
    alignItems: 'center',
  },
  lastUpdate: {
    fontSize: 12,
    color: '#999',
  },
  packetType: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 4,
  },
  noDataContainer: {
    alignItems: 'center',
    padding: 24,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  noDataText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  noDataSubtext: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  goodReading: {
    color: '#4CAF50', // Green
  },
  moderateReading: {
    color: '#FFEB3B', // Yellow
  },
  unhealthySensitiveReading: {
    color: '#FF9800', // Orange
  },
  unhealthyReading: {
    color: '#F44336', // Red
  },
  veryUnhealthyReading: {
    color: '#9C27B0', // Purple
  },
  hazardousReading: {
    color: '#880E4F', // Dark Pink
  },
});

export default SensorData; 