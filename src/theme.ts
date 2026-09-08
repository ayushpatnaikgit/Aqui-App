/**
 * Visual system for the "Big number" design: ink on paper, Manrope, one
 * accent taken from the reading's category.
 */
import { AirQualityIndex } from './utils/sensorUtils';

export const colors = {
  paper: '#faf8f3',
  ink: '#1f1d1a',
  muted: '#6b6560',
  rule: '#e6e1d8',
  border: '#d9d3c8',
  green: '#2f9e5b',
  amber: '#e0a52a',
  idle: '#c9c2b6',
  white: '#ffffff',
};

/**
 * Static Manrope faces bundled in android/app/src/main/assets/fonts.
 * Use the face name as fontFamily; never combine with fontWeight, or
 * Android will synthesise a second bold on top.
 */
export const fonts = {
  regular: 'Manrope-Regular',
  medium: 'Manrope-Medium',
  semibold: 'Manrope-SemiBold',
  extrabold: 'Manrope-ExtraBold',
};

export interface Band {
  label: string;
  hint: string;
  bg: string;
  fg: string;
}

const BANDS: Record<string, Band> = {
  Good: { label: 'Good', hint: 'clean air right now', bg: '#d7f0df', fg: '#1e6b3c' },
  Moderate: { label: 'Moderate', hint: 'fine for most people', bg: '#f8e9a6', fg: '#6d4f00' },
  'Unhealthy for Sensitive Groups': {
    label: 'Sensitive groups',
    hint: 'take care if you are sensitive',
    bg: '#fbd9b5',
    fg: '#8a4b00',
  },
  Unhealthy: { label: 'Unhealthy', hint: 'everyone may feel effects', bg: '#f9c9c4', fg: '#8f1f18' },
  'Very Unhealthy': { label: 'Very unhealthy', hint: 'health alert, stay inside', bg: '#e6d0f2', fg: '#5e2a80' },
  Hazardous: { label: 'Hazardous', hint: 'emergency conditions', bg: '#edc7d6', fg: '#6e1436' },
};

export const pm25Band = (value: number): Band => BANDS[AirQualityIndex.getPM25Category(value)];
export const pm10Band = (value: number): Band => BANDS[AirQualityIndex.getPM10Category(value)];
