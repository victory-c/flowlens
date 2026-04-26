create schema if not exists analytics_clean;

create extension if not exists pg_trgm;

create table if not exists analytics_clean.main_dashboard (
  id bigserial primary key,
  year_label text not null,
  year_int integer null,
  donor text not null,
  region text not null,
  recipient_country text not null,
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
      coalesce(region, '') || ' ' ||
      coalesce(recipient_country, '') || ' ' ||
      coalesce(sector_name, '')
    )
  ) stored
);

create table if not exists analytics_clean.country_summary (
  id bigserial primary key,
  year_label text not null,
  year_int integer null,
  region text not null,
  recipient_country text not null,
  total_funding double precision not null,
  unique_projects integer not null
);

create table if not exists analytics_clean.donor_summary (
  id bigserial primary key,
  year_label text not null,
  year_int integer null,
  donor text not null,
  total_funding double precision not null,
  unique_projects integer not null,
  recipient_countries_count integer not null
);

create table if not exists analytics_clean.sector_summary (
  id bigserial primary key,
  year_label text not null,
  year_int integer null,
  sector_name text not null,
  total_funding double precision not null
);

create table if not exists analytics_clean.donor_portfolio (
  id bigserial primary key,
  donor text not null,
  sector_name text not null,
  total_funding double precision not null
);

create table if not exists analytics_clean.cause_marker (
  id bigserial primary key,
  year_label text not null,
  year_int integer not null,
  total_funding double precision not null,
  unique_projects integer not null,
  cause text not null
);

create index if not exists idx_clean_main_year on analytics_clean.main_dashboard (year_label);
create index if not exists idx_clean_main_year_int on analytics_clean.main_dashboard (year_int);
create index if not exists idx_clean_main_donor on analytics_clean.main_dashboard (donor);
create index if not exists idx_clean_main_region on analytics_clean.main_dashboard (region);
create index if not exists idx_clean_main_recipient on analytics_clean.main_dashboard (recipient_country);
create index if not exists idx_clean_main_sector on analytics_clean.main_dashboard (sector_name);
create index if not exists idx_clean_main_project_key on analytics_clean.main_dashboard (project_key);
create index if not exists idx_clean_main_project_id on analytics_clean.main_dashboard (project_id);
create index if not exists idx_clean_main_amount on analytics_clean.main_dashboard (amount_usd desc);
create index if not exists idx_clean_main_search_trgm
  on analytics_clean.main_dashboard using gin (search_text gin_trgm_ops);

create index if not exists idx_clean_country_year on analytics_clean.country_summary (year_label);
create index if not exists idx_clean_country_region on analytics_clean.country_summary (region);
create index if not exists idx_clean_country_recipient on analytics_clean.country_summary (recipient_country);
create index if not exists idx_clean_country_amount on analytics_clean.country_summary (total_funding desc);

create index if not exists idx_clean_donor_year on analytics_clean.donor_summary (year_label);
create index if not exists idx_clean_donor_donor on analytics_clean.donor_summary (donor);
create index if not exists idx_clean_donor_amount on analytics_clean.donor_summary (total_funding desc);

create index if not exists idx_clean_sector_year on analytics_clean.sector_summary (year_label);
create index if not exists idx_clean_sector_sector on analytics_clean.sector_summary (sector_name);
create index if not exists idx_clean_sector_amount on analytics_clean.sector_summary (total_funding desc);

create index if not exists idx_clean_portfolio_donor on analytics_clean.donor_portfolio (donor);
create index if not exists idx_clean_portfolio_sector on analytics_clean.donor_portfolio (sector_name);
create index if not exists idx_clean_portfolio_amount on analytics_clean.donor_portfolio (total_funding desc);

create index if not exists idx_clean_cause_year on analytics_clean.cause_marker (year_label);
create index if not exists idx_clean_cause_cause on analytics_clean.cause_marker (cause);
create index if not exists idx_clean_cause_amount on analytics_clean.cause_marker (total_funding desc);
