-- Fix: Public Bucket Allows Listing
-- Anonyma kan ladda enskilda filer via känd URL men inte lista hela bucketen.
DROP POLICY IF EXISTS "Brand assets are publicly readable" ON storage.objects;

CREATE POLICY "Brand assets readable by anyone with URL"
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'brand-assets' AND (storage.foldername(name))[1] IS NOT NULL);

-- Ägare får full tillgång till sin egen mapp (inkl listing)
CREATE POLICY "Owners can list own brand assets"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'brand-assets' AND auth.uid()::text = (storage.foldername(name))[1]);