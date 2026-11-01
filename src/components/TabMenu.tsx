import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActionSheet } from './Sheet';
import { IconButton } from './ui';
import type { IconName } from '@/utils/icons';

export interface MenuAction {
  label: string;
  icon: IconName;
  onPress: () => void;
  destructive?: boolean;
  hint?: string;
}

/** The "•••" button on tab roots: screen-specific actions plus Settings. */
export function TabMenu({ title, actions = [], plain }: { title?: string; actions?: MenuAction[]; plain?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton icon="ellipsis-horizontal" label="More options" tone={plain ? 'plain' : 'surface'} onPress={() => setOpen(true)} size={plain ? 36 : 44} />
      <ActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={title}
        actions={[
          ...actions,
          { label: 'Settings', icon: 'settings-outline', onPress: () => router.push('/settings') },
        ]}
      />
    </>
  );
}
