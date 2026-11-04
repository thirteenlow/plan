import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import React from 'react';
import { Text } from 'react-native';
import SettingsScreen from '@/app/settings';
import { signOutEverywhereOnDevice } from '@/cloud';
import { useCloud } from '@/cloud/cloudStore';
import { useDialog } from '@/components/dialogStore';
import { useStore } from '@/store/store';
import { makeBudget } from '../helpers/budget';

// The real sign-out talks to Supabase; here it just clears the device like the real one does.
jest.mock('@/cloud', () => ({
  ...jest.requireActual('@/cloud'),
  signOutEverywhereOnDevice: jest.fn(async () => {
    const { useStore: store } = jest.requireActual('@/store/store');
    store.setState({ budgets: {}, activeBudgetId: null, sync: {} });
  }),
}));

const Home = () => <Text testID="home">home</Text>;

beforeEach(() => {
  const d = makeBudget();
  useStore.setState({ budgets: { [d.id]: d }, activeBudgetId: d.id, sync: {}, hydrated: true });
  useCloud.setState({ status: 'ready', user: { id: 'u1', email: 'test@example.com' } as never });
});

/** Answers Plan's confirmation dialog (DialogHost isn't mounted in these tests). */
async function answerDialog(title: string, ok: boolean) {
  await waitFor(() => expect(useDialog.getState().current?.title).toBe(title));
  await act(async () => {
    useDialog.getState().current!.resolve(ok);
    useDialog.setState({ current: null });
  });
}

it('Log out signs out and leaves Settings (no refresh needed)', async () => {
  await renderRouter({ index: Home, settings: SettingsScreen }, { initialUrl: '/settings' });
  await fireEvent.press(await screen.findByText('Log out'));
  // Tap "Log out" in the confirmation dialog.
  await answerDialog('Log out?', true);
  await waitFor(() => expect(signOutEverywhereOnDevice).toHaveBeenCalled());
  await waitFor(() => expect(screen).toHavePathname('/'));
  expect(screen.queryByText('Log out')).toBeNull();
});

it('cancelling the confirmation keeps you signed in on Settings', async () => {
  (signOutEverywhereOnDevice as jest.Mock).mockClear();
  await renderRouter({ index: Home, settings: SettingsScreen }, { initialUrl: '/settings' });
  await fireEvent.press(await screen.findByText('Log out'));
  await answerDialog('Log out?', false);
  expect(signOutEverywhereOnDevice).not.toHaveBeenCalled();
  expect(screen).toHavePathname('/settings');
});

it('Log out is hidden when signed out', async () => {
  useCloud.setState({ status: 'signedOut', user: null });
  await renderRouter({ index: Home, settings: SettingsScreen }, { initialUrl: '/settings' });
  await screen.findByText('Delete this budget');
  expect(screen.queryByText('Log out')).toBeNull();
});
