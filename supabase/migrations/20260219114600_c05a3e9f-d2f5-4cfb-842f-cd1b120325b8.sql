
-- Create discord_highlight_phrases table
CREATE TABLE public.discord_highlight_phrases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  phrase_template TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.discord_highlight_phrases ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "Anyone can view phrases"
ON public.discord_highlight_phrases
FOR SELECT
USING (true);

-- Admin insert
CREATE POLICY "Admins can insert phrases"
ON public.discord_highlight_phrases
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin update
CREATE POLICY "Admins can update phrases"
ON public.discord_highlight_phrases
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

-- Admin delete
CREATE POLICY "Admins can delete phrases"
ON public.discord_highlight_phrases
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Seed kill_streak phrases
INSERT INTO public.discord_highlight_phrases (category, phrase_template) VALUES
('kill_streak', '{name} matou {value} vezes sem morrer! Tá possuído!'),
('kill_streak', '{name} fez {value} kills seguidas! Máquina de guerra!'),
('kill_streak', '{name} com {value} kills sem dar respawn! Alguém para esse maluco!'),
('kill_streak', 'Sequência insana de {value} kills! {name} está on fire!'),
('kill_streak', '{name} eliminou {value} sem piedade! O cemitério tá lotado!'),
('kill_streak', '{name} com {value} kills seguidas! Nasceu pra isso!'),
('kill_streak', '{name} mandou {value} pro caixão sem morrer! Brabo demais!'),
('kill_streak', '{name} não morre nunca! {value} kills na sequência!');

-- Seed best_kda phrases
INSERT INTO public.discord_highlight_phrases (category, phrase_template) VALUES
('best_kda', '{name} com KDA de {value}, cirúrgico no PVP!'),
('best_kda', '{name} não erra um golpe! KDA brutal: {value}'),
('best_kda', '{name} esse manja de posicionamento, KDA implacável {value}'),
('best_kda', '{name} tá jogando xadrez enquanto os outros jogam damas! KDA: {value}'),
('best_kda', '{name} com KDA {value}! Parece hack mas é talento!'),
('best_kda', '{name} KDA de {value}! Esse aí leu o manual do jogo!'),
('best_kda', '{name} com {value} de KDA! Precisão cirúrgica!'),
('best_kda', '{name} tá dando aula! KDA absurdo de {value}!');

-- Seed cone phrases
INSERT INTO public.discord_highlight_phrases (category, phrase_template) VALUES
('cone', '{name} morreu {value} vezes! Alguém empresta um mouse pra ele!'),
('cone', '{name} caiu {value} vezes! Tava jogando de olhos fechados?'),
('cone', '{name} morreu {value} vezes! Esse deve estar jogando sem mouse!'),
('cone', '{name} com {value} mortes! O chão tá com saudade dele!'),
('cone', '{name} visitou o respawn {value} vezes! Já tem cartão fidelidade!'),
('cone', '{name} morreu {value} vezes! Tá treinando pra morrer mais rápido?'),
('cone', '{name} com {value} deaths! Recorde de idas ao cemitério!'),
('cone', '{name} tombou {value} vezes! Pelo menos é persistente!');
