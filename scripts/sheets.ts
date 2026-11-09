import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';

import { sheetColumns } from '../backend/src/sheet-columns';
export { sheetColumns };

export async function sheetsToken() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Thiếu GOOGLE_APPLICATION_CREDENTIALS.');
  const credential = JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
  if (typeof credential.client_email !== 'string' || typeof credential.private_key !== 'string') throw new Error('Tệp Service Account không hợp lệ.');
  const now = Math.floor(Date.now() / 1000);
  const encode = (input: unknown) => Buffer.from(JSON.stringify(input)).toString('base64url');
  const unsigned = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({ iss: credential.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const signer = createSign('RSA-SHA256'); signer.update(unsigned);
  const assertion = unsigned + '.' + signer.sign(credential.private_key).toString('base64url');
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion,
  }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Google OAuth trả HTTP ' + response.status);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error('Google không trả access token.');
  return data.access_token;
}
export async function sheetsRequest(token: string, path = '', method = 'GET', body?: unknown) {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id || !/^[\w-]+$/.test(id)) throw new Error('Thiếu GOOGLE_SHEET_ID hợp lệ.');
  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + id + path, {
    method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('Google Sheets trả HTTP ' + response.status);
  return response.json();
}
