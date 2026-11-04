import { create } from 'zustand';

export interface DialogRequest {
  title: string;
  message?: string;
  confirmLabel: string;
  /** null for a plain notice with a single button */
  cancelLabel: string | null;
  destructive: boolean;
  /** Ionicons name for the badge; defaults by kind (trash, question, info) */
  icon?: string;
  resolve: (ok: boolean) => void;
}

/** The in-app dialog being shown, rendered by DialogHost. */
export const useDialog = create<{ current: DialogRequest | null }>(() => ({ current: null }));

export function showDialog(req: Omit<DialogRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    // A dialog that is already open is answered "no" rather than left hanging.
    useDialog.getState().current?.resolve(false);
    useDialog.setState({ current: { ...req, resolve } });
  });
}
