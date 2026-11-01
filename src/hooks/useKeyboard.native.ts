import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * Native apps handle most keyboard layout with KeyboardAvoidingView, so `inset` stays 0. `height` is the
 * keyboard's height, for floating bars that need to sit just above it.
 */
export function useKeyboard(): { inset: number; visibleHeight: number | null; height: number } {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return { inset: 0, visibleHeight: null, height };
}

export const isTouchWeb = () => false;
export const blurActiveField = () => Keyboard.dismiss();
