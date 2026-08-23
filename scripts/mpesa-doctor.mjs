/**
 * M-Pesa diagnostics. Run on the server where .env lives.
 *
 *   node --env-file=.env scripts/mpesa-doctor.mjs config
 *   node --env-file=.env scripts/mpesa-doctor.mjs auth
 *   node --env-file=.env scripts/mpesa-doctor.mjs push 0712345678 [amountKES]
 *   node --env-file=.env scripts/mpesa-doctor.mjs query <CheckoutRequestID>
 *   node --env-file=.env scripts/mpesa-doctor.mjs recent
 *
 * `push` sends a REAL prompt to a REAL phone and can take real money.
 * It defaults to 1 KES. Use your own number.
 */

// Kept in step with lib/mpesa.ts
const env = (n, f = '') => {
  const raw = process.env[n];
  if (raw == null) return f;
  return raw.trim().replace(/;+$/, '').trim().replace(/^['"]|['"]$/g, '') || f;
};

const MPESA_ENV = env('MPESA_ENV', 'sandbox') === 'production' ? 'production' : 'sandbox';
const BASE = MPESA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
const KEY = env('MPESA_CONSUMER_KEY');
const SECRET = env('MPESA_CONSUMER_SECRET');
const PASSKEY = env('MPESA_PASSKEY');
const SHORTCODE = env('MPESA_SHORTCODE', '174379');
const PARTY_B = env('MPESA_PARTY_B') || SHORTCODE;
const TX_TYPE = env('MPESA_TRANSACTION_TYPE', 'CustomerPayBillOnline');
const APP_URL = env('NEXT_PUBLIC_APP_URL');

const describe = v => (v ? `set (${v.length} chars)` : '*** MISSING ***');
const stamp = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
};
const password = ts => Buffer.from(SHORTCODE + PASSKEY + ts).toString('base64');

function showConfig() {
  console.log('Resolved M-Pesa configuration');
  console.log('  MPESA_ENV            ', MPESA_ENV);
  console.log('  base URL             ', BASE);
  console.log('  BusinessShortCode    ', SHORTCODE);
  console.log('  PartyB               ', PARTY_B);
  console.log('  TransactionType      ', TX_TYPE);
  console.log('  callback URL         ', APP_URL ? `${APP_URL.replace(/\/+$/, '')}/api/mpesa/callback` : '*** NEXT_PUBLIC_APP_URL MISSING ***');
  console.log('  consumer key         ', describe(KEY));
  console.log('  consumer secret      ', describe(SECRET));
  console.log('  passkey              ', describe(PASSKEY));

  const problems = [];
  if (!KEY || !SECRET) problems.push('Consumer key/secret missing.');
  if (!PASSKEY) problems.push('MPESA_PASSKEY missing — the Password field will be invalid.');
  if (!APP_URL) problems.push('NEXT_PUBLIC_APP_URL missing — a paid deposit can never be credited.');
  if (APP_URL && MPESA_ENV === 'production' && !APP_URL.startsWith('https://')) problems.push('Callback URL must be https in production.');
  if (SHORTCODE !== PARTY_B && TX_TYPE === 'CustomerPayBillOnline') {
    problems.push(
      `BusinessShortCode (${SHORTCODE}) and PartyB (${PARTY_B}) differ, which is a till/BuyGoods setup, ` +
      `but TransactionType is CustomerPayBillOnline. Safaricom often accepts this and then never delivers the prompt. ` +
      `Try MPESA_TRANSACTION_TYPE=CustomerBuyGoodsOnline.`
    );
  }
  console.log(problems.length ? '\nPotential problems:' : '\nNo configuration problems detected.');
  problems.forEach(p => console.log('  - ' + p));
}

async function auth() {
  if (!KEY || !SECRET) throw new Error('Consumer key/secret missing');
  const r = await fetch(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${KEY}:${SECRET}`).toString('base64') },
  });
  const body = await r.text();
  console.log(`  OAuth HTTP ${r.status}, ${body.length} bytes`);
  if (!r.ok) throw new Error(`OAuth failed: ${body.slice(0, 300) || '(empty body)'}`);
  const token = JSON.parse(body).access_token;
  if (!token) throw new Error('No access_token in response: ' + body.slice(0, 200));
  console.log('  token', token.slice(0, 8) + '…');
  return token;
}

async function push(rawPhone, amount = '1') {
  let phone = String(rawPhone).replace(/\D/g, '');
  if (phone.startsWith('0')) phone = '254' + phone.slice(1);
  if (phone.length !== 12 || !phone.startsWith('254')) {
    throw new Error(`Phone must normalise to 2547XXXXXXXX, got "${phone}" (${phone.length} digits)`);
  }

  showConfig();
  console.log('\nRequesting token…');
  const token = await auth();

  const ts = stamp();
  const payload = {
    BusinessShortCode: SHORTCODE,
    Password: password(ts),
    Timestamp: ts,
    TransactionType: TX_TYPE,
    Amount: amount,
    PartyA: phone,
    PartyB: PARTY_B,
    PhoneNumber: phone,
    CallBackURL: `${APP_URL.replace(/\/+$/, '')}/api/mpesa/callback`,
    AccountReference: 'Wintradein-doctor',
    TransactionDesc: 'Diagnostic push',
  };

  console.log(`\nSending STK push: ${amount} KES to ${phone.slice(0, 6)}***${phone.slice(-3)}`);
  console.log('Payload:', JSON.stringify({ ...payload, Password: `<${payload.Password.length} chars>` }, null, 2));

  const r = await fetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await r.text();
  console.log(`\nHTTP ${r.status} (${r.headers.get('content-type')})`);
  console.log('Raw response:', body || '(empty)');

  let parsed = null;
  try { parsed = JSON.parse(body); } catch {}
  if (parsed?.ResponseCode === '0') {
    console.log('\nSafaricom ACCEPTED the request.');
    console.log('  CheckoutRequestID:', parsed.CheckoutRequestID);
    console.log('  CustomerMessage  :', parsed.CustomerMessage);
    console.log('\nIf no prompt reaches the handset, the request was fine and the problem is downstream.');
    console.log('Run this next to ask Safaricom what became of it:');
    console.log(`  node --env-file=.env scripts/mpesa-doctor.mjs query ${parsed.CheckoutRequestID}`);
  } else {
    console.log('\nSafaricom REJECTED the request. errorCode/errorMessage above is the reason.');
  }
}

async function query(checkoutRequestID) {
  const token = await auth();
  const ts = stamp();
  const r = await fetch(`${BASE}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ BusinessShortCode: SHORTCODE, Password: password(ts), Timestamp: ts, CheckoutRequestID: checkoutRequestID }),
  });
  const body = await r.text();
  console.log(`HTTP ${r.status}`);
  console.log('Raw response:', body || '(empty)');
  console.log('\nResultCode meanings: 0 paid · 1 insufficient funds · 11 paying number unusable ·');
  console.log('1032 cancelled by user ·');
  console.log('1037 no response from handset (unreachable / prompt never seen) · 2001 wrong PIN ·');
  console.log('1019 transaction expired · 1001 another session in progress on that number.');
}

