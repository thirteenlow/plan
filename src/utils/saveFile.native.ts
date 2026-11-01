import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** iOS / Android: writes the file to the cache and opens the share sheet (Save to Files, Drive, email…). */
export async function saveFile(name: string, bytes: Uint8Array, mimeType: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: name });
}
