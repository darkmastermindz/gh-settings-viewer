import { createInterface } from 'node:readline/promises';

export async function ask(question: string, def?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`${question}${def ? ` [${def}]` : ''}: `)).trim();
    return answer || def || '';
  } finally {
    rl.close();
  }
}

export async function choose<T extends string>(question: string, options: { value: T; label: string }[], def: T): Promise<T> {
  console.log(question);
  options.forEach((o, i) => console.log(`  ${i + 1}) ${o.label}${o.value === def ? ' (default)' : ''}`));
  for (;;) {
    const a = await ask('Choose', String(options.findIndex((o) => o.value === def) + 1));
    const n = Number(a);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) return options[n - 1]!.value;
    const byValue = options.find((o) => o.value === a);
    if (byValue) return byValue.value;
  }
}

export async function confirm(question: string, def = true): Promise<boolean> {
  const a = (await ask(`${question} (${def ? 'Y/n' : 'y/N'})`)).toLowerCase();
  return a ? a.startsWith('y') : def;
}
