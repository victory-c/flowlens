create schema if not exists analytics;

create extension if not exists pg_trgm;

create table if not exists analytics.raw_oecd_philanthropy (
  raw_internal_id integer primary key,
  year text,
  organization_name text,
  region text,
  country text,
  usd_disbursements_defl numeric,
  grant_recipient_project_title text,
  project_description text,
  expected_duration text,
  type_of_flow text,
  donor_country text,
  financial_instrument text,
  modality_of_giving text,
  gender_dimension text,
  additional_info text,
  gender_marker text,
  climate_change_mitigation text,
  climate_change_adaptation text,
  subsector text,
  sdg_focus text,
  row_id text,
  subsector_description text,
  sector text,
  sector_description text,
  usd_commitment_defl numeric,
  channel_code text,
  channel_name text,
  channel_reported_name text,
  environment text,
  biodiversity text,
  desertification text,
  nutrition text,
  region_macro text,
  project_key text not null,
  is_regional_or_unspecified boolean not null default false,
  search_text text generated always as (
    lower(
      coalesce(row_id, '') || ' ' ||
      coalesce(project_key, '') || ' ' ||
      coalesce(organization_name, '') || ' ' ||
      coalesce(grant_recipient_project_title, '') || ' ' ||
      coalesce(project_description, '') || ' ' ||
      coalesce(channel_name, '') || ' ' ||
      coalesce(channel_reported_name, '') || ' ' ||
      coalesce(country, '') || ' ' ||
      coalesce(donor_country, '')
    )
  ) stored
);

create table if not exists analytics.geo_lookup (
  raw_label text primary key,
  iso3 text,
  display_name text not null,
  lat numeric,
  lng numeric,
  geo_type text not null check (geo_type in ('exact_country', 'domestic', 'regional', 'unspecified', 'unmapped'))
);

