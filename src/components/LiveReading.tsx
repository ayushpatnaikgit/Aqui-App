import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, pm25Band, pm10Band } from '../theme';
import GhostButton from './GhostButton';

interface LiveReadingProps {
  pm25: number;
  pm10: number;
  avgPm25: number | null;
  avgPm10: number | null;
  readingsCount: number;
  lastUpdate: string | null;
  onShowLogs: () => void;
}

const whole = (v: number) => Math.round(v).toString();

/**
 * The "Big number" screen: PM2.5 as large as it goes, its category as a pill,
 * PM10 demoted to a single row, averages and time in the footer.
 */
const LiveReading: React.FC<LiveReadingProps> = ({ pm25, pm10, avgPm25, avgPm10, readingsCount, lastUpdate, onShowLogs }) => {
  const band = pm25Band(pm25);
  const band10 = pm10Band(pm10);
  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <View style={styles.numberBlock}>
          <Text style={styles.number} numberOfLines={1} adjustsFontSizeToFit={true}>
            {whole(pm25)}
          </Text>
          <Text style={styles.unit}>µg/m³ · PM2.5</Text>
        </View>

        <View style={styles.bandRow}>
          <View style={[styles.pill, { backgroundColor: band.bg }]}>
            <Text style={[styles.pillText, { color: band.fg }]}>{band.label}</Text>
          </View>
          <Text style={styles.hint}>{band.hint}</Text>
        </View>

        <View style={styles.rule} />

        <View style={styles.pm10Row}>
          <Text style={styles.pm10}>{whole(pm10)}</Text>
          <Text style={styles.pm10Unit}>µg/m³ · PM10</Text>
          <Text style={[styles.pm10Band, { color: band10.fg }]}>{band10.label}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={styles.footerRow}>
          <Text style={styles.footerText}>
            {avgPm25 !== null && avgPm10 !== null && readingsCount > 1
              ? `Average of last ${readingsCount}: ${whole(avgPm25)} · ${whole(avgPm10)}`
              : 'First reading'}
          </Text>
          <Text style={styles.footerText}>{lastUpdate ?? ''}</Text>
        </View>
        <GhostButton label="Logs" onPress={onShowLogs} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    gap: 18,
  },
  numberBlock: {
    gap: 4,
  },
  number: {
    fontFamily: fonts.extrabold,
    fontSize: 172,
    lineHeight: 160,
    letterSpacing: -10,
    color: colors.ink,
    marginLeft: -8,
    includeFontPadding: false,
  },
  unit: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.muted,
    letterSpacing: 0.3,
  },
  bandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pill: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    justifyContent: 'center',
  },
  pillText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
  hint: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
    flexShrink: 1,
  },
  rule: {
    height: 1,
    backgroundColor: colors.rule,
    marginTop: 12,
  },
  pm10Row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
  },
  pm10: {
    fontFamily: fonts.extrabold,
    fontSize: 44,
    letterSpacing: -1.8,
    color: colors.ink,
    includeFontPadding: false,
  },
  pm10Unit: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.muted,
  },
  pm10Band: {
    marginLeft: 'auto',
    fontFamily: fonts.semibold,
    fontSize: 14,
  },
  footer: {
    gap: 14,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
  },
});

export default LiveReading;
