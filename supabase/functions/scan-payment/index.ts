// Plan: screenshot capture. The "Scan Payment" iPhone Shortcut posts a screenshot of a payment screen here
// (multipart form: token + image). Claude reads the amount and merchant, and the result lands in the same
// payment inbox the app already imports from. The screenshot is never stored.
//
// Deploy:  supabase functions deploy scan-payment --no-verify-jwt
// Secrets: supabase secrets set ANTHROPIC_AUTH_TOKEN=… ANTHROPIC_BASE_URL=https://llm-gateway.aisg.sg/ ANTHROPIC_MODEL=claude-sonnet-4-6
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.)
import Anthropic from 'npm:@anthropic-ai/sdk@1';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_BYTES = 3_700_000; // Claude takes images up to 5 MB once base64-encoded
const DAILY_LIMIT = Number(Deno.env.get('SCAN_DAILY_LIMIT') ?? 30);
const SCREENSHOT_CARD = 'Screenshot'; // marks inbox rows that came from a scan (see src/cloud/inbox.ts)

const anthropic = new Anthropic({
  apiKey: Deno.env.get('ANTHROPIC_API_KEY') ?? null,
  authToken: Deno.env.get('ANTHROPIC_AUTH_TOKEN') ?? null,
  baseURL: Deno.env.get('ANTHROPIC_BASE_URL') || undefined,
});
const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-sonnet-4-6';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const PROMPT = `This is a phone screenshot taken right after a payment (a payment confirmation, receipt, banking or wallet app, or checkout screen).
Find the payment that was just made and return:
- is_payment: false if the screen doesn't show a completed or pending payment
- amount: the total paid as a plain number with a dot for decimals and no currency symbol or thousands separators (e.g. "1234.50")
- currency: the ISO code if shown or obvious, otherwise ""
- merchant: who was paid, as a short clean name (e.g. "Grab", "FairPrice Finest"), or "" if not shown
If several amounts appear, use the final total actually charged, not subtotals, balances or rewards.`;

const SCHEMA = {
  type: 'object',
  properties: {
    is_payment: { type: 'boolean' },
    amount: { type: 'string' },
    currency: { type: 'string' },
    merchant: { type: 'string' },
  },
  required: ['is_payment', 'amount', 'currency', 'merchant'],
  additionalProperties: false,
};

type Scan = { is_payment: boolean; amount: string; currency: string; merchant: string };
type Usage = { model: string; input_tokens: number; output_tokens: number };

/** Claude accepts PNG, JPEG, GIF and WebP; Shortcuts doesn't always label the file, so sniff the bytes. */
function mediaType(b: Uint8Array): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function readScreenshot(bytes: Uint8Array): Promise<{ scan: Scan; usage: Usage }> {
  const type = mediaType(bytes);
  if (!type) throw new Error('unsupported image');
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: type, data: toBase64(bytes) } },
          { type: 'text', text: PROMPT },
        ],
      },
    ],
  });
  // Real token counts, as billed (thinking tokens are included in output_tokens).
  const usage: Usage = { model: res.model, input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens };
  console.log(JSON.stringify({ event: 'scan_usage', ...usage }));
  if (res.stop_reason === 'refusal') return { scan: { is_payment: false, amount: '', currency: '', merchant: '' }, usage };
  const text = res.content.find((b) => b.type === 'text')?.text ?? '';
  return { scan: JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')) as Scan, usage };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });

  let token = '';
  let bytes: Uint8Array | null = null;
  try {
    const form = await req.formData();
    token = String(form.get('token') ?? '').trim();
    const image = form.get('image');
    if (image instanceof File) bytes = new Uint8Array(await image.arrayBuffer());
  } catch {
    return reply(400, { error: 'Send a form with token and image.' });
  }
  if (!token) return reply(401, { error: 'Missing token.' });
  if (!bytes?.length) return reply(400, { error: 'Missing image. Set the image field to File.' });
  if (bytes.length > MAX_BYTES) return reply(413, { error: 'Screenshot too large. Add Convert Image (JPEG) before sending.' });

  // Check the key and limits before spending anything on Claude.
  const { data: uid, error } = await admin.rpc('begin_scan', { token, daily_limit: DAILY_LIMIT });
  if (error || !uid) {
    const msg = error?.message ?? '';
    if (/invalid key/.test(msg)) return reply(401, { error: 'Key not accepted. Copy the key from Plan again.' });
    if (/limit|full/.test(msg)) return reply(429, { error: msg.charAt(0).toUpperCase() + msg.slice(1) + '.' });
    console.error('begin_scan', msg);
    return reply(500, { error: 'Server error.' });
  }

  let scan: Scan;
  let usage: Usage;
  try {
    ({ scan, usage } = await readScreenshot(bytes));
  } catch (e) {
    if (e instanceof Error && e.message === 'unsupported image') return reply(415, { error: 'Send a PNG or JPEG screenshot.' });
    if (e instanceof Anthropic.RateLimitError) return reply(429, { error: 'Scanning is busy. Try again in a minute.' });
    if (e instanceof Anthropic.APIError) {
      console.error('claude', e.status, e.message);
      return reply(502, { error: 'Couldn’t read the screenshot right now.' });
    }
    console.error('scan', e);
    return reply(502, { error: 'Couldn’t read the screenshot.' });
  }

  const { error: usageError } = await admin.rpc('record_scan_tokens', { p_user: uid, p_input: usage.input_tokens, p_output: usage.output_tokens });
  if (usageError) console.error('record_scan_tokens', usageError.message);

  const amount = scan.amount.replace(/[^0-9.]/g, '');
  if (!scan.is_payment || !Number(amount)) return reply(422, { error: 'No payment found on that screen.', usage });

  const merchant = scan.merchant.trim().slice(0, 120) || null;
  const { error: insertError } = await admin.from('payment_inbox').insert({ user_id: uid, amount: amount.slice(0, 40), merchant, card: SCREENSHOT_CARD });
  if (insertError) {
    console.error('insert', insertError.message);
    return reply(500, { error: 'Server error.' });
  }
  const shown = `${scan.currency ? scan.currency + ' ' : ''}${amount}${merchant ? ` at ${merchant}` : ''}`;
  return reply(200, { ok: true, amount, currency: scan.currency, merchant, message: `Logged ${shown}`, usage });
});