insert into analytics.geo_lookup (raw_label, iso3, display_name, lat, lng, geo_type) values
  ('United States', 'USA', 'United States', 37.0902, -95.7129, 'exact_country'),
  ('Mexico', 'MEX', 'Mexico', 23.6345, -102.5528, 'exact_country'),
  ('China (People''s Republic of)', 'CHN', 'China', 35.8617, 104.1954, 'exact_country'),
  ('India', 'IND', 'India', 20.5937, 78.9629, 'exact_country'),
  ('Switzerland', 'CHE', 'Switzerland', 46.8182, 8.2275, 'exact_country'),
  ('United Kingdom', 'GBR', 'United Kingdom', 55.3781, -3.4360, 'exact_country'),
  ('Belgium', 'BEL', 'Belgium', 50.5039, 4.4699, 'exact_country'),
  ('Netherlands', 'NLD', 'Netherlands', 52.1326, 5.2913, 'exact_country'),
  ('Canada', 'CAN', 'Canada', 56.1304, -106.3468, 'exact_country'),
  ('Denmark', 'DNK', 'Denmark', 56.2639, 9.5018, 'exact_country'),
  ('Portugal', 'PRT', 'Portugal', 39.3999, -8.2245, 'exact_country'),
  ('Brazil', 'BRA', 'Brazil', -14.2350, -51.9253, 'exact_country'),
  ('Sweden', 'SWE', 'Sweden', 60.1282, 18.6435, 'exact_country'),
  ('Spain', 'ESP', 'Spain', 40.4637, -3.7492, 'exact_country'),
  ('France', 'FRA', 'France', 46.2276, 2.2137, 'exact_country'),
  ('Egypt', 'EGY', 'Egypt', 26.8206, 30.8025, 'exact_country'),
  ('Qatar', 'QAT', 'Qatar', 25.3548, 51.1839, 'exact_country'),
  ('South Africa', 'ZAF', 'South Africa', -30.5595, 22.9375, 'exact_country'),
  ('Germany', 'DEU', 'Germany', 51.1657, 10.4515, 'exact_country'),
  ('Nigeria', 'NGA', 'Nigeria', 9.0820, 8.6753, 'exact_country'),
  ('Ireland', 'IRL', 'Ireland', 53.1424, -7.6921, 'exact_country'),
  ('Colombia', 'COL', 'Colombia', 4.5709, -74.2973, 'exact_country'),
  ('Japan', 'JPN', 'Japan', 36.2048, 138.2529, 'exact_country'),
  ('Italy', 'ITA', 'Italy', 41.8719, 12.5674, 'exact_country'),
  ('Togo', 'TGO', 'Togo', 8.6195, 0.8248, 'exact_country'),
  ('Norway', 'NOR', 'Norway', 60.4720, 8.4689, 'exact_country'),
  ('Luxembourg', 'LUX', 'Luxembourg', 49.8153, 6.1296, 'exact_country'),
  ('Turkey', 'TUR', 'Turkey', 38.9637, 35.2433, 'exact_country'),
  ('Türkiye', 'TUR', 'Türkiye', 38.9637, 35.2433, 'exact_country'),
  ('Kenya', 'KEN', 'Kenya', -0.0236, 37.9062, 'exact_country'),
  ('Ethiopia', 'ETH', 'Ethiopia', 9.1450, 40.4897, 'exact_country'),
  ('Uganda', 'UGA', 'Uganda', 1.3733, 32.2903, 'exact_country'),
  ('Tanzania', 'TZA', 'Tanzania', -6.3690, 34.8888, 'exact_country'),
  ('Indonesia', 'IDN', 'Indonesia', -0.7893, 113.9213, 'exact_country'),
  ('Democratic Republic of the Congo', 'COD', 'Democratic Republic of the Congo', -4.0383, 21.7587, 'exact_country'),
  ('Ghana', 'GHA', 'Ghana', 7.9465, -1.0232, 'exact_country'),
  ('Rwanda', 'RWA', 'Rwanda', -1.9403, 29.8739, 'exact_country'),
  ('Bangladesh', 'BGD', 'Bangladesh', 23.6850, 90.3563, 'exact_country'),
  ('Malawi', 'MWI', 'Malawi', -13.2543, 34.3015, 'exact_country'),
  ('Senegal', 'SEN', 'Senegal', 14.4974, -14.4524, 'exact_country'),
  ('Pakistan', 'PAK', 'Pakistan', 30.3753, 69.3451, 'exact_country'),
  ('Zambia', 'ZMB', 'Zambia', -13.1339, 27.8493, 'exact_country'),
  ('Burkina Faso', 'BFA', 'Burkina Faso', 12.2383, -1.5616, 'exact_country'),
  ('Mozambique', 'MOZ', 'Mozambique', -18.6657, 35.5296, 'exact_country'),
  ('Lebanon', 'LBN', 'Lebanon', 33.8547, 35.8623, 'exact_country'),
  ('Peru', 'PER', 'Peru', -9.1900, -75.0152, 'exact_country'),
  ('Zimbabwe', 'ZWE', 'Zimbabwe', -19.0154, 29.1549, 'exact_country'),
  ('Guatemala', 'GTM', 'Guatemala', 15.7835, -90.2308, 'exact_country'),
  ('Ukraine', 'UKR', 'Ukraine', 48.3794, 31.1656, 'exact_country'),
  ('Nepal', 'NPL', 'Nepal', 28.3949, 84.1240, 'exact_country'),
  ('Armenia', 'ARM', 'Armenia', 40.0691, 45.0382, 'exact_country'),
  ('Côte d''Ivoire', 'CIV', 'Côte d''Ivoire', 7.5400, -5.5471, 'exact_country'),
  ('Mali', 'MLI', 'Mali', 17.5707, -3.9962, 'exact_country'),
  ('Sierra Leone', 'SLE', 'Sierra Leone', 8.4606, -11.7799, 'exact_country'),
  ('Honduras', 'HND', 'Honduras', 15.2000, -86.2419, 'exact_country'),
  ('Philippines', 'PHL', 'Philippines', 12.8797, 121.7740, 'exact_country'),
  ('Benin', 'BEN', 'Benin', 9.3077, 2.3158, 'exact_country'),
  ('Cameroon', 'CMR', 'Cameroon', 7.3697, 12.3547, 'exact_country'),
  ('Viet Nam', 'VNM', 'Viet Nam', 14.0583, 108.2772, 'exact_country'),
  ('El Salvador', 'SLV', 'El Salvador', 13.7942, -88.8965, 'exact_country'),
  ('Niger', 'NER', 'Niger', 17.6078, 8.0817, 'exact_country'),
  ('Thailand', 'THA', 'Thailand', 15.8700, 100.9925, 'exact_country'),
  ('Afghanistan', 'AFG', 'Afghanistan', 33.9391, 67.7100, 'exact_country'),
  ('Cambodia', 'KHM', 'Cambodia', 12.5657, 104.9910, 'exact_country'),
  ('Argentina', 'ARG', 'Argentina', -38.4161, -63.6167, 'exact_country'),
  ('Liberia', 'LBR', 'Liberia', 6.4281, -9.4295, 'exact_country'),
  ('Tunisia', 'TUN', 'Tunisia', 33.8869, 9.5375, 'exact_country'),
  ('Jordan', 'JOR', 'Jordan', 30.5852, 36.2384, 'exact_country'),
  ('Cabo Verde', 'CPV', 'Cabo Verde', 16.5388, -23.0418, 'exact_country'),
  ('Burundi', 'BDI', 'Burundi', -3.3731, 29.9189, 'exact_country'),
  ('Madagascar', 'MDG', 'Madagascar', -18.7669, 46.8691, 'exact_country'),
  ('Guinea', 'GIN', 'Guinea', 9.9456, -9.6966, 'exact_country'),
  ('Ecuador', 'ECU', 'Ecuador', -1.8312, -78.1834, 'exact_country'),
  ('Haiti', 'HTI', 'Haiti', 18.9712, -72.2852, 'exact_country'),
  ('Morocco', 'MAR', 'Morocco', 31.7917, -7.0926, 'exact_country'),
  ('Angola', 'AGO', 'Angola', -11.2027, 17.8739, 'exact_country'),
  ('Serbia', 'SRB', 'Serbia', 44.0165, 21.0059, 'exact_country'),
  ('Costa Rica', 'CRI', 'Costa Rica', 9.7489, -83.7534, 'exact_country'),
  ('Guinea-Bissau', 'GNB', 'Guinea-Bissau', 11.8037, -15.1804, 'exact_country'),
  ('Bilateral, unspecified', null, 'Bilateral, unspecified', null, null, 'unspecified'),
  ('GLOBAL or unspecified', null, 'GLOBAL or unspecified', null, null, 'unspecified'),
  ('Africa, regional', null, 'Africa, regional', null, null, 'regional'),
  ('South of Sahara, regional', null, 'South of Sahara, regional', null, null, 'regional'),
  ('America, regional', null, 'America, regional', null, null, 'regional'),
  ('Asia, regional', null, 'Asia, regional', null, null, 'regional'),
  ('Middle East, regional', null, 'Middle East, regional', null, null, 'regional'),
  ('Europe, regional', null, 'Europe, regional', null, null, 'regional'),
  ('South America, regional', null, 'South America, regional', null, null, 'regional'),
  ('Central America, regional', null, 'Central America, regional', null, null, 'regional'),
  ('North of Sahara, regional', null, 'North of Sahara, regional', null, null, 'regional')
