/**
 * Native builds: reminders here use the web app's push for now. App Store / Play Store builds would schedule
 * local notifications with expo-notifications instead.
 */
export type PushStatus = 'unsupported' | 'needsInstall' | 'denied' | 'off' | 'on';

export const pushConfigured = () => false;
export const pushStatus = async (): Promise<PushStatus> => 'unsupported';
export const enablePush = async (): Promise<PushStatus> => 'unsupported';
export const disablePush = async () => {};
export const showTestNotification = async (_title: string, _body: string) => {};
