import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { colors } from '../theme';

interface IconProps {
  size?: number;
  color?: string;
}

/** USB plug: a stem with an arrow head, the usual trident simplified. */
export const UsbIcon: React.FC<IconProps> = ({ size = 56, color = colors.ink }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 3v18" />
    <Path d="M12 21l-4-4" />
    <Path d="M12 21l4-4" />
    <Circle cx={12} cy={6} r={1.5} />
    <Path d="M8 9l4 3 4-3" />
  </Svg>
);

/** Padlock, for the USB permission state. */
export const LockIcon: React.FC<IconProps> = ({ size = 56, color = colors.ink }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={4} y={10} width={16} height={11} rx={2} />
    <Path d="M8 10V7a4 4 0 0 1 8 0v3" />
    <Circle cx={12} cy={15.5} r={1.5} />
  </Svg>
);

/** Back chevron. */
export const BackIcon: React.FC<IconProps> = ({ size = 24, color = colors.ink }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M15 5l-7 7 7 7" />
  </Svg>
);
