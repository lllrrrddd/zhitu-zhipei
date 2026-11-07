// SPDX-License-Identifier: Apache-2.0
/** Keep a dropped resume in memory until the career page's uploader is mounted. */
let pendingFile: File | null = null;
const listeners = new Set<(file: File) => void>();

export function queueDroppedResume(file: File): void {
  if (listeners.size === 0) {
    pendingFile = file;
    return;
  }
  for (const listener of listeners) listener(file);
}

export function onDroppedResume(listener: (file: File) => void): () => void {
  listeners.add(listener);
  if (pendingFile) {
    const file = pendingFile;
    pendingFile = null;
    listener(file);
  }
  return () => listeners.delete(listener);
}
