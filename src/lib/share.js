// Platform module: hand a generated file to the user. In the native shell the file goes
// through the app cache and the system share sheet (Capacitor Share + Filesystem plugins).

import { Capacitor } from '@capacitor/core';

/**
 * Opens the system share sheet on touch devices when supported, otherwise downloads the file.
 * Resolves false when the athlete closed the sheet.
 */
export async function shareFile(blob, filename) {
  if (Capacitor.isNativePlatform()) return shareNative(blob, filename);
  const file = new File([blob], filename, { type: blob.type });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return false; // user closed the sheet
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const base64 = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]); // without the data: prefix
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

const SLICE = 3 * 2 ** 20; // bytes written per call: a multiple of 3, so the base64 slices join up

/**
 * Native shell: writes `blob` to Documents/<dir>/<name>, which outlives the app (no
 * permission on Android 11+), a slice at a time so a big file is never one string. Written
 * as <name>.part then renamed, so a cut write never replaces a good file. `stale(names)`
 * lists the files of the folder to delete afterwards.
 */
export async function keepFile(blob, dir, name, stale) {
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const directory = Directory.Documents, path = `${dir}/${name}`, part = `${path}.part`;
  for (let i = 0; i === 0 || i < blob.size; i += SLICE) {
    const data = await base64(blob.slice(i, i + SLICE));
    await (i ? Filesystem.appendFile({ path: part, data, directory }) : Filesystem.writeFile({ path: part, data, directory, recursive: true }));
  }
  await Filesystem.deleteFile({ path, directory }).catch(() => {}); // a same-day file
  await Filesystem.rename({ from: part, to: path, directory });
  const { files } = await Filesystem.readdir({ path: dir, directory });
  // Files of an earlier install are not ours any more on Android 11+: they stay.
  await Promise.all(stale(files.map((f) => f.name)).map((n) => Filesystem.deleteFile({ path: `${dir}/${n}`, directory }).catch(() => {})));
}

/**
 * Shares a text (a challenge link) through the share sheet; copies it when there is none.
 * Resolves 'copied' in that case, so the caller can say so.
 */
export async function shareText(text) {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ text });
      return;
    }
    if (matchMedia('(pointer: coarse)').matches && navigator.share) return await navigator.share({ text });
  } catch (e) {
    if (e.name === 'AbortError' || /cancel/i.test(e.message)) return; // the athlete closed the sheet
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}

/** Link to an in-app hash route that opens the app, or null in the native shell (no public URL). */
export const appLink = (hash) => (Capacitor.isNativePlatform() ? null : `${location.href.split('#')[0]}#${hash}`);

/** File-system-safe base name from an activity title. */
export const safeName = (name) => name.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '-') || 'activite';

/** Native shell: write the file to the app cache, then share its file:// URI. */
async function shareNative(blob, filename) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const { uri } = await Filesystem.writeFile({ path: filename, data: await base64(blob), directory: Directory.Cache });
  try {
    await Share.share({ title: filename, files: [uri] });
  } catch (e) {
    if (!/cancel/i.test(e.message)) throw e;
    return false; // the athlete closed the sheet
  }
}
