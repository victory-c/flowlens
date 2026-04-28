const COUNTRY_ALIAS: Record<string, string> = {
  usa: "united states",
  us: "united states",
  "u s": "united states",
  "u s a": "united states",
  "united states of america": "united states",
  uk: "united kingdom",
  "u k": "united kingdom",
  "ivory coast": "cote d ivoire",
  "cote d ivoire": "cote d ivoire",
  "cote divoire": "cote d ivoire",
  turkey: "turkiye",
  turkiye: "turkiye",
  "republic of turkiye": "turkiye",
  "dr congo": "democratic republic of the congo",
  drc: "democratic republic of the congo",
  "congo kinshasa": "democratic republic of the congo",
  "democratic republic of congo": "democratic republic of the congo",
  "democratic republic of the congo": "democratic republic of the congo",
  "congo brazzaville": "republic of the congo",
  "republic of congo": "republic of the congo",
  "republic of the congo": "republic of the congo",
  congo: "republic of the congo",
  "czech republic": "czechia"
};

export function normalizeCountryLabel(input: string) {
  const normalized = input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return COUNTRY_ALIAS[normalized] ?? normalized;
}
