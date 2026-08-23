/**
 * Shared Safaricom Daraja configuration and helpers.
 *
 * This exists because the host was previously built inline at four call sites
 * and had drifted into three different (all wrong) forms for production:
 *   https://safaricom.co.ke            — the marketing site, not the API
 *   https://production.safaricom.co.ke — does not resolve
 * The correct production host is api.safaricom.co.ke.
 */

/**
 * Reads an env var, tolerating the `KEY = value;` style that .env files get
 * written in by hand. dotenv keeps a trailing semicolon as part of the value,
 * which silently corrupts credentials — a consumer key with a trailing ";"
 * makes Daraja answer 400 with an empty body.
 */
function env(name: string, fallback = ''): string {
  const raw = process.env[name];
  if (raw === undefined || raw === null) return fallback;
  const cleaned = raw.trim().replace(/;+$/, '').trim().replace(/^['"]|['"]$/g, '');
  return cleaned || fallback;
}

export const MPESA_ENV = env('MPESA_ENV', 'sandbox') === 'production' ? 'production' : 'sandbox';

export const MPESA_BASE_URL =
  MPESA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';

export const MPESA_CONSUMER_KEY = env('MPESA_CONSUMER_KEY');
export const MPESA_CONSUMER_SECRET = env('MPESA_CONSUMER_SECRET');
export const MPESA_PASSKEY = env('MPESA_PASSKEY');
export const MPESA_SHORTCODE = env('MPESA_SHORTCODE', '174379');

/**
 * PartyB is the account actually credited.
 *   PayBill  : BusinessShortCode and PartyB are both the paybill number.
 *   Till/Buy : BusinessShortCode is the store/HO number, PartyB is the till.
 * Defaults to the shortcode (PayBill shape). Override with MPESA_PARTY_B.
 */
export const MPESA_PARTY_B = env('MPESA_PARTY_B') || MPESA_SHORTCODE;

/** 'CustomerPayBillOnline' for paybills, 'CustomerBuyGoodsOnline' for tills. */
export const MPESA_TRANSACTION_TYPE = env('MPESA_TRANSACTION_TYPE', 'CustomerBuyGoodsOnline');

export function mpesaCallbackUrl(): string {
  const base = env('NEXT_PUBLIC_APP_URL');
  if (!base) {
    throw new Error(
      'NEXT_PUBLIC_APP_URL is not set. Safaricom posts the payment result to it, ' +
        'so without a public https URL a deposit is charged but never credited.'
    );
  }
  if (MPESA_ENV === 'production' && !/^https:\/\//i.test(base)) {
    throw new Error(`NEXT_PUBLIC_APP_URL must be a public https URL in production, got "${base}".`);
  }
  return `${base.replace(/\/+$/, '')}/api/mpesa/callback`;
}

/**
 * Reads a Daraja response safely.
 *
 * Daraja answers auth and validation failures with an empty or text/html body.
 * Calling response.json() on those throws "Unexpected end of JSON input", which
 * hides the status code and tells an operator nothing. This surfaces both.
 */
export class DarajaError extends Error {
  constructor(message: string, readonly httpStatus: number, readonly body: string) {
    super(message);
    this.name = 'DarajaError';
  }
}

export async function readDarajaJson(response: Response, label: string) {
  const body = await response.text();

  if (!response.ok) {
    // Daraja answers most validation rejections with 4xx and a JSON errorMessage,
    // so this is the usual path for "the push was refused", not just outages.
    throw new DarajaError(
      `${label} failed: HTTP ${response.status} — ${body.slice(0, 300) || '(empty response body)'}`,
      response.status,
      body
    );
  }
  if (!body.trim()) {
    throw new Error(`${label} returned an empty body (HTTP ${response.status})`);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`${label} returned a non-JSON body: ${body.slice(0, 300)}`);
  }
}

export async function getMpesaToken(): Promise<string> {
  if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET) {
    throw new Error('MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be set in .env');
  }

  const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');
  const response = await fetch(
    `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` }, cache: 'no-store' }
  );

  const data = await readDarajaJson(response, 'M-Pesa OAuth');
  if (!data.access_token) {
    throw new Error(`M-Pesa OAuth returned no access_token: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.access_token as string;
}

/** yyyyMMddHHmmss, the format Daraja expects for Timestamp. */
export function darajaTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

export function darajaPassword(timestamp: string): string {
  return Buffer.from(MPESA_SHORTCODE + MPESA_PASSKEY + timestamp).toString('base64');
}


/* ------------------------------------------------------------------ *
 * Diagnostics
 *
 * Every line is single-line JSON prefixed with [mpesa] so it survives
 * pm2's interleaving of 5 workers and can be grepped:
 *     pm2 logs wintradein --lines 200 | grep '\[mpesa\]'
 * ------------------------------------------------------------------ */

/** Never log a full phone number or any secret. */
export function maskPhone(phone: string) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.length <= 4 ? '***' : `${digits.slice(0, 6)}***${digits.slice(-3)}`;
}

export function logMpesa(event: string, data: Record<string, unknown> = {}) {
  try {
    console.log(`[mpesa] ${JSON.stringify({ event, at: new Date().toISOString(), ...data })}`);
  } catch {
    console.log(`[mpesa] ${event} (payload not serialisable)`);
  }
}

/** Resolved configuration, safe to log. Secrets appear as presence + length only. */
export function mpesaConfigSummary() {
  const describe = (v: string) => (v ? `set(len ${v.length})` : 'MISSING');
  const callback = (() => {
    try {
      return mpesaCallbackUrl();
    } catch (e) {
      return `INVALID: ${(e as Error).message}`;
    }
  })();

  return {
    env: MPESA_ENV,
    baseUrl: MPESA_BASE_URL,
    businessShortCode: MPESA_SHORTCODE,
    partyB: MPESA_PARTY_B,
    transactionType: MPESA_TRANSACTION_TYPE,
    callbackUrl: callback,
    consumerKey: describe(MPESA_CONSUMER_KEY),
    consumerSecret: describe(MPESA_CONSUMER_SECRET),
    passkey: describe(MPESA_PASSKEY),
    // Two different numbers almost always means a till, which needs
    // CustomerBuyGoodsOnline rather than CustomerPayBillOnline.
    shortcodeMatchesPartyB: MPESA_SHORTCODE === MPESA_PARTY_B,
  };
}

/* ------------------------------------------------------------------ *
 * STK status query
 * ------------------------------------------------------------------ */

export type StkQueryOutcome = {
  /** pending = still in flight, success = paid, failed = definitively not paid. */
  state: 'pending' | 'success' | 'failed' | 'unknown';
  resultCode?: string;
  resultDesc?: string;
  httpStatus: number;
  raw: string;
};

/**
 * Asks Safaricom what became of an STK push.
 *
 * Daraja does not use HTTP status conventionally here: while the customer is
 * still deciding it answers HTTP 500 with errorCode 500.001.1001 ("transaction
 * is being processed"). So this reads the body and interprets it rather than
 * throwing on a non-2xx, which is why it does not use readDarajaJson.
 *
 * Note the response carries no MpesaReceiptNumber — that only ever arrives on
 * the callback, which is why both paths are needed.
 */
export async function queryStkStatus(checkoutRequestID: string): Promise<StkQueryOutcome> {
  const token = await getMpesaToken();
  const timestamp = darajaTimestamp();

  const response = await fetch(`${MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: MPESA_SHORTCODE,
      Password: darajaPassword(timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestID,
    }),
    cache: 'no-store',
  });

  const raw = await response.text();

  // Daraja spike-arrests at ~25 req/s. A throttled reply says nothing about the
  // transaction, so it must never be treated as a result.
  if (response.status === 429 || /SpikeArrest|ratelimit/i.test(raw)) {
    return { state: 'unknown', resultDesc: 'Rate limited by Safaricom', httpStatus: response.status, raw: raw.slice(0, 500) };
  }

  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { state: 'unknown', httpStatus: response.status, raw: raw.slice(0, 500) };
  }

  const resultCode = parsed.ResultCode === undefined ? undefined : String(parsed.ResultCode);
  const resultDesc = parsed.ResultDesc === undefined ? undefined : String(parsed.ResultDesc);
  const errorCode = parsed.errorCode === undefined ? undefined : String(parsed.errorCode);

  // Still with the customer — not an error, just not finished. Daraja encodes
  // this inconsistently (sometimes errorCode 500.001.1001, sometimes the same
  // wording under a different code), so the message is checked too. Getting
  // this wrong marks a live transaction failed, and a failed row is no longer
  // credited when the customer actually pays.
  const inFlight =
    errorCode === '500.001.1001' ||
    /still under processing|being processed/i.test(raw);

  if (inFlight) {
    return { state: 'pending', resultCode, resultDesc: String(parsed.errorMessage ?? 'Processing'), httpStatus: response.status, raw: raw.slice(0, 500) };
  }
  if (resultCode === '0') {
    return { state: 'success', resultCode, resultDesc, httpStatus: response.status, raw: raw.slice(0, 500) };
  }
  if (resultCode !== undefined) {
    return { state: 'failed', resultCode, resultDesc, httpStatus: response.status, raw: raw.slice(0, 500) };
  }
  return { state: 'unknown', httpStatus: response.status, raw: raw.slice(0, 500) };
}

/** Human-readable meanings for the ResultCodes Daraja returns. */
export const STK_RESULT_MEANINGS: Record<string, string> = {
  '0': 'Paid',
  '1': 'Insufficient funds',
  '11': 'The paying number is not in a usable state (not registered, or barred)',
  '17': 'Safaricom internal error — retry',
  '26': 'System busy, try again shortly',
  '1001': 'Another M-Pesa session is already active on that number',
  '1019': 'Transaction expired before it was completed',
  '1032': 'Cancelled by the customer',
  '1037': 'No response from the handset — the prompt was never seen',
  '2001': 'Wrong M-Pesa PIN',
};
