/**
 * Utility functions for SDS011/SDS021 sensor data handling.
 *
 * Protocol summary (Nova Fitness "Laser Dust Sensor Control Protocol"):
 *
 *   Sensor -> host, 10 bytes:   AA C0 PM25lo PM25hi PM10lo PM10hi IDhi IDlo CS AB
 *   Sensor -> host reply:       AA C5 cmd d1 d2 d3 IDhi IDlo CS AB
 *     CS = sum(bytes 2..7) & 0xFF
 *
 *   Host -> sensor, 19 bytes:   AA B4 cmd d1 .. d12 IDhi IDlo CS AB
 *     CS = sum(bytes 2..16) & 0xFF   (command, data and device id)
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
  },

  /**
   * Parse a compact hex string ("AAC0...") into bytes. Ignores whitespace and a
   * trailing odd nibble; non-hex pairs are skipped.
   */
  fromHexString: (hex: string): number[] => {
    const clean = hex.replace(/\s+/g, '');
    const bytes: number[] = [];
    for (let i = 0; i + 1 < clean.length; i += 2) {
      const value = parseInt(clean.substring(i, i + 2), 16);
      if (!Number.isNaN(value)) {
        bytes.push(value);
      }
    }
    return bytes;
  },
};

/**
 * SDS011/SDS021 packet format handling
 */
export const SensorPacket = {
  FRAME_LENGTH: 10,
  HEAD: 0xaa,
  TAIL: 0xab,
  TYPE_DATA: 0xc0,
  TYPE_REPLY: 0xc5,

  /**
   * Sum of bytes[from, to) modulo 256. Defaults cover a 10-byte response frame
   * (bytes 2..7).
   */
  calculateChecksum: (data: number[], from: number = 2, to: number = 8): number => {
    let checksum = 0;
    for (let i = from; i < to; i++) {
      checksum += data[i];
    }
    return checksum & 0xff;
  },

  /**
   * True for a complete, well-formed 10-byte frame (data or command reply)
   * with a matching checksum.
   */
  isValidFrame: (frame: number[]): boolean => {
    if (frame.length !== SensorPacket.FRAME_LENGTH) {
      return false;
    }
    if (frame[0] !== SensorPacket.HEAD || frame[9] !== SensorPacket.TAIL) {
      return false;
    }
    if (frame[1] !== SensorPacket.TYPE_DATA && frame[1] !== SensorPacket.TYPE_REPLY) {
      return false;
    }
    return SensorPacket.calculateChecksum(frame) === frame[8];
  },

  /**
   * Extract PM2.5 and PM10 (µg/m³) from a valid data frame.
   */
  extractValues: (frame: number[]): { pm25: number; pm10: number } | null => {
    if (!SensorPacket.isValidFrame(frame) || frame[1] !== SensorPacket.TYPE_DATA) {
      return null;
    }
    const pm25 = (frame[3] * 256 + frame[2]) / 10;
    const pm10 = (frame[5] * 256 + frame[4]) / 10;
    // The sensor's documented range is 0..999.9
    if (pm25 > 1000 || pm10 > 1000) {
      return null;
    }
    return { pm25, pm10 };
  },

  /**
   * Device id (two bytes) from any valid frame, as a hex string like "5651".
   */
  deviceIdOf: (frame: number[]): string => {
    return ByteUtils.padHex(frame[6]).toUpperCase() + ByteUtils.padHex(frame[7]).toUpperCase();
  },

  /**
   * Pull every complete, valid frame out of a byte stream.
   *
   * USB serial delivers arbitrary chunks: a frame may arrive split across two
   * reads, two frames may arrive in one read, and a read may start mid-frame.
   * This scans for a valid frame at each candidate head byte, resynchronising
   * on the next byte when the candidate fails validation, and returns the
   * unconsumed tail so the caller can prepend it to the next chunk.
   */
  extractFrames: (buffer: number[]): { frames: number[][]; rest: number[] } => {
    const frames: number[][] = [];
    let i = 0;
    while (i < buffer.length) {
      if (buffer[i] !== SensorPacket.HEAD) {
        i++;
        continue;
      }
      if (buffer.length - i < SensorPacket.FRAME_LENGTH) {
        break; // incomplete frame; wait for more bytes
      }
      const candidate = buffer.slice(i, i + SensorPacket.FRAME_LENGTH);
      if (SensorPacket.isValidFrame(candidate)) {
        frames.push(candidate);
        i += SensorPacket.FRAME_LENGTH;
      } else {
        i++;
      }
    }
    return { frames, rest: buffer.slice(i) };
  },
};

