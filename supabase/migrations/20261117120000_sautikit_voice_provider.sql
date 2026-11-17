ALTER TABLE public.twiga_business_voice_configs
  DROP CONSTRAINT IF EXISTS twiga_business_voice_configs_provider_check;

ALTER TABLE public.twiga_business_voice_configs
  ADD CONSTRAINT twiga_business_voice_configs_provider_check
  CHECK (provider = ANY (ARRAY['vapi'::text, 'retell'::text, 'sautikit'::text]));
