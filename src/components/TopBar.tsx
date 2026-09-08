import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, fonts } from '../theme';
import { BackIcon } from './Icons';

export type SensorPresence = 'connected' | 'found' | 'none';

interface TopBarProps {
  title: string;
  presence: SensorPresence;
  sensorLabel: string;
  onBack?: () => void;
}

const DOT_COLOR: Record<SensorPresence, string> = {
  connected: colors.green,
  found: colors.amber,
  none: colors.idle,
};

/**
 * "Aqui" (or a back chevron and a title) on the left, sensor presence on the right.
 */
const TopBar: React.FC<TopBarProps> = ({ title, presence, sensorLabel, onBack }) => (
  <View style={styles.row}>
    {onBack ? (
      <TouchableOpacity onPress={onBack} style={styles.back} accessibilityRole="button" accessibilityLabel="Back">
        <BackIcon />
        <Text style={styles.title}>{title}</Text>
      </TouchableOpacity>
    ) : (
      <Text style={styles.title}>{title}</Text>
    )}
    <View style={styles.status}>
      <View style={[styles.dot, { backgroundColor: DOT_COLOR[presence] }]} />
      <Text style={styles.statusText}>{sensorLabel}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  row: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 44,
    paddingRight: 12,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
    letterSpacing: 0.15,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
});

export default TopBar;
