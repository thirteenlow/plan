import { useEffect, useState } from 'react';

/**
 * Web: how much of the bottom of the page the on-screen keyboard covers, and the height left above it.
 * iOS Safari doesn't resize the page when the keyboard opens, so bottom sheets and footers would end up
 * behind it. (Android Chrome resizes the page itself, so this stays 0 there.)
 */
export function useKeyboard(): { inset: number; visibleHeight: number | null; height: number } {
  const [state, setState] = useState<{ inset: number; visibleHeight: number | null }>({ inset: 0, visibleHeight: null });
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setState((s) => (s.inset === inset && s.visibleHeight === vv.height ? s : { inset: inset > 40 ? inset : 0, visibleHeight: vv.height }));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  // On the web the keyboard's height is the part of the page it covers.
  return { ...state, height: state.inset };
}

/** Phones and tablets in a browser: don't pop the keyboard up unless the user taps a text box. */
export const isTouchWeb = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

/** Closes the keyboard by taking focus off whatever text box has it. */
export function blurActiveField() {
  if (typeof document === 'undefined') return;
  const el = document.activeElement as HTMLElement | null;
  if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName)) el.blur();
}
