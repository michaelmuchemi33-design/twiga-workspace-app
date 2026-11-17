-- Keep legacy values while allowing the provider connection types already supported by twiga-retell.save_phone_line.
ALTER TABLE public.twiga_phone_lines
  DROP CONSTRAINT IF EXISTS twiga_phone_lines_connection_method_check;

ALTER TABLE public.twiga_phone_lines
  ADD CONSTRAINT twiga_phone_lines_connection_method_check
  CHECK (connection_method = ANY (ARRAY[
    'not_configured',
    'android_device',
    'call_forwarding',
    'sip_trunk',
    'physical_sim',
    'sautikit',
    'retell_sip',
    'other'
  ]::text[]));
