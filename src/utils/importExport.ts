import { base64 } from '@scure/base';
import * as DocumentPicker from 'expo-document-picker';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Platform } from 'react-native';
import type { BudgetData, CurrencyFormat, DateFormat } from '@/store/types';
import { today } from '@/utils/date';
import { saveFile } from '@/utils/saveFile';
import { budgetNameFromFile, csvFileStem, exportCsv, importCsv, isPlanCsv, isRegisterCsv } from '@/utils/budgetCsv';

const MAX_BYTES = 20 * 1024 * 1024;

interface PickedFile {
  name: string;
  bytes: Uint8Array;
}

/**
 * Lets the user pick what to import: an export (.zip, or its Plan/Register .csv files) or a Plan
 * backup (.json). Returns null if cancelled.
 */
async function pickFiles(): Promise<PickedFile[] | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'text/csv', 'text/comma-separated-values', 'application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: true,
    base64: Platform.OS !== 'web',
  });
  if (res.canceled || !res.assets?.length) return null;
  const files: PickedFile[] = [];
  for (const asset of res.assets) {
    if (asset.size && asset.size > MAX_BYTES) throw new Error(`${asset.name} is too large to import.`);
    let bytes: Uint8Array;
    if (asset.file) bytes = new Uint8Array(await asset.file.arrayBuffer());
    else if (asset.base64) bytes = base64.decode(asset.base64.replace(/^data:[^,]*,/, ''));
    else throw new Error(`Couldn’t read ${asset.name}.`);
    if (bytes.length > MAX_BYTES) throw new Error(`${asset.name} is too large to import.`);
    files.push({ name: asset.name ?? 'file', bytes });
  }
  return files;
}

/** Opens zips and keeps only the .csv and .json files inside. */
function expand(files: PickedFile[]): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name) || (f.bytes[0] === 0x50 && f.bytes[1] === 0x4b)) {
      let entries: Record<string, Uint8Array>;
      try {
        let total = 0;
        entries = unzipSync(f.bytes, {
          filter: (e) => {
            total += e.originalSize;
            if (total > MAX_BYTES * 3) throw new Error('too large');
            return /\.(csv|json)$/i.test(e.name) && !e.name.startsWith('__MACOSX');
          },
        });
      } catch {
        throw new Error(`Couldn’t open ${f.name}.`);
      }
      for (const [name, bytes] of Object.entries(entries)) out.push({ name: name.split('/').pop() ?? name, text: strFromU8(bytes) });
    } else if (/\.(csv|json|txt)$/i.test(f.name)) {
      out.push({ name: f.name, text: strFromU8(f.bytes) });
    } else {
      throw new Error(`${f.name} isn’t a .zip, .csv or .json file.`);
    }
  }
  return out;
}

export type ImportResult = { data: unknown; name?: string };

/**
 * Picks and reads an import, returning budget data for the store's importBudget (which validates it).
 * CSVs are converted using the given formats; the budget name comes from the file names.
 */
export async function pickImport(opts: { currency: CurrencyFormat; dateFormat: DateFormat }): Promise<ImportResult | null> {
  const picked = await pickFiles();
  if (!picked) return null;
  const files = expand(picked);
  const json = files.find((f) => /\.json$/i.test(f.name));
  if (json) {
    try {
      return { data: JSON.parse(json.text) };
    } catch {
      throw new Error('That backup file is damaged.');
    }
  }
  const register = files.find((f) => isRegisterCsv(f.text));
  const plan = files.find((f) => isPlanCsv(f.text));
  if (!register && !plan) throw new Error('Choose an export .zip, or its Register and Plan .csv files.');
  const name = budgetNameFromFile(register?.name ?? plan?.name ?? picked[0].name) ?? picked[0].name.replace(/\.(zip|csv)$/i, '');
  const data = importCsv(register?.text ?? '', plan?.text ?? null, { name, currency: opts.currency, dateFormat: opts.dateFormat, today: today() });
  return { data, name };
}

/** Saves an export: a .zip with "<budget> as of <date> - Plan.csv" and "... - Register.csv". */
export async function exportBudget(data: BudgetData) {
  const { register, plan } = exportCsv(data);
  const stem = csvFileStem(data, today());
  const zip = zipSync({ [`${stem} - Plan.csv`]: strToU8(plan), [`${stem} - Register.csv`]: strToU8(register) });
  await saveFile(`Plan Export - ${stem}.zip`, zip, 'application/zip');
}
