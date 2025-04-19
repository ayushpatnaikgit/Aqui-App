/**
 * Utility functions for SDS011/SDS021 sensor data handling
 */

/**
 * Hex/binary conversion utilities
 */
export const ByteUtils = {
  padHex: (num: number): string => {
    return num.toString(16).padStart(2, '0');
  },
  
  toHexString: (bytes: number[]): string => {
    return bytes.map(b => ByteUtils.padHex(b)).join(' ');
  },
  
  toDecString: (bytes: number[]): string => {
    return bytes.map(byte => byte.toString().padStart(3, ' ')).join(' ');
  },
  
  toHexStringCompact: (bytes: number[]): string => {
    return bytes.map(b => ByteUtils.padHex(b)).join('').toUpperCase();
  }
};

/**
 * SDS011/SDS021 packet format handling
 */
export const SensorPacket = {
  /**
   * Calculate checksum for SDS011/SDS021 packet
   * Checksum is the sum of bytes 2-7 modulo 256
   */
  calculateChecksum: (data: number[]): number => {
    let checksum = 0;
    for (let i = 2; i < 8; i++) {
      checksum += data[i];
    }
    return checksum & 0xFF;
  },
  
  /**
   * Convert modified 20-byte format to standard 10-byte format
   */
  convertModifiedFormat: (modifiedBuffer: number[]): number[] | null => {
    // Check if buffer is the correct length
    if (modifiedBuffer.length !== 20) {
      return null;
    }

    // Check for expected start and end markers
    const hasCorrectStartMarkers = modifiedBuffer[0] === 0x0A && modifiedBuffer[1] === 0x0A;
    const hasCorrectEndMarkers = modifiedBuffer[18] === 0x0A && modifiedBuffer[19] === 0x0B;
    
    // Need either start or end markers to match
    if (!hasCorrectStartMarkers && !hasCorrectEndMarkers) {
      return null;
    }

    // Create standard buffer
    const standardBuffer = [0xAA]; // Standard header
    
    // Extract data bytes
    for (let i = 2; i < 18; i += 2) {
      standardBuffer.push(modifiedBuffer[i]);
    }
    
    standardBuffer.push(0xAB); // Standard tail
    
    return standardBuffer.length === 10 ? standardBuffer : null;
  },
  
  /**
   * Extract PM2.5 and PM10 values from a modified format packet
   */
  extractFromModifiedFormat: (buffer: number[]): { pm25: number, pm10: number } | null => {
    if (buffer.length !== 20) {
      return null;
    }
    
    // Try different extraction methods
    
    // Method 1: Direct values
    let pm25 = buffer[2];
    let pm10 = buffer[4];
    
    if (pm25 >= 0 && pm25 <= 999 && pm10 >= 0 && pm10 <= 999) {
      return { pm25, pm10 };
    }
    
    // Method 2: Direct values divided by 10
    pm25 = buffer[2] / 10;
    pm10 = buffer[4] / 10;
    
    if (pm25 >= 0 && pm25 <= 99.9 && pm10 >= 0 && pm10 <= 99.9) {
      return { pm25, pm10 };
    }
    
    // Method 3: Try standard formula with bytes 2-5
    const pm25Low = buffer[2];
    const pm25High = buffer[3];
    const pm10Low = buffer[4];
    const pm10High = buffer[5];
    
    pm25 = ((pm25High * 256) + pm25Low) / 10;
    pm10 = ((pm10High * 256) + pm10Low) / 10;
    
    if (pm25 >= 0 && pm25 < 1000 && pm10 >= 0 && pm10 < 1000) {
      return { pm25, pm10 };
    }
    
    return null;
  },
  
  /**
   * Extract PM2.5 and PM10 values from a valid packet (standard or modified format)
   */
  extractValues: (buffer: number[]): { pm25: number, pm10: number } | null => {
    // Check for modified format (20 bytes, starts with 0A 0A)
    if (buffer.length === 20 && buffer[0] === 0x0A && buffer[1] === 0x0A) {
      const modifiedValues = SensorPacket.extractFromModifiedFormat(buffer);
      if (modifiedValues) {
        return modifiedValues;
      }
    }
    
    // Check for standard format (10 bytes, starts with AA, ends with AB)
    if (buffer.length === 10 && buffer[0] === 0xAA && buffer[9] === 0xAB) {
      // Extract bytes for PM2.5 and PM10
      const pm25Low = buffer[2];
      const pm25High = buffer[3];
      const pm10Low = buffer[4];
      const pm10High = buffer[5];
      
      // Calculate values using SDS011/SDS021 formula
      const pm25 = ((pm25High * 256) + pm25Low) / 10;
      const pm10 = ((pm10High * 256) + pm10Low) / 10;
      
      // Only return reasonable values
      if (pm25 >= 0 && pm25 <= 1000 && pm10 >= 0 && pm10 <= 1000) {
        return { pm25, pm10 };
      }
      
      return null;
    }
    
    // Try conversion from modified to standard as a last resort
    if (buffer.length === 20) {
      const converted = SensorPacket.convertModifiedFormat(buffer);
      if (converted) {
        return SensorPacket.extractValues(converted);
      }
    }
    
    return null;
  }
};

