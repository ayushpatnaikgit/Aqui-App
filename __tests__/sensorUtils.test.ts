import { ByteUtils, SensorCommands, SensorPacket } from '../src/utils/sensorUtils';

// Real frames captured from an SDS011 (device id 56 51) on 2026-09-08.
const FRAME_A = ByteUtils.fromHexString('AA C0 F2 00 7E 01 56 51 18 AB'); // 24.2 / 38.2
const FRAME_B = ByteUtils.fromHexString('AA C0 F3 00 6D 01 56 51 08 AB'); // 24.3 / 36.5
const REPLY_VERSION = ByteUtils.fromHexString('AA C5 07 12 0B 10 56 51 DB AB');

describe('ByteUtils.fromHexString', () => {
  it('parses compact and spaced hex', () => {
    expect(ByteUtils.fromHexString('AAC0')).toEqual([0xaa, 0xc0]);
    expect(ByteUtils.fromHexString('aa c0 ')).toEqual([0xaa, 0xc0]);
  });
  it('ignores a trailing odd nibble', () => {
    expect(ByteUtils.fromHexString('AAC')).toEqual([0xaa]);
  });
});

describe('SensorPacket.isValidFrame / extractValues', () => {
  it('accepts a real data frame and decodes it', () => {
    expect(SensorPacket.isValidFrame(FRAME_A)).toBe(true);
    expect(SensorPacket.extractValues(FRAME_A)).toEqual({ pm25: 24.2, pm10: 38.2 });
    expect(SensorPacket.deviceIdOf(FRAME_A)).toBe('5651');
  });
  it('accepts a command reply but does not decode it as a reading', () => {
    expect(SensorPacket.isValidFrame(REPLY_VERSION)).toBe(true);
    expect(SensorPacket.extractValues(REPLY_VERSION)).toBeNull();
  });
  it('rejects a bad checksum', () => {
    const bad = [...FRAME_A];
    bad[8] = (bad[8] + 1) & 0xff;
    expect(SensorPacket.isValidFrame(bad)).toBe(false);
    expect(SensorPacket.extractValues(bad)).toBeNull();
  });
  it('rejects wrong length, head or tail', () => {
    expect(SensorPacket.isValidFrame(FRAME_A.slice(0, 9))).toBe(false);
    expect(SensorPacket.isValidFrame([0x00, ...FRAME_A.slice(1)])).toBe(false);
    expect(SensorPacket.isValidFrame([...FRAME_A.slice(0, 9), 0x00])).toBe(false);
  });
});

describe('SensorPacket.extractFrames (stream reassembly)', () => {
  it('returns one frame from one exact chunk', () => {
    const { frames, rest } = SensorPacket.extractFrames(FRAME_A);
    expect(frames).toEqual([FRAME_A]);
    expect(rest).toEqual([]);
  });
  it('reassembles a frame split across two chunks', () => {
    const first = SensorPacket.extractFrames(FRAME_A.slice(0, 4));
    expect(first.frames).toEqual([]);
    expect(first.rest).toEqual(FRAME_A.slice(0, 4));
    const second = SensorPacket.extractFrames(first.rest.concat(FRAME_A.slice(4)));
    expect(second.frames).toEqual([FRAME_A]);
    expect(second.rest).toEqual([]);
  });
  it('returns two frames from one coalesced chunk', () => {
    const { frames, rest } = SensorPacket.extractFrames(FRAME_A.concat(FRAME_B));
    expect(frames).toEqual([FRAME_A, FRAME_B]);
    expect(rest).toEqual([]);
  });
  it('resynchronises when the chunk starts mid-frame', () => {
    const stream = FRAME_A.slice(6).concat(FRAME_B, FRAME_A.slice(0, 3));
    const { frames, rest } = SensorPacket.extractFrames(stream);
    expect(frames).toEqual([FRAME_B]);
    expect(rest).toEqual(FRAME_A.slice(0, 3));
  });
  it('does not treat 10 arbitrary bytes as a reading', () => {
    // Bytes 2..5 are small, which the old "modified format" fallback accepted.
    const garbage = [0x01, 0x02, 0x05, 0x00, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00];
    const { frames } = SensorPacket.extractFrames(garbage);
    expect(frames).toEqual([]);
  });
  it('skips a frame with a bad checksum and still finds the next one', () => {
    const bad = [...FRAME_A];
    bad[2] = bad[2] ^ 0x01;
    const { frames } = SensorPacket.extractFrames(bad.concat(FRAME_B));
    expect(frames).toEqual([FRAME_B]);
  });
  it('keeps an AA that begins an incomplete frame', () => {
    const { frames, rest } = SensorPacket.extractFrames([0x00, 0xaa, 0xc0, 0x01]);
    expect(frames).toEqual([]);
    expect(rest).toEqual([0xaa, 0xc0, 0x01]);
  });
});

describe('SensorCommands.generate', () => {
  it('builds the 19-byte firmware query the sensor actually answers', () => {
    // Verified on hardware: this exact packet elicits AA C5 07 ... AB.
    expect(ByteUtils.toHexStringCompact(SensorCommands.generate(SensorCommands.VERSION))).toBe(
      'AAB407000000000000000000000000FFFF05AB',
    );
  });
  it('is 19 bytes with the checksum over bytes 2..16 for every command', () => {
    for (const name of [
      SensorCommands.WAKE,
      SensorCommands.SLEEP,
      SensorCommands.READ,
      SensorCommands.VERSION,
      SensorCommands.ACTIVE_MODE,
      SensorCommands.CONTINUOUS,
    ]) {
      const cmd = SensorCommands.generate(name);
      expect(cmd).toHaveLength(SensorCommands.COMMAND_LENGTH);
      expect(cmd[0]).toBe(0xaa);
      expect(cmd[1]).toBe(0xb4);
      expect(cmd[15]).toBe(0xff);
      expect(cmd[16]).toBe(0xff);
      expect(cmd[18]).toBe(0xab);
      expect(cmd[17]).toBe(cmd.slice(2, 17).reduce((a, b) => a + b, 0) & 0xff);
    }
  });
  it('encodes wake as set sleep/work = work', () => {
    const cmd = SensorCommands.generate(SensorCommands.WAKE);
    expect(cmd.slice(2, 5)).toEqual([0x06, 0x01, 0x01]);
  });
  it('rejects unknown commands', () => {
    expect(() => SensorCommands.generate('bogus')).toThrow();
  });
});