/**
 * SDS011/SDS021 command management
 */
export const SensorCommands = {
  WAKE: 'wake',
  SLEEP: 'sleep',
  READ: 'read',
  VERSION: 'version',
  ACTIVE_MODE: 'active-mode',
  CONTINUOUS: 'continuous',

  COMMAND_LENGTH: 19,

  /**
   * Build a 19-byte command frame addressed to all devices (id FF FF).
   */
  generate: (command: string): number[] => {
    // AA B4 cmd d1..d12 FF FF CS AB
    const cmd = [0xaa, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0xab];

    switch (command) {
      case SensorCommands.WAKE:
        cmd[2] = 0x06; // sleep/work
        cmd[3] = 0x01; // write
        cmd[4] = 0x01; // work
        break;
      case SensorCommands.SLEEP:
        cmd[2] = 0x06; // sleep/work
        cmd[3] = 0x01; // write
        cmd[4] = 0x00; // sleep
        break;
      case SensorCommands.READ:
        cmd[2] = 0x04; // query data (answered only in query reporting mode)
        break;
      case SensorCommands.VERSION:
        cmd[2] = 0x07; // firmware version; read-only, replies AA C5 07 yy mm dd id id cs AB
        break;
      case SensorCommands.ACTIVE_MODE:
        cmd[2] = 0x02; // reporting mode
        cmd[3] = 0x01; // write
        cmd[4] = 0x00; // active (report every second)
        break;
      case SensorCommands.CONTINUOUS:
        cmd[2] = 0x08; // working period
        cmd[3] = 0x01; // write
        cmd[4] = 0x00; // 0 = continuous
        break;
      default:
        throw new Error(`Unknown sensor command: ${command}`);
    }

    cmd[17] = SensorPacket.calculateChecksum(cmd, 2, 17);
    return cmd;
  },
};

/**
 * Air Quality Index (AQI) categorization
 */
export const AirQualityIndex = {
  /**
   * Get AQI category for PM2.5 value
   */
  getPM25Category: (value: number): string => {
    if (value <= 12) {return 'Good';}
    if (value <= 35) {return 'Moderate';}
    if (value <= 55) {return 'Unhealthy for Sensitive Groups';}
    if (value <= 150) {return 'Unhealthy';}
    if (value <= 250) {return 'Very Unhealthy';}
    return 'Hazardous';
  },

  /**
   * Get AQI category for PM10 value
   */
  getPM10Category: (value: number): string => {
    if (value <= 54) {return 'Good';}
    if (value <= 154) {return 'Moderate';}
    if (value <= 254) {return 'Unhealthy for Sensitive Groups';}
    if (value <= 354) {return 'Unhealthy';}
    if (value <= 424) {return 'Very Unhealthy';}
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
  },
};

// For backward compatibility
export const generateCommandBytes = SensorCommands.generate;
export const calculateChecksum = SensorPacket.calculateChecksum;
export const extractPMValues = SensorPacket.extractValues;
export const byteArrayToHexString = ByteUtils.toHexString;
export const byteArrayToDecString = ByteUtils.toDecString;
export const padHex = ByteUtils.padHex;
export const getPM25Category = AirQualityIndex.getPM25Category;
export const getPM10Category = AirQualityIndex.getPM10Category;
export const getPMCategoryStyle = AirQualityIndex.getCategoryStyle;
