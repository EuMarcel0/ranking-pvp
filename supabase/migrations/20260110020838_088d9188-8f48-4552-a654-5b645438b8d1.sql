-- Add banned column to characters table
ALTER TABLE public.characters 
ADD COLUMN banned boolean NOT NULL DEFAULT false;

-- Add index for faster filtering
CREATE INDEX idx_characters_banned ON public.characters(banned);