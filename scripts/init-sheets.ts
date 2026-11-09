import 'dotenv/config';
import { sheetColumns, sheetsRequest, sheetsToken } from './sheets';

async function main() {
  if (process.argv.includes('--dry-run')) { console.log(JSON.stringify(sheetColumns, null, 2)); return; }
  const token = await sheetsToken();
  const data = await sheetsRequest(token) as { sheets: { properties: { title: string } }[] };
  const missing = Object.keys(sheetColumns).filter(title => !data.sheets.some(sheet => sheet.properties.title === title));
  if (missing.length) await sheetsRequest(token, ':batchUpdate', 'POST', { requests: missing.map(title => ({ addSheet: { properties: { title } } })) });
  for (const [title, columns] of Object.entries(sheetColumns)) {
    const path = '/values/' + encodeURIComponent("'" + title + "'!1:1");
    const existing = await sheetsRequest(token, path) as { values?: string[][] };
    if (existing.values?.[0]?.length) {
      if (JSON.stringify(existing.values[0]) !== JSON.stringify(columns)) throw new Error('Tiêu đề của ' + title + ' đã có và khác mẫu. Hãy đối chiếu thủ công.');
    } else await sheetsRequest(token, path + '?valueInputOption=RAW', 'PUT', { values: [columns] });
    console.log('OK · ' + title);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
