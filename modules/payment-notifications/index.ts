import { type NativeModule, requireOptionalNativeModule } from 'expo';

/** A payment notification the phone kept for Plan: the app's name, and the notification's title and text. */
export type QueuedNotification = { id: number; app: string; title: string; text: string; postedAt: number };

type Events = { onPayment(): void };

declare class PaymentNotificationsModule extends NativeModule<Events> {
  hasAccess(): boolean;
  openAccessSettings(): void;
  configure(wallets: boolean, apps: string[]): void;
  getConfig(): { wallets: boolean; apps: string[]; paused: boolean };
  setPaused(paused: boolean): void;
  peek(): QueuedNotification[];
  ack(upTo: number): void;
}

/** The Android app's notification listener; null on the web and iPhone (and in Expo Go). */
export default requireOptionalNativeModule<PaymentNotificationsModule>('PaymentNotifications');
