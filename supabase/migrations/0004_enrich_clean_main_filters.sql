alter table analytics_clean.main_dashboard
  add column if not exists donor_country text null,
  add column if not exists flow_type text null;

drop index if exists analytics_clean.idx_clean_main_search_trgm;

alter table analytics_clean.main_dashboard
  drop column if exists search_text;

alter table analytics_clean.main_dashboard
  add column search_text text generated always as (
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
  ) stored;

create index if not exists idx_clean_main_donor_country
  on analytics_clean.main_dashboard (donor_country);

create index if not exists idx_clean_main_flow_type
  on analytics_clean.main_dashboard (flow_type);

create index if not exists idx_clean_main_search_trgm
  on analytics_clean.main_dashboard using gin (search_text gin_trgm_ops);
