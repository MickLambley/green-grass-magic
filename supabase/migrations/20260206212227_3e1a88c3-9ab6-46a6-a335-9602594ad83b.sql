-- Add lawn_image_url column to addresses table
ALTER TABLE public.addresses
ADD COLUMN lawn_image_url text;

-- Create storage bucket for lawn images
INSERT INTO storage.buckets (id, name, public)
VALUES ('lawn-images', 'lawn-images', true);

-- Allow authenticated users to upload their own lawn images
CREATE POLICY "Users can upload their own lawn images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'lawn-images' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to lawn images
CREATE POLICY "Lawn images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'lawn-images');

-- Allow users to update their own lawn images
CREATE POLICY "Users can update their own lawn images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'lawn-images' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own lawn images
CREATE POLICY "Users can delete their own lawn images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'lawn-images' 
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);