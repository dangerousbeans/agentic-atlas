export function joinBase(base: string, path: string): string {
  const b = base.endsWith('/') ? base : base + '/';
  const p = path.startsWith('/') ? path.slice(1) : path;
  return b + p;
}
export function href(path: string): string {
  return joinBase(import.meta.env.BASE_URL ?? '/', path);
}
