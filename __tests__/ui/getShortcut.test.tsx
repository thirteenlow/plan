import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import React from 'react';
import { Linking } from 'react-native';
import { useCloud } from '@/cloud/cloudStore';
import { GetShortcut } from '@/components/GetShortcut';
import { secretStore } from '@/security/deviceKey';
import { shortcutFor } from '@/utils/autoLogSources';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

describe('Get the shortcut (iPhone one-tap setup)', () => {
  beforeEach(() => {
    useCloud.setState({ status: 'ready', user: { id: 'u1' } as never });
    jest.spyOn(secretStore, 'get').mockResolvedValue('k'.repeat(40));
  });
  afterEach(() => jest.restoreAllMocks());

  it('has links for Apple Pay, Wallet, PayLah! emails and Grab', () => {
    expect(shortcutFor({ match: 'Apple Pay' })).toMatch(/^https:\/\/www\.icloud\.com\/shortcuts\//);
    expect(shortcutFor({ match: 'wallet' })).toMatch(/icloud/);
    expect(shortcutFor({ match: 'DBS PayLah! emails' })).toMatch(/icloud/);
    expect(shortcutFor({ match: 'Grab' })).toMatch(/icloud/);
    // Other apps use the general App alerts shortcut instead.
    expect(shortcutFor({ match: 'YouTrip' })).toBeUndefined();
  });

  it('copies the key, then opens the shortcut', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const ui = await render(<GetShortcut name="Wallet" link="https://www.icloud.com/shortcuts/x" what="payment" logged={false} status="Nothing logged yet" />);
    await fireEvent.press(ui.getByText('Get the Wallet shortcut'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://www.icloud.com/shortcuts/x'));
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('k'.repeat(40));
    expect(ui.getByText('Open it again')).toBeTruthy();
  });

  it('the general shortcut asks for the app, and says to switch the trigger’s app when it’s not YouTrip', async () => {
    const ui = await render(<GetShortcut name="ShopBack" link="x" what="payment" logged={false} status="" appName={{ name: 'ShopBack', presetApp: 'YouTrip' }} />);
    expect(ui.getByText(/type ShopBack/)).toBeTruthy();
    expect(ui.getByText(/tap YouTrip at the top and pick ShopBack/)).toBeTruthy();
  });
});
