import React from 'react';
import { Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, fonts } from '../theme';

interface GhostButtonProps {
  label: string;
  onPress: () => void;
}

/** The one button style in the design: outlined, 48 high, 12 radius. */
const GhostButton: React.FC<GhostButtonProps> = ({ label, onPress }) => (
  <TouchableOpacity style={styles.button} onPress={onPress} accessibilityRole="button">
    <Text style={styles.label}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  button: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    color: colors.ink,
  },
});

export default GhostButton;
