import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Plus, Trash2, Edit2, Save, X, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Phrase {
  id: string;
  category: string;
  phrase_template: string;
  created_at: string;
}

const CATEGORIES = [
  { key: 'kill_streak', label: '🔥 Monstro do PVP (Kill Streak)', color: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { key: 'best_kda', label: '⚡ KDA Implacável', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { key: 'cone', label: '🍦 Cone Monodedo', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
];

export const DiscordPhrasesManager = () => {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPhrase, setNewPhrase] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const { toast } = useToast();

  const fetchPhrases = async () => {
    const { data, error } = await supabase
      .from('discord_highlight_phrases')
      .select('*')
      .order('category')
      .order('created_at');

    if (error) {
      toast({ title: 'Erro ao buscar frases', description: error.message, variant: 'destructive' });
    } else {
      setPhrases(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchPhrases(); }, []);

  const addPhrase = async (category: string) => {
    const template = newPhrase[category]?.trim();
    if (!template) return;

    const { error } = await supabase
      .from('discord_highlight_phrases')
      .insert({ category, phrase_template: template });

    if (error) {
      toast({ title: 'Erro ao adicionar', description: error.message, variant: 'destructive' });
    } else {
      setNewPhrase(prev => ({ ...prev, [category]: '' }));
      fetchPhrases();
      toast({ title: 'Frase adicionada!' });
    }
  };

  const updatePhrase = async (id: string) => {
    if (!editValue.trim()) return;

    const { error } = await supabase
      .from('discord_highlight_phrases')
      .update({ phrase_template: editValue.trim() })
      .eq('id', id);

    if (error) {
      toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
    } else {
      setEditingId(null);
      fetchPhrases();
      toast({ title: 'Frase atualizada!' });
    }
  };

  const deletePhrase = async (id: string) => {
    const { error } = await supabase
      .from('discord_highlight_phrases')
      .delete()
      .eq('id', id);

    if (error) {
      toast({ title: 'Erro ao remover', description: error.message, variant: 'destructive' });
    } else {
      fetchPhrases();
      toast({ title: 'Frase removida!' });
    }
  };

  if (loading) return <div className="flex items-center justify-center py-8 text-muted-foreground">Carregando frases...</div>;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <MessageSquare className="w-6 h-6 text-primary" />
          <div>
            <CardTitle>Frases de Destaque do Discord</CardTitle>
            <CardDescription className="mt-1">
              Templates de frases usados nos destaques do ranking no Discord. Use <code className="bg-muted px-1 rounded">{'{name}'}</code> e <code className="bg-muted px-1 rounded">{'{value}'}</code> como placeholders.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border">
          <Info className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            As frases são usadas em rotação: cada frase é usada uma vez antes de qualquer repetir. Quanto mais frases, maior o ciclo sem repetição!
          </p>
        </div>

        {CATEGORIES.map(cat => {
          const catPhrases = phrases.filter(p => p.category === cat.key);
          return (
            <div key={cat.key} className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={cat.color}>{cat.label}</Badge>
                <span className="text-xs text-muted-foreground">{catPhrases.length} frases</span>
              </div>

              <div className="space-y-2">
                {catPhrases.map(phrase => (
                  <div key={phrase.id} className="flex items-center gap-2 group">
                    {editingId === phrase.id ? (
                      <>
                        <Input
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          className="flex-1 text-sm"
                          onKeyDown={e => e.key === 'Enter' && updatePhrase(phrase.id)}
                        />
                        <Button size="icon" variant="ghost" onClick={() => updatePhrase(phrase.id)} className="h-8 w-8">
                          <Save className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditingId(null)} className="h-8 w-8">
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm bg-muted/30 px-3 py-2 rounded border">{phrase.phrase_template}</span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => { setEditingId(phrase.id); setEditValue(phrase.phrase_template); }}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                          onClick={() => deletePhrase(phrase.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder={`Nova frase para ${cat.label.split('(')[0].trim()}... Ex: {name} fez {value} kills!`}
                  value={newPhrase[cat.key] || ''}
                  onChange={e => setNewPhrase(prev => ({ ...prev, [cat.key]: e.target.value }))}
                  className="flex-1 text-sm"
                  onKeyDown={e => e.key === 'Enter' && addPhrase(cat.key)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => addPhrase(cat.key)}
                  disabled={!newPhrase[cat.key]?.trim()}
                  className="gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Adicionar
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};
