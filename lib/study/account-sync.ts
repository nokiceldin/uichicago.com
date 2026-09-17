export function mergeAccountRecords<T extends { id: string }>(
  remoteRecords: T[],
  localRecords: T[],
  remoteIsAuthoritative: boolean,
) {
  if (remoteIsAuthoritative) return remoteRecords;
  const remoteIds = new Set(remoteRecords.map((record) => record.id));
  return [...remoteRecords, ...localRecords.filter((record) => !remoteIds.has(record.id))];
}
