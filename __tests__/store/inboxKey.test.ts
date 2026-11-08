import { readReceipt } from '@/cloud/inbox';
import { useCloud } from '@/cloud/cloudStore';
import { secretStore } from '@/security/deviceKey';

const mockRpc = jest.fn(async () => ({ error: null }));
jest.mock('@/cloud/supabase', () => ({ getSupabase: () => ({ rpc: mockRpc }) }));

const reply = (status: number, body: object) => ({ status, ok: status < 300, json: async () => body }) as Response;

describe('a key replaced by another device', () => {
  beforeEach(() => {
    mockRpc.mockClear();
    useCloud.setState({ user: { id: 'u1' } as never });
    jest.spyOn(secretStore, 'get').mockResolvedValue('k'.repeat(40));
  });
  afterEach(() => jest.restoreAllMocks());

  it('is registered again and the scan retried, instead of failing', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(reply(401, { error: 'Key not accepted.' }))
      .mockResolvedValueOnce(reply(200, { amount: '4.50', merchant: 'Kopi', currency: 'SGD' }));
    await expect(readReceipt('data:image/jpeg;base64,x')).resolves.toMatchObject({ amount: '4.50', merchant: 'Kopi' });
    expect(mockRpc).toHaveBeenCalledWith('set_inbox_key', { p_hash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('still says so if the server refuses it again', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(reply(401, { error: 'Key not accepted.' }));
    await expect(readReceipt('data:image/jpeg;base64,x')).rejects.toThrow('Key not accepted.');
  });
});
