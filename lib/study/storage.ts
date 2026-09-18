const LIBRARY_BASE_KEY = "uic-atlas-study-library-v2";
const FOLDERS_BASE_KEY = "uic-atlas-study-custom-folders-v2";

export function studyStorageOwner(userId?: string | null) {
  return userId ? `user:${encodeURIComponent(userId)}` : "guest";
}

export function studyLibraryStorageKey(owner: string) {
  return `${LIBRARY_BASE_KEY}:${owner}`;
}

export function studyFoldersStorageKey(owner: string) {
  return `${FOLDERS_BASE_KEY}:${owner}`;
}

export function clearLocalStudyStorage(userId: string) {
  if (typeof window === "undefined") return;
  const owner = studyStorageOwner(userId);
  window.localStorage.removeItem(studyLibraryStorageKey(owner));
  window.localStorage.removeItem(studyFoldersStorageKey(owner));
  window.localStorage.removeItem(`uic-atlas-study-match-bests-v1:${owner}`);
}
