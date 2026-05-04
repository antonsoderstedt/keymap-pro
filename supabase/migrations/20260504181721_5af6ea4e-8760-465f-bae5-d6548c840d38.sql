ALTER TABLE public.action_items
  ADD COLUMN IF NOT EXISTS tracking_status text;

COMMENT ON COLUMN public.action_items.tracking_status IS
  'For ads-related items: active | missing | unknown — indicates whether conversion tracking appears to be working for the related campaign/landing page.';