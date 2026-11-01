import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { encryptedStorage } from '@/security/encryptedStorage';
import { uid } from './id';
import { isPhotoId } from './validation';

/**
 * Receipt photos. Each photo is resized, re-encoded as JPEG (which also drops location and other EXIF
 * metadata) and stored encrypted on this device under its own key, outside the budget data.
 * Photos are not synced to other devices.
 */
const MAX_SIDE = 1200;
const MAX_BASE64 = 1_500_000; // ~1.1 MB after encoding
const key = (id: string) => `plan.photo.${id}`;

/** Opens the camera or photo library and returns a compressed JPEG data URL, or null if cancelled. */
export async function pickPhoto(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Camera access was denied. You can allow it in your device settings.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1, allowsEditing: false };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  const asset = res.canceled ? undefined : res.assets?.[0];
  if (!asset) return null;
  if (asset.type && asset.type !== 'image') throw new Error('Please choose a photo.');

  const ctx = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > MAX_SIDE) ctx.resize(asset.width >= asset.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const image = await ctx.renderAsync();
  const out = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error('Couldn’t read that photo.');
  if (out.base64.length > MAX_BASE64) throw new Error('That photo is too large. Try another one.');
  return `data:image/jpeg;base64,${out.base64}`;
}

export async function savePhoto(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith('data:image/jpeg;base64,')) throw new Error('Unsupported image');
  const id = uid('ph');
  await encryptedStorage.setItem(key(id), dataUrl);
  return id;
}

export async function loadPhoto(id: string): Promise<string | null> {
  if (!isPhotoId(id)) return null;
  const v = await encryptedStorage.getItem(key(id));
  return v && v.startsWith('data:image/jpeg;base64,') ? v : null;
}

export async function deletePhoto(id: string | undefined) {
  if (isPhotoId(id)) await encryptedStorage.removeItem(key(id));
}
