import { Platform, type TextStyle } from 'react-native';

/** Grows a big amount input with its content (web inputs don't size to their text). */
export function amountWidth(text: string, charWidth = 27) {
  return Math.max(64, Math.min(260, (text.length || 1) * charWidth + 12));
}

/** Removes the browser focus ring from custom-styled inputs on web. */
export const noWebOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle;