on conflict (raw_label) do update set
  iso3 = excluded.iso3,
  display_name = excluded.display_name,
  lat = excluded.lat,
  lng = excluded.lng,
  geo_type = excluded.geo_type;

create index if not exists idx_raw_year on analytics.raw_oecd_philanthropy (year);
create index if not exists idx_raw_donor on analytics.raw_oecd_philanthropy (donor_country);
create index if not exists idx_raw_country on analytics.raw_oecd_philanthropy (country);
create index if not exists idx_raw_region on analytics.raw_oecd_philanthropy (region);
create index if not exists idx_raw_region_macro on analytics.raw_oecd_philanthropy (region_macro);
create index if not exists idx_raw_org on analytics.raw_oecd_philanthropy (organization_name);
create index if not exists idx_raw_sector on analytics.raw_oecd_philanthropy (sector_description);
create index if not exists idx_raw_subsector on analytics.raw_oecd_philanthropy (subsector_description);
create index if not exists idx_raw_row_id on analytics.raw_oecd_philanthropy (row_id);
create index if not exists idx_raw_project_key on analytics.raw_oecd_philanthropy (project_key);
create index if not exists idx_raw_flow_type on analytics.raw_oecd_philanthropy (type_of_flow);
create index if not exists idx_raw_regional on analytics.raw_oecd_philanthropy (is_regional_or_unspecified);
create index if not exists idx_raw_search_trgm on analytics.raw_oecd_philanthropy using gin (search_text gin_trgm_ops);

