import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Ban, ShieldCheck } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { z } from 'zod';

const characterSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório').max(50, 'Nome deve ter no máximo 50 caracteres'),
  guild: z.string().trim().min(1, 'Guild é obrigatória').max(50, 'Guild deve ter no máximo 50 caracteres'),
  class: z.string().trim().min(1, 'Classe é obrigatória').max(50, 'Classe deve ter no máximo 50 caracteres'),
  pilot_name: z.string().trim().max(50, 'Piloto deve ter no máximo 50 caracteres').default(''),
});
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Character {
  id: string;
  name: string;
  guild: string;
  class: string;
  pilot_name: string;
  created_at: string;
  banned: boolean;
}

export const CharacterManagement = () => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [formData, setFormData] = useState({ name: '', guild: '', class: '', pilot_name: '' });

  useEffect(() => {
    fetchCharacters();
  }, []);

  const fetchCharacters = async () => {
    try {
      const { data, error } = await supabase
        .from('characters')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setCharacters(data || []);
    } catch (error) {
      console.error('Error fetching characters:', error);
      toast.error('Erro ao carregar personagens');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate input with zod
    const validation = characterSchema.safeParse(formData);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      toast.error(firstError.message);
      return;
    }

    const validatedData = validation.data;

    try {
      if (editingCharacter) {
        const { error } = await supabase
          .from('characters')
          .update({
            name: validatedData.name,
            guild: validatedData.guild,
            class: validatedData.class,
            pilot_name: validatedData.pilot_name,
          })
          .eq('id', editingCharacter.id);

        if (error) throw error;
        toast.success('Personagem atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('characters')
          .insert([
            {
              name: validatedData.name,
              guild: validatedData.guild,
              class: validatedData.class,
              pilot_name: validatedData.pilot_name,
            },
          ]);

        if (error) throw error;
        toast.success('Personagem criado com sucesso!');
      }

      fetchCharacters();
      handleCloseDialog();
    } catch (error: any) {
      console.error('Error saving character:', error);
      if (error.code === '23505') {
        toast.error('Já existe um personagem com este nome!');
      } else {
        toast.error('Erro ao salvar personagem');
      }
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja deletar ${name}?`)) return;

    try {
      const { error } = await supabase.from('characters').delete().eq('id', id);

      if (error) throw error;
      toast.success('Personagem deletado com sucesso!');
      fetchCharacters();
    } catch (error) {
      console.error('Error deleting character:', error);
      toast.error('Erro ao deletar personagem');
    }
  };

  const handleToggleBan = async (character: Character) => {
    const newBannedStatus = !character.banned;
    const action = newBannedStatus ? 'banir' : 'desbanir';
    
    if (!confirm(`Tem certeza que deseja ${action} ${character.name}?`)) return;

    try {
      const { error } = await supabase
        .from('characters')
        .update({ banned: newBannedStatus })
        .eq('id', character.id);

      if (error) throw error;
      toast.success(`Personagem ${newBannedStatus ? 'banido' : 'desbanido'} com sucesso!`);
      fetchCharacters();
    } catch (error) {
      console.error('Error toggling ban:', error);
      toast.error(`Erro ao ${action} personagem`);
    }
  };

  const handleEdit = (character: Character) => {
    setEditingCharacter(character);
    setFormData({
      name: character.name,
      guild: character.guild,
      class: character.class,
      pilot_name: character.pilot_name || '',
    });
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingCharacter(null);
    setFormData({ name: '', guild: '', class: '', pilot_name: '' });
  };

  const filteredCharacters = characters.filter(
    (char) =>
      char.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      char.guild.toLowerCase().includes(searchTerm.toLowerCase()) ||
      char.class.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gerenciar Personagens</CardTitle>
        <CardDescription>
          Cadastro de personagens com guild e classe
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <Label htmlFor="search">Pesquisar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                placeholder="Buscar por nome, guild ou classe..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Button onClick={() => setIsDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Novo Personagem
          </Button>
        </div>

        {loading ? (
          <p className="text-center text-muted-foreground">Carregando...</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assassino</TableHead>
                   <TableHead>Piloto</TableHead>
                   <TableHead>Guild</TableHead>
                   <TableHead>Classe</TableHead>
                   <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCharacters.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nenhum personagem encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCharacters.map((char) => (
                    <TableRow key={char.id} className={char.banned ? 'opacity-60 bg-destructive/10' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {char.banned && <Ban className="h-4 w-4 text-destructive" />}
                          {char.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{char.pilot_name || '-'}</TableCell>
                       <TableCell>{char.guild}</TableCell>
                       <TableCell>{char.class}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Switch
                            checked={!char.banned}
                            onCheckedChange={() => handleToggleBan(char)}
                            aria-label={char.banned ? 'Desbanir' : 'Banir'}
                          />
                          {char.banned ? (
                            <span className="text-xs text-destructive font-medium">Banido</span>
                          ) : (
                            <span className="text-xs text-green-600 font-medium">Ativo</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(char)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(char.id, char.name)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Total: {filteredCharacters.length} personagens
        </p>
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCharacter ? 'Editar Personagem' : 'Novo Personagem'}
            </DialogTitle>
            <DialogDescription>
              Preencha os dados do personagem
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Assassino</Label>
                <Input
                  id="name"
                  placeholder="Nome do personagem"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guild">Guild</Label>
                <Input
                  id="guild"
                  placeholder="Nome da guild"
                  value={formData.guild}
                  onChange={(e) => setFormData({ ...formData, guild: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="class">Classe</Label>
                <Input
                  id="class"
                  placeholder="Classe do personagem"
                  value={formData.class}
                  onChange={(e) => setFormData({ ...formData, class: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pilot_name">Piloto</Label>
                <Input
                  id="pilot_name"
                  placeholder="Nome do piloto (pessoa real)"
                  value={formData.pilot_name}
                  onChange={(e) => setFormData({ ...formData, pilot_name: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleCloseDialog}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingCharacter ? 'Atualizar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
