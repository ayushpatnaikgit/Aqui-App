import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';
import { UsbIcon, LockIcon } from './Icons';
import GhostButton from './GhostButton';

interface EmptyStateProps {
  icon: 'usb' | 'lock';
  title: string;
  body: string;
  footerLeft: string;
  footerRight?: React.ReactNode;
  buttonLabel: string;
  onButton: () => void;
}

/**
 * Shared layout for the states without a reading: no sensor, waiting for USB
 * permission, connecting. Same skeleton as the live screen so nothing jumps.
 */
const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, body, footerLeft, footerRight, buttonLabel, onButton }) => (
  <View style={styles.container}>
    <View style={styles.center}>
      {icon === 'usb' ? <UsbIcon /> : <LockIcon />}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
    <View style={styles.footer}>
      <View style={styles.rule} />
      <View style={styles.footerRow}>
        <Text style={styles.footerText}>{footerLeft}</Text>
        {footerRight}
      </View>
      <GhostButton label={buttonLabel} onPress={onButton} />
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    gap: 20,
  },
  title: {
    fontFamily: fonts.extrabold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.2,
    color: colors.ink,
    includeFontPadding: false,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 16,
    lineHeight: 23,
    color: colors.muted,
  },
  footer: {
    gap: 14,
  },
  rule: {
    height: 1,
    backgroundColor: colors.rule,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  footerText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
});

export const LastReading: React.FC<{ pm25: number; pm10: number }> = ({ pm25, pm10 }) => (
  <View style={lastStyles.row}>
    <Text style={lastStyles.value}>{Math.round(pm25)}</Text>
    <Text style={lastStyles.sep}>·</Text>
    <Text style={lastStyles.value}>{Math.round(pm10)}</Text>
    <Text style={lastStyles.sep}>µg/m³</Text>
  </View>
);

const lastStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  value: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
  sep: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
});

export default EmptyState;
