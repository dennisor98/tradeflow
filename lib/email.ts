type DepositEmailStatus = 'success' | 'failure';
type OtpEmailPurpose = 'register' | 'login';

type DepositEmailInput = {
  to: string;
  name?: string | null;
  status: DepositEmailStatus;
  amountUsd?: number;
  amountKes?: number;
  method: string;
  reference?: string | null;
  message?: string | null;
};

const RESEND_API_URL = 'https://api.resend.com/emails';

function getResendConfig() {
  return {
    apiKey: process.env.RESEND_API_KEY || process.env['resend.api.key'],
    fromEmail: process.env.RESEND_FROM_EMAIL || process.env['resend.from.email'],
  };
}

function formatMoney(value: number | undefined, currency: 'USD' | 'KES') {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'KES' ? 0 : 2,
  }).format(value);
}

function buildDepositEmail(input: DepositEmailInput) {
  const greeting = input.name ? `Hello ${input.name},` : 'Hello,';
  const usdAmount = formatMoney(input.amountUsd, 'USD');
  const kesAmount = formatMoney(input.amountKes, 'KES');
  const isSuccess = input.status === 'success';
  const title = isSuccess ? 'Deposit successful' : 'Deposit failed';
  const creditedLine = isSuccess && usdAmount
    ? `<p><strong>Amount credited:</strong> ${usdAmount}</p>`
    : '';
  const paidLine = kesAmount ? `<p><strong>M-Pesa amount:</strong> ${kesAmount}</p>` : '';
  const amountLine = [usdAmount, kesAmount].filter(Boolean).join(' / ');
  const referenceLine = input.reference ? `<p><strong>Reference:</strong> ${input.reference}</p>` : '';
  const messageLine = input.message ? `<p><strong>Details:</strong> ${input.message}</p>` : '';

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h2>${title}</h2>
      <p>${greeting}</p>
      <p>${isSuccess
        ? 'Your deposit has been received and credited to your TradeFlow account.'
        : 'Your deposit could not be completed.'}</p>
      ${isSuccess ? creditedLine : amountLine ? `<p><strong>Amount:</strong> ${amountLine}</p>` : ''}
      ${paidLine}
      <p><strong>Method:</strong> ${input.method}</p>
      ${referenceLine}
      ${messageLine}
    </div>
  `;

  const text = [
    title,
    '',
    greeting,
    isSuccess
      ? 'Your deposit has been received and credited to your TradeFlow account.'
      : 'Your deposit could not be completed.',
    isSuccess && usdAmount ? `Amount credited: ${usdAmount}` : null,
    kesAmount ? `M-Pesa amount: ${kesAmount}` : null,
    !isSuccess && amountLine ? `Amount: ${amountLine}` : null,
    `Method: ${input.method}`,
    input.reference ? `Reference: ${input.reference}` : null,
    input.message ? `Details: ${input.message}` : null,
  ].filter(Boolean).join('\n');

  return {
    subject: `TradeFlow ${title}`,
    html,
    text,
  };
}

function buildOtpEmail(input: {
  to: string;
  name?: string | null;
  otp: string;
  purpose: OtpEmailPurpose;
}) {
  const greeting = input.name ? `Hello ${input.name},` : 'Hello,';
  const isLogin = input.purpose === 'login';
  const title = isLogin ? 'Login verification code' : 'Verify your TradeFlow account';
  const intro = isLogin
    ? 'Use the code below to complete your login.'
    : 'Use the code below to activate your TradeFlow account.';

  const html = `
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
      <h2>${title}</h2>
      <p>${greeting}</p>
      <p>${intro}</p>
      <p style="font-size: 24px; font-weight: 700; letter-spacing: 6px; margin: 24px 0;">${input.otp}</p>
      <p>This code expires in 10 minutes.</p>
      <p>If you did not request this code, please ignore this email.</p>
    </div>
  `;

  const text = [
    title,
    '',
    greeting,
    intro,
    '',
    `OTP: ${input.otp}`,
    'This code expires in 10 minutes.',
    '',
    'If you did not request this code, please ignore this email.',
  ].join('\n');

  return {
    subject: `TradeFlow ${title}`,
    html,
    text,
  };
}

export async function sendDepositEmail(input: DepositEmailInput) {
  const { apiKey, fromEmail } = getResendConfig();

  if (!apiKey || !fromEmail) {
    console.warn('Skipping deposit email: RESEND_API_KEY or RESEND_FROM_EMAIL is not configured');
    return;
  }

  const email = buildDepositEmail(input);
  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: input.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to send deposit email:', errorText);
    }
  } catch (error) {
    console.error('Failed to send deposit email:', error);
  }
}

export async function sendOtpEmail(input: {
  to: string;
  name?: string | null;
  otp: string;
  purpose: OtpEmailPurpose;
}) {
  const { apiKey, fromEmail } = getResendConfig();

  if (!apiKey || !fromEmail) {
    console.warn('Skipping OTP email: RESEND_API_KEY or RESEND_FROM_EMAIL is not configured');
    return { sent: false as const, reason: 'Email service is not configured' };
  }

  const email = buildOtpEmail(input);
  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: input.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to send OTP email:', errorText);
      return { sent: false as const, reason: 'Failed to send OTP email' };
    }

    return { sent: true as const };
  } catch (error) {
    console.error('Failed to send OTP email:', error);
    return { sent: false as const, reason: 'Failed to send OTP email' };
  }
}
