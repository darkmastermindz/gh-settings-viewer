const on = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: number, close: number) => (s: string) => (on ? `\u001b[${code}m${s}\u001b[${close}m` : s);
export const c = { bold: wrap(1, 22), dim: wrap(2, 22), red: wrap(31, 39), green: wrap(32, 39), yellow: wrap(33, 39), cyan: wrap(36, 39) };
