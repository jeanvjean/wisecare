-- Storage policies for uploads bucket (authenticated upload, public read)
CREATE POLICY "Allow authenticated users to upload to uploads" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'uploads' AND auth.role() = 'authenticated');
CREATE POLICY "Allow public read from uploads" ON storage.objects FOR SELECT USING (bucket_id = 'uploads');