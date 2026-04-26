import { readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseCsv } from "csv-parse/sync";
import countries from "i18n-iso-countries";
import en from "i18n-iso-countries/langs/en.json";
import type { CountryMeta } from "@/shared/contracts/dashboard-data";
import { query } from "./db";

countries.registerLocale(en);

type PgRow = Record<string, unknown>;

type CountryLookupRow = {
  rawLabel: string;
  iso3: string | null;
  displayName: string;
  lat: number | null;
  lng: number | null;
};

const COUNTRY_ALIAS: Record<string, string> = {
  usa: "united states",
  "u.s.": "united states",
  "u.s": "united states",
  "united states of america": "united states",
  uk: "united kingdom",
  "u.k.": "united kingdom",
  turkey: "turkiye",
  "czech republic": "czechia"
};

function normalizeCountry(input: string) {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ");
  return COUNTRY_ALIAS[normalized] ?? normalized;
}

function iso2FromIso3(iso3: string | null) {
  if (!iso3) return null;
  const converted = countries.alpha3ToAlpha2(iso3.toUpperCase());
  return converted ?? null;
}

function fromRows(rows: CountryLookupRow[]) {
  const map = new Map<string, CountryMeta>();
  for (const row of rows) {
    const key = normalizeCountry(row.rawLabel);
    map.set(key, {
      country: row.rawLabel,
      displayName: row.displayName,
      iso2: iso2FromIso3(row.iso3),
      iso3: row.iso3,
      latitude: row.lat,
      longitude: row.lng,
      mapped: row.lat !== null && row.lng !== null
    });
  }
  return map;
}

async function loadFromDatabase(): Promise<CountryLookupRow[]> {
  const rows = await query<PgRow>(`
    SELECT raw_label, iso3, display_name, lat, lng
    FROM analytics.geo_lookup
  `);

  return rows.map((row) => ({
    rawLabel: String(row.raw_label),
    iso3: typeof row.iso3 === "string" && row.iso3.length > 0 ? row.iso3 : null,
    displayName: String(row.display_name ?? row.raw_label),
    lat: row.lat === null ? null : Number(row.lat),
    lng: row.lng === null ? null : Number(row.lng)
  }));
}

function loadFromCsvFallback(): CountryLookupRow[] {
  const filePath = path.resolve(process.cwd(), "data/lookup/geo_lookup.csv");
  const source = readFileSync(filePath, "utf8");
  const rows = parseCsv(source, { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;

  return rows.map((row) => ({
    rawLabel: row.country_label,
    iso3: row.iso3 || null,
    displayName: row.display_name || row.country_label,
    lat: row.latitude ? Number(row.latitude) : null,
    lng: row.longitude ? Number(row.longitude) : null
  }));
}

let metadataPromise: Promise<Map<string, CountryMeta>> | null = null;

export async function getCountryMetadataMap() {
  if (metadataPromise) return metadataPromise;

  metadataPromise = (async () => {
    try {
      return fromRows(await loadFromDatabase());
    } catch {
      return fromRows(loadFromCsvFallback());
    }
  })();

  return metadataPromise;
}

export function resolveCountryMeta(country: string, map: Map<string, CountryMeta>): CountryMeta {
  const key = normalizeCountry(country);
  const entry = map.get(key);
  if (entry) return entry;

  return {
    country,
    displayName: country,
    iso2: null,
    iso3: null,
    latitude: null,
    longitude: null,
    mapped: false
  };
}
