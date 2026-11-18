import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Linking } from 'react-native';
import { colors, fonts } from '../theme';
import Button from './Button';

// Opens in the browser through an intent; the app itself has no internet permission.
const PRIVACY_POLICY_URL = 'https://aqui.xkdr.org/privacy.html';

export interface LogEntry {
  id: number;
  time: string;
  raw: string;
  friendly: string | null;
}

interface LogsScreenProps {
  entries: LogEntry[];
  developer: boolean;
  onToggleDeveloper: (value: boolean) => void;
  onClear: () => void;
}

/**
 * The log as its own screen: a square developer switch, then one row per
 * entry, newest first. In plain mode only entries with a friendly wording show.
 */
const LogsScreen: React.FC<LogsScreenProps> = ({ entries, developer, onToggleDeveloper, onClear }) => {
  const visible = developer ? entries : entries.filter(e => e.friendly !== null);
  const newestFirst = [...visible].reverse();
  return (
    <View style={styles.container}>
      <Pressable
        style={styles.toggleRow}
        onPress={() => onToggleDeveloper(!developer)}
        accessibilityRole="switch"
        accessibilityState={{ checked: developer }}
        accessibilityLabel="Developer detail">
        <Text style={styles.toggleLabel}>Developer detail</Text>
        <View style={[styles.track, developer && styles.trackOn]}>
          <View style={[styles.knob, developer && styles.knobOn]} />
        </View>
      </Pressable>
      <FlatList
        style={styles.list}
        data={newestFirst}
        keyExtractor={item => String(item.id)}
        ListEmptyComponent={<Text style={styles.empty}>Nothing logged yet.</Text>}
        ListFooterComponent={newestFirst.length > 0 ? <View style={styles.rule} /> : null}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.time}>{item.time}</Text>
            <Text style={styles.message}>{developer ? item.raw : item.friendly}</Text>
          </View>
        )}
      />
      <Button label="Clear" variant="outline" onPress={onClear} />
      <Pressable
        style={styles.policy}
        onPress={() => Linking.openURL(PRIVACY_POLICY_URL).catch(() => {})}
        accessibilityRole="link"
        accessibilityLabel="Privacy policy">
        <Text style={styles.policyText}>Privacy policy</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 16,
  },
  toggleRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontFamily: fonts.merriweather,
    fontSize: 14,
    lineHeight: 25,
    color: colors.ink,
  },
  track: {
    width: 48,
    height: 26,
    padding: 2,
    borderWidth: 1,
    borderColor: colors.ink,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  trackOn: {
    backgroundColor: colors.ink,
    alignItems: 'flex-end',
  },
  knob: {
    width: 20,
    height: 20,
    backgroundColor: colors.ink,
  },
  knobOn: {
    backgroundColor: colors.paper,
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
  },
  time: {
    width: 64,
    fontFamily: fonts.montserratSemiBold,
    fontSize: 12,
    lineHeight: 25,
    color: colors.ink,
    fontVariant: ['tabular-nums'],
  },
  message: {
    flex: 1,
    fontFamily: fonts.merriweather,
    fontSize: 14,
    lineHeight: 25,
    color: colors.ink,
  },
  rule: {
    height: 1,
    backgroundColor: colors.rule,
  },
  policy: {
    minHeight: 44,
    alignSelf: 'center',
    justifyContent: 'center',
  },
  policyText: {
    fontFamily: fonts.montserratSemiBold,
    fontSize: 12,
    color: colors.muted,
    textDecorationLine: 'underline',
  },
  empty: {
    paddingVertical: 12,
    fontFamily: fonts.merriweather,
    fontSize: 14,
    lineHeight: 25,
    color: colors.muted,
  },
});

export default LogsScreen;