/**
 * SDS011/SDS021 command management
 */
export const SensorCommands = {
  WAKE: 'wake',
  SLEEP: 'sleep',
  READ: 'read',
  
  /**
   * Generate command bytes for SDS011/SDS021 commands
   */
  generate: (command: string): number[] => {
    // Command structure: 
    // byte 0: header (0xAA)
    // byte 1: command byte (0xB4)
    // byte 2: command type
    // byte 3: command value
    // bytes 4-15: zeros (0x00)
    // bytes 16-17: device ID (0xFF 0xFF for all devices)
    // byte 18: checksum
    // byte 19: tail (0xAB)
    
    // Create command array
    const cmdArray = [
      0xAA, 0xB4, 0x00, 0x00, 
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xFF, 0xFF, 0x00, 0xAB
    ];
    
    // Set command type and value
    switch (command) {
      case SensorCommands.WAKE:
        cmdArray[2] = 0x06; // Set sleep/work mode
        cmdArray[3] = 0x01; // 1 = work mode
        break;
      case SensorCommands.READ:
        cmdArray[2] = 0x04; // Request data
        cmdArray[3] = 0x00; // 0 = no argument needed
        break;
      case SensorCommands.SLEEP:
        cmdArray[2] = 0x06; // Set sleep/work mode
        cmdArray[3] = 0x00; // 0 = sleep mode
        break;
      default:
        cmdArray[2] = 0x06; // Default to wake
        cmdArray[3] = 0x01;
    }
    
    // Calculate checksum
    cmdArray[18] = SensorPacket.calculateChecksum(cmdArray);
    
    return cmdArray;
  }
};

/**
 * Air Quality Index (AQI) categorization
 */
export const AirQualityIndex = {
  /**
   * Get AQI category for PM2.5 value
   */
  getPM25Category: (value: number): string => {
    if (value <= 12) return 'Good';
    if (value <= 35) return 'Moderate';
    if (value <= 55) return 'Unhealthy for Sensitive Groups';
    if (value <= 150) return 'Unhealthy';
    if (value <= 250) return 'Very Unhealthy';
    return 'Hazardous';
  },
  
  /**
   * Get AQI category for PM10 value
   */
  getPM10Category: (value: number): string => {
    if (value <= 54) return 'Good';
    if (value <= 154) return 'Moderate';
    if (value <= 254) return 'Unhealthy for Sensitive Groups';
    if (value <= 354) return 'Unhealthy';
    if (value <= 424) return 'Very Unhealthy';
    return 'Hazardous';
  },
  
  /**
   * Get the style class name for a PM value based on its category
   */
  getCategoryStyle: (value: number, isPM25: boolean): string => {
    const category = isPM25 
      ? AirQualityIndex.getPM25Category(value) 
      : AirQualityIndex.getPM10Category(value);
    
    switch (category) {
      case 'Good': return 'goodReading';
      case 'Moderate': return 'moderateReading';
      case 'Unhealthy for Sensitive Groups': return 'unhealthySensitiveReading';
      case 'Unhealthy': return 'unhealthyReading';
      case 'Very Unhealthy': return 'veryUnhealthyReading';
      default: return 'hazardousReading';
    }
  }
};

// For backward compatibility
export const generateCommandBytes = SensorCommands.generate;
export const calculateChecksum = SensorPacket.calculateChecksum;
export const extractPMValues = SensorPacket.extractValues;
export const extractPMValuesFromModifiedFormat = SensorPacket.extractFromModifiedFormat;
export const byteArrayToHexString = ByteUtils.toHexString;
export const byteArrayToDecString = ByteUtils.toDecString;
export const padHex = ByteUtils.padHex;
export const getPM25Category = AirQualityIndex.getPM25Category;
export const getPM10Category = AirQualityIndex.getPM10Category;
export const getPMCategoryStyle = AirQualityIndex.getCategoryStyle; 