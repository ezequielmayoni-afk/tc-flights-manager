-- Migration: Add ai_prompt_variants table
-- Purpose: Store the 5 creative variants with their specific prompts and visual directions

CREATE TABLE IF NOT EXISTS ai_prompt_variants (
  id SERIAL PRIMARY KEY,
  variant_number INTEGER UNIQUE NOT NULL CHECK (variant_number >= 1 AND variant_number <= 5),
  name TEXT NOT NULL,
  focus TEXT NOT NULL,
  description_es TEXT NOT NULL,
  visual_direction TEXT NOT NULL,
  hook_phrases TEXT[] NOT NULL, -- Array of alternative hook phrases
  prompt_addition TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_ai_prompt_variants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ai_prompt_variants_updated_at
  BEFORE UPDATE ON ai_prompt_variants
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_prompt_variants_updated_at();

-- Insert the 5 variants with scroll-stopping "Si" hooks
INSERT INTO ai_prompt_variants (variant_number, name, focus, description_es, visual_direction, hook_phrases, prompt_addition) VALUES

(1, 'Precio/Oferta', 'PRICE',
 'Si, a este precio. Aprovecha ahora.',
 'PRECIO GIGANTE en verde teal como elemento que detiene el scroll. El "SI" grande y afirmativo.',
 ARRAY['SI, A ESTE PRECIO', '?VACACIONES? SI, DESDE USD {price}', 'PRECIO QUE SI'],
 E'SCROLL-STOPPING VARIANT: PRICE
HOOK PHRASE: "SI, A ESTE PRECIO" or "?VACACIONES? SI, DESDE USD {price}"

VISUAL REQUIREMENTS FOR 0.1s IMPACT:
- GIANT "SI" text as the first thing the eye sees
- Price in HUGE teal #1DE9B6 badge (50%+ visual weight)
- The word "SI" must be bold, large, impossible to miss
- Background: destination photo slightly blurred
- Composition: "SI" + PRICE dominate, destination as context
- NO people - the DEAL is the protagonist
- Lighting: Warm sunset, golden tones

TEXT OVERLAY (in Spanish):
- Main: "SI, A ESTE PRECIO" or "SI, DESDE"
- Price: "USD {price}" in giant teal badge
- Subtext: "{destination} - {nights} noches"
- Brand: Si, Viajo logo

MOOD: "This price is real, and YES you can afford it"'),

(2, 'Experiencia/Emocion', 'EMOTION',
 'Si, me lo merezco. Escaparse, imaginarse ahi.',
 'Persona con expresion de felicidad/extasis. El "SI" como afirmacion de merecimiento.',
 ARRAY['SI, ME LO MEREZCO', '?TE LO MERECES? SI', 'COSAS QUE SI: ESCAPARME'],
 E'SCROLL-STOPPING VARIANT: EMOTION
HOOK PHRASE: "SI, ME LO MEREZCO" or "?TE LO MERECES? SI"

VISUAL REQUIREMENTS FOR 0.1s IMPACT:
- FACE with genuine JOY/BLISS expression (scroll-stopping emotion)
- Close-up or medium shot - eyes and smile visible
- The "SI" text over or near the person
- Dreamy golden hour lighting with lens flare
- Person looking at camera OR looking at paradise view
- Soft focus background, sharp subject

TEXT OVERLAY (in Spanish):
- Main: "SI, ME LO MEREZCO" (large, emotional)
- Or: "COSAS QUE SI: {destination}"
- Price: smaller but visible
- Brand: Si, Viajo logo

MOOD: "Say YES to yourself, you deserve this escape"'),

(3, 'Destino', 'DESTINATION',
 'Si, existe. El lugar es protagonista.',
 'Paisaje WOW que parece irreal. "SI, EXISTE" como afirmacion de que el paraiso es real.',
 ARRAY['SI, EXISTE', '{DESTINATION}. SI, ES REAL', '?PARAISO? SI'],
 E'SCROLL-STOPPING VARIANT: DESTINATION
HOOK PHRASE: "SI, EXISTE" or "{DESTINATION}? SI"

VISUAL REQUIREMENTS FOR 0.1s IMPACT:
- BREATHTAKING landscape that looks almost unreal
- Colors SO vibrant they stop the scroll (turquoise waters, white sand)
- Wide angle showing the WOW factor
- NO people or tiny figures for scale
- The "SI, EXISTE" text confirms this paradise is real
- Crystal clear, sharp, magazine-cover quality

TEXT OVERLAY (in Spanish):
- Main: "SI, EXISTE" (confirming the paradise is real)
- Or: "{DESTINATION}. SI, ES REAL."
- Destination name LARGE
- Price in teal badge
- Brand: Si, Viajo logo

MOOD: "This place is REAL and you can go there"'),

(4, 'Conveniencia', 'CONVENIENCE',
 'Si, todo resuelto. Cero estres.',
 'Visual de "todo incluido". Persona relajada porque todo esta resuelto. Checklist visual.',
 ARRAY['SI, TODO RESUELTO', 'SI, TODO INCLUIDO', '?COMPLICADO? NO. ?FACIL? SI'],
 E'SCROLL-STOPPING VARIANT: CONVENIENCE
HOOK PHRASE: "SI, TODO RESUELTO" or "?COMPLICADO? NO. ?FACIL? SI"

VISUAL REQUIREMENTS FOR 0.1s IMPACT:
- Visual CHECKLIST effect: Vuelo Hotel Traslados
- Person in ULTIMATE RELAXATION (hammock, pool, cocktail)
- The "SI" confirming everything is handled
- Clean, organized composition
- Soft, calming lighting
- Icons or visual elements showing included services

TEXT OVERLAY (in Spanish):
- Main: "SI, TODO RESUELTO" or "SI, TODO INCLUIDO"
- Checklist: "Vuelo + {nights} Nts + Traslados"
- Price in teal badge
- Brand: Si, Viajo logo

MOOD: "Just say YES and we handle everything"'),

(5, 'Escasez', 'SCARCITY',
 'Si, ahora. Ultimos lugares, decision inmediata.',
 'Urgencia maxima. Contador visual. El "SI, AHORA" como llamado a la accion inmediata.',
 ARRAY['SI, AHORA', '?CUANDO? SI, AHORA', 'ULTIMOS LUGARES. ?VAS? SI'],
 E'SCROLL-STOPPING VARIANT: SCARCITY/URGENCY
HOOK PHRASE: "SI, AHORA" or "?CUANDO? SI, AHORA"

VISUAL REQUIREMENTS FOR 0.1s IMPACT:
- URGENCY elements: countdown feel, "ULTIMOS 5", timer visual
- Dynamic diagonal composition suggesting MOVEMENT
- Person MID-ACTION: boarding, packing, running to gate
- RED or ORANGE accents for urgency (with brand teal)
- The "SI" as a call to immediate action
- High contrast, dramatic lighting

TEXT OVERLAY (in Spanish):
- Main: "SI, AHORA" or "ULTIMOS LUGARES. ?VAS? SI"
- Urgency badge: "ULTIMOS {n} CUPOS"
- Price prominent
- Brand: Si, Viajo logo

MOOD: "The moment is NOW - say YES before it is gone"')

ON CONFLICT (variant_number) DO UPDATE SET
  name = EXCLUDED.name,
  focus = EXCLUDED.focus,
  description_es = EXCLUDED.description_es,
  visual_direction = EXCLUDED.visual_direction,
  hook_phrases = EXCLUDED.hook_phrases,
  prompt_addition = EXCLUDED.prompt_addition,
  updated_at = now();

-- Add RLS policies
ALTER TABLE ai_prompt_variants ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated users
CREATE POLICY "ai_prompt_variants_read_policy" ON ai_prompt_variants
  FOR SELECT TO authenticated USING (true);

-- Allow write for admin users only
CREATE POLICY "ai_prompt_variants_write_policy" ON ai_prompt_variants
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

COMMENT ON TABLE ai_prompt_variants IS 'The 5 creative variants with scroll-stopping Si hooks';
COMMENT ON COLUMN ai_prompt_variants.hook_phrases IS 'Array of alternative hook phrases to use';
COMMENT ON COLUMN ai_prompt_variants.prompt_addition IS 'Full instructions for Gemini for this variant';
