export function defaultSessionName(filename: string): string {
  return filename.replace(/\.(xlsx|xls)$/i, "");
}

export function getSessionDisplayName(session: { name?: string; filename: string }): string {
  const trimmed = session.name?.trim();
  return trimmed || defaultSessionName(session.filename);
}
