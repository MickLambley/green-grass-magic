-- Allow admins to upload lawn images
CREATE POLICY "Admins can upload lawn images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'lawn-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow admins to update lawn images
CREATE POLICY "Admins can update lawn images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'lawn-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow admins to delete lawn images
CREATE POLICY "Admins can delete lawn images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'lawn-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);