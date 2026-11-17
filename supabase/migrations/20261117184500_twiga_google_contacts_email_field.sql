-- Store email addresses when importing a user's Google Contacts into a business CRM.
alter table public.twiga_customers
  add column if not exists email text;
