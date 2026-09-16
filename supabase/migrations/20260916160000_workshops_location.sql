-- Brenda 16.9.26: a clickable location (Google Maps / Waze) on the public
-- registration page. Lives on the product, picked from saved_locations in
-- the admin product page. Applied in production 16.9.26.
alter table workshops add column if not exists location text;
alter table workshops add column if not exists location_link text;
comment on column workshops.location is 'Where the workshop meets, by name (e.g. הסטודיו ברמת גן). Shown on the public registration page.';
comment on column workshops.location_link is 'Navigation link for location. Opens in a new tab from the public registration page.';