create materialized view if not exists analytics.mv_project_summary as
select
  project_key,
  min(row_id) as row_id,
  count(*) as raw_row_count,
  coalesce(sum(usd_disbursements_defl), 0) as project_total_disbursement,
  coalesce(sum(usd_commitment_defl), 0) as project_total_commitment,
  count(distinct sector_description) as sector_count,
  count(distinct organization_name) as organization_count,
  count(distinct country) as recipient_count,
  count(distinct year) as year_count
from analytics.raw_oecd_philanthropy
group by project_key
with no data;

create materialized view if not exists analytics.mv_flow_summary as
select
  donor_country,
  country as recipient_label,
  type_of_flow,
  min(region_macro) as region_macro,
  min(region) as region,
  bool_or(is_regional_or_unspecified) as is_regional_or_unspecified,
  coalesce(sum(usd_disbursements_defl), 0) as total_disbursement,
  coalesce(sum(usd_commitment_defl), 0) as total_commitment,
  count(distinct project_key) as project_count,
  count(*) as raw_row_count
from analytics.raw_oecd_philanthropy
group by donor_country, country, type_of_flow
with no data;

create materialized view if not exists analytics.mv_year_sector_summary as
select
  case when grouping(year) = 1 then '__ALL__' else coalesce(year, '__UNKNOWN__') end as year,
  case
    when grouping(sector_description) = 1 then '__ALL__'
    else coalesce(sector_description, 'Unknown / Not reported')
  end as sector_description,
  coalesce(sum(usd_disbursements_defl), 0) as total_disbursement,
  coalesce(sum(usd_commitment_defl), 0) as total_commitment,
  count(distinct project_key) as project_count,
  count(*) as raw_row_count
from analytics.raw_oecd_philanthropy
group by grouping sets ((year, sector_description), (year), (sector_description), ())
with no data;

create materialized view if not exists analytics.mv_country_summary as
select
  'donor'::text as summary_type,
  donor_country,
  null::text as country,
  coalesce(sum(usd_disbursements_defl), 0) as total_disbursement,
  coalesce(sum(usd_commitment_defl), 0) as total_commitment,
  count(distinct project_key) as project_count,
  count(*) as raw_row_count
from analytics.raw_oecd_philanthropy
group by donor_country
union all
select
  'recipient'::text as summary_type,
  null::text as donor_country,
  country,
  coalesce(sum(usd_disbursements_defl), 0) as total_disbursement,
  coalesce(sum(usd_commitment_defl), 0) as total_commitment,
  count(distinct project_key) as project_count,
  count(*) as raw_row_count
from analytics.raw_oecd_philanthropy
group by country
with no data;

create materialized view if not exists analytics.mv_org_summary as
select
  organization_name,
  donor_country,
  coalesce(sum(usd_disbursements_defl), 0) as total_disbursement,
  coalesce(sum(usd_commitment_defl), 0) as total_commitment,
  count(distinct project_key) as project_count,
  count(*) as raw_row_count
from analytics.raw_oecd_philanthropy
group by organization_name, donor_country
with no data;

create index if not exists idx_mv_project_summary_key on analytics.mv_project_summary (project_key);
create index if not exists idx_mv_flow_summary_amount on analytics.mv_flow_summary (total_disbursement desc);
create index if not exists idx_mv_year_sector_summary_year on analytics.mv_year_sector_summary (year);
create index if not exists idx_mv_country_summary_type_amount on analytics.mv_country_summary (summary_type, total_disbursement desc);
create index if not exists idx_mv_org_summary_amount on analytics.mv_org_summary (total_disbursement desc);
