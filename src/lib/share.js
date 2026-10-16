// Platform module: hand a generated file to the user. A native share plugin can replace it.

/** Opens the system share sheet on touch devices when supported, otherwise downloads the file. */
export async function shareFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // user closed the sheet
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** File-system-safe base name from an activity title. */
export const safeName = (name) => name.replace(/[^\p{L}\p{N}\- ]+/gu, '').trim().replace(/\s+/g, '-') || 'activite';
