import React from 'react';
import { View, Text, StyleSheet, FlatList, Switch } from 'react-native';
import { colors, fonts } from '../theme';
import GhostButton from './GhostButton';

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
 * The log as its own screen: a developer switch, then one row per entry,
 * newest first. In plain mode only entries with a friendly wording show.
 */
const LogsScreen: React.FC<LogsScreenProps> = ({ entries, developer, onToggleDeveloper, onClear }) => {
  const visible = developer ? entries : entries.filter(e => e.friendly !== null);
  const newestFirst = [...visible].reverse();
  return (
    <View style={styles.container}>
      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Developer detail</Text>
        <Switch
          value={developer}
          onValueChange={onToggleDeveloper}
          trackColor={{ false: colors.border, true: colors.ink }}
          thumbColor={colors.white}
        />
      </View>
      <FlatList
        style={styles.list}
        data={newestFirst}
        keyExtractor={item => String(item.id)}
        ListEmptyComponent={<Text style={styles.empty}>Nothing logged yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.time}>{item.time}</Text>
            <Text style={styles.message}>{developer ? item.raw : item.friendly}</Text>
          </View>
        )}
      />
      <GhostButton label="Clear" onPress={onClear} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: 20,
  },
  toggleRow: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
  },
  list: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: colors.rule,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.rule,
  },
  time: {
    width: 64,
    fontFamily: fonts.regular,
    fontSize: 13,
    color: colors.muted,
    fontVariant: ['tabular-nums'],
  },
  message: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  empty: {
    paddingVertical: 14,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.muted,
  },
});

export default LogsScreen;
