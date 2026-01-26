-- Migration: Add system_instruction and reference images to ai_brand_assets
-- Purpose: Enable system instructions for Gemini and support up to 3 reference images

-- Insert system_instruction record
INSERT INTO ai_brand_assets (key, value, content_type, description) VALUES
('system_instruction', '', 'text/plain', 'System instruction for Gemini 3 Pro Image - Controls model behavior and output style'),
('reference_image_1', '', 'image/png', 'Reference image 1 for style/composition guidance (base64)'),
('reference_image_2', '', 'image/png', 'Reference image 2 for style/composition guidance (base64)'),
('reference_image_3', '', 'image/png', 'Reference image 3 for style/composition guidance (base64)')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE ai_brand_assets IS 'Stores brand assets for AI creative generation - includes system instruction and reference images';
