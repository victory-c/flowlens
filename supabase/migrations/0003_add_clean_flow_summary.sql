create table if not exists analytics_clean.flow_summary (
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

create index if not exists idx_clean_flow_year on analytics_clean.flow_summary (year_label);
create index if not exists idx_clean_flow_year_int on analytics_clean.flow_summary (year_int);
create index if not exists idx_clean_flow_donor_country on analytics_clean.flow_summary (donor_country);
create index if not exists idx_clean_flow_recipient_country on analytics_clean.flow_summary (recipient_country);
create index if not exists idx_clean_flow_region on analytics_clean.flow_summary (region);
create index if not exists idx_clean_flow_amount on analytics_clean.flow_summary (total_funding desc);
create index if not exists idx_clean_flow_exact_geo on analytics_clean.flow_summary (exact_geo_flag);
