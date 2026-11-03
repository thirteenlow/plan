import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import React from 'react';
import { Alert, Text } from 'react-native';
import SettingsScreen from '@/app/settings';
import { signOutEverywhereOnDevice } from '@/cloud';
import { useCloud } from '@/cloud/cloudStore';
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

it('Log out signs out and leaves Settings (no refresh needed)', async () => {
  // Tap "Log out" in the confirmation alert.
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
  await renderRouter({ index: Home, settings: SettingsScreen }, { initialUrl: '/settings' });
  await fireEvent.press(await screen.findByText('Log out'));
  await waitFor(() => expect(signOutEverywhereOnDevice).toHaveBeenCalled());
  await waitFor(() => expect(screen).toHavePathname('/'));
  expect(screen.queryByText('Log out')).toBeNull();
});

it('cancelling the confirmation keeps you signed in on Settings', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[0]?.onPress?.());
  (signOutEverywhereOnDevice as jest.Mock).mockClear();
  await renderRouter({ index: Home, settings: SettingsScreen }, { initialUrl: '/settings' });
  await fireEvent.press(await screen.findByText('Log out'));
  expect(signOutEverywhereOnDevice).not.toHaveBeenCalled();
  expect(screen).toHavePathname('/settings');
});

it('Log out is hidden when signed out', async () => {
  useCloud.setState({ status: 'signedOut', user: null });
  await renderRouter({ index: Home, settings: SettingsScreen }, { initialUrl: '/settings' });
  await screen.findByText('Delete this budget');
  expect(screen.queryByText('Log out')).toBeNull();
});
