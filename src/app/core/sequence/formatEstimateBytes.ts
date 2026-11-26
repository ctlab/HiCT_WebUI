export function formatEstimateBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB", "PB", "EB"];
  let unit = 0;
  while (bytes >= 1000 && unit < units.length - 1) {
    bytes /= 1000;
    unit++;
  }
  return `${bytes.toLocaleString(undefined, { maximumSignificantDigits: 3 })} ${units[unit]}`;
}
