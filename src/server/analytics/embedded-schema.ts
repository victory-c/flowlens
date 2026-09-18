// Shared between scripts/build-embedded-dataset.ts (writer) and embedded-db.ts (loader).
// Only the analytics_clean tables the cleaned repository queries are embedded.

export const EMBEDDED_DATA_DIR = "data/embedded";

export const EMBEDDED_FILES = {
  mainDashboard: "main_dashboard.csv.gz",
  flowSummary: "flow_summary.csv.gz"
} as const;

export const MAIN_COLUMNS = [
  "year_label",
  "year_int",
  "donor",
  "donor_country",
  "region",
  "recipient_country",
  "flow_type",
  "sector_name",
  "amount_usd",
  "project_title",
  "project_id",
  "project_key",
  "is_gender",
  "is_climate",
  "is_environment",
  "is_biodiversity",
  "is_nutrition",
  "is_desertification"
] as const;

export const FLOW_COLUMNS = [
  "year_label",
  "year_int",
  "donor_country",
  "region",
  "recipient_country",
  "flow_type",
  "total_funding",
  "unique_projects",
  "exact_geo_flag",
  "recipient_geo_type"
] as const;

// Same shape as supabase/migrations 0002-0004, minus pg_trgm (sequential LIKE over ~115k rows is fast).
export const EMBEDDED_SCHEMA_SQL = `
create schema if not exists analytics_clean;

create table analytics_clean.main_dashboard (
  id bigserial primary key,
  year_label text not null,
  year_int integer null,
  donor text not null,
  donor_country text null,
  region text not null,
  recipient_country text not null,
  flow_type text null,
  sector_name text not null,
  amount_usd double precision not null,
  project_title text null,
  project_id text null,
  project_key text not null,
  is_gender boolean not null default false,
  is_climate boolean not null default false,
  is_environment boolean not null default false,
  is_biodiversity boolean not null default false,
  is_nutrition boolean not null default false,
  is_desertification boolean not null default false,
  search_text text generated always as (
    lower(
      coalesce(project_title, '') || ' ' ||
      coalesce(project_id, '') || ' ' ||
      coalesce(project_key, '') || ' ' ||
      coalesce(donor, '') || ' ' ||
      coalesce(donor_country, '') || ' ' ||
      coalesce(region, '') || ' ' ||
      coalesce(recipient_country, '') || ' ' ||
      coalesce(flow_type, '') || ' ' ||
      coalesce(sector_name, '')
    )
  ) stored
);

create table analytics_clean.flow_summary (
  id bigserial primary key,
  year_label text not null,
  year_int integer null,
  donor_country text not null,
  region text not null,
  recipient_country text not null,
  flow_type text not null,
  total_funding double precision not null,
  unique_projects integer not null,
  exact_geo_flag boolean not null default false,
  recipient_geo_type text not null
);
`;

export const EMBEDDED_INDEX_SQL = `
create index idx_clean_main_year on analytics_clean.main_dashboard (year_label);
create index idx_clean_main_donor on analytics_clean.main_dashboard (donor);
create index idx_clean_main_donor_country on analytics_clean.main_dashboard (donor_country);
create index idx_clean_main_recipient on analytics_clean.main_dashboard (recipient_country);
create index idx_clean_main_sector on analytics_clean.main_dashboard (sector_name);
create index idx_clean_main_project_key on analytics_clean.main_dashboard (project_key);
create index idx_clean_flow_year on analytics_clean.flow_summary (year_label);
create index idx_clean_flow_donor_country on analytics_clean.flow_summary (donor_country);
create index idx_clean_flow_recipient_country on analytics_clean.flow_summary (recipient_country);
analyze;
`;