async function recent() {
  const mysql = (await import('mysql2/promise')).default;
  const c = await mysql.createConnection({
    host: env('MYSQL_HOST', 'localhost'), port: +env('MYSQL_PORT', '3306'),
    user: env('MYSQL_USER', 'root'), password: env('MYSQL_PASSWORD'), database: env('MYSQL_DATABASE', 'tradeflow'),
  });
  const [rows] = await c.query(
    'SELECT created_at, status, amount, phone_number, checkout_request_id, result_code, result_desc FROM mpesa_transactions ORDER BY created_at DESC LIMIT 15'
  );
  if (!rows.length) console.log('No M-Pesa transactions recorded yet.');
  rows.forEach(r => {
    const p = String(r.phone_number || '');
    console.log(`${new Date(r.created_at).toLocaleString('en-GB')}  ${String(r.status).padEnd(9)} ${String(r.amount).padStart(9)} KES  ${p.slice(0,6)}***${p.slice(-3)}  ${r.checkout_request_id}  ${r.result_code ?? '-'} ${r.result_desc ?? ''}`);
  });
  console.log('\nRows stuck at "pending" mean Safaricom accepted the push but never called back.');
  await c.end();
}

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === 'config') showConfig();
  else if (cmd === 'auth') { showConfig(); console.log('\nTesting OAuth…'); await auth(); console.log('  OK'); }
  else if (cmd === 'push') { if (!args[0]) throw new Error('Usage: push <phone> [amountKES]'); await push(args[0], args[1] || '1'); }
  else if (cmd === 'query') { if (!args[0]) throw new Error('Usage: query <CheckoutRequestID>'); await query(args[0]); }
  else if (cmd === 'recent') await recent();
  else {
    console.log('Usage: node --env-file=.env scripts/mpesa-doctor.mjs <config|auth|push|query|recent>');
    process.exit(1);
  }
} catch (e) {
  console.error('\nFAILED:', e.message);
  process.exit(1);
}
