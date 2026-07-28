-- Criar tabela para registrar confrontos diretos (quem matou quem)
CREATE TABLE public.pvp_kill_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.pvp_matches(id) ON DELETE CASCADE,
  killer_name TEXT NOT NULL,
  victim_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.pvp_kill_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Anyone can view kill logs" 
ON public.pvp_kill_logs 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can insert kill logs" 
ON public.pvp_kill_logs 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update kill logs" 
ON public.pvp_kill_logs 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete kill logs" 
ON public.pvp_kill_logs 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Criar índices para melhorar performance de consultas
CREATE INDEX idx_kill_logs_match_id ON public.pvp_kill_logs(match_id);
CREATE INDEX idx_kill_logs_killer_name ON public.pvp_kill_logs(killer_name);
CREATE INDEX idx_kill_logs_victim_name ON public.pvp_kill_logs(victim_name);