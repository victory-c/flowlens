import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseValue(rawValue: string) {
  const value = rawValue.trim();
  const quote = value[0];
  if ((quote === "\"" || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  return value;
}

for (const fileName of [".env.local", ".env"]) {
  const envPath = path.resolve(process.cwd(), fileName);
  if (!existsSync(envPath)) continue;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(trimmed);
    if (!match) continue;

    const [, key, rawValue] = match;
    process.env[key] ??= parseValue(rawValue);
  }
}
