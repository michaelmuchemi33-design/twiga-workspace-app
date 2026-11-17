CREATE TABLE IF NOT EXISTS public.twiga_public_payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.twiga_orders(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_twiga_public_payment_links_business_order
  ON public.twiga_public_payment_links (business_id, order_id, expires_at DESC);

ALTER TABLE public.twiga_public_payment_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.twiga_public_payment_links FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.twiga_public_payment_links TO service_role;