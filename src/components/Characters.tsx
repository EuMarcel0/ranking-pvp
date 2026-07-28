import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Loader2, Plus, Search, Trash2, Pencil, Filter, FilterX, FileUp, RefreshCw, ChevronDown, Ban, ShieldCheck, Crown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useSearchParams } from 'react-router-dom';
import { CharacterImport } from './CharacterImport';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

import { CLASS_SHORT_MAP } from '@/lib/classShortMap';

interface Character {
  id: string;
  name: string;
  guild: string;
  class: string;
  class_short?: string;
  banned: boolean;
  pilot_name?: string;
  is_main?: boolean;
}

export const Characters = () => {
  const { user } = useAuth();
  const { isAdmin, canEditData } = useUserRole();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(null);
  const [formData, setFormData] = useState({ name: '', guild: '', class: '', class_short: '', pilot_name: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showUnregisteredOnly, setShowUnregisteredOnly] = useState(false);
  const [classFilter, setClassFilter] = useState<string>('all');
  const [guildFilter, setGuildFilter] = useState<string>('all');
  const [searchParams] = useSearchParams();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncingCharacterId, setSyncingCharacterId] = useState<string | null>(null);
  const [batchSyncDialogOpen, setBatchSyncDialogOpen] = useState(false);
  const [batchSyncNames, setBatchSyncNames] = useState('');

  useEffect(() => {
    loadCharacters();
    // Check if we should show unregistered only
    if (searchParams.get('filter') === 'unregistered') {
      setShowUnregisteredOnly(true);
    }
  }, [searchParams]);

  const loadCharacters = async () => {
    try {
      // Get all registered characters with pagination (Supabase default limit is 1000)
      const CHAR_PAGE_SIZE = 1000;
      let charFrom = 0;
      let registeredChars: any[] = [];
      while (true) {
        const { data, error: charsError } = await supabase
          .from('characters')
          .select('id, name, guild, class, class_short, banned, pilot_name, is_main')
          .order('name')
          .range(charFrom, charFrom + CHAR_PAGE_SIZE - 1);
        if (charsError) throw charsError;
        const batch = data || [];
        registeredChars = registeredChars.concat(batch);
        if (batch.length < CHAR_PAGE_SIZE) break;
        charFrom += CHAR_PAGE_SIZE;
      }
      console.log('[Characters] registeredChars count:', registeredChars.length);

      // Get all player names from matches with pagination (default limit is 1000)
      const PAGE_SIZE = 1000;
      let from = 0;
      let allPlayers: { player_name: string }[] = [];
      while (true) {
        const { data, error } = await supabase
          .from('pvp_match_players')
          .select('player_name')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const batch = data || [];
        allPlayers = allPlayers.concat(batch);
        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      console.log('[Characters] fetched match players total:', allPlayers.length);

      // Strong normalization function (NFKC + collapse spaces + trim + lowercase)
      const normalize = (s?: string) =>
        (s ?? '')
          .normalize('NFKC')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

      // Build a map of normalized names -> display names from match players
      const playersByNorm = new Map<string, string>();
      for (const p of allPlayers || []) {
        const display = (p.player_name || '').replace(/\s+/g, ' ').trim();
        const key = normalize(display);
        const isLikelyGarbageName = !/[a-z]/i.test(display);
        if (key && !isLikelyGarbageName) playersByNorm.set(key, display);
      }
      console.log('[Characters] allPlayers unique (normalized) count:', playersByNorm.size);
      console.log('[Characters] allPlayers sample (first 20):', Array.from(playersByNorm.values()).slice(0, 20));

      // Build a set of normalized registered character names
      const registeredNorm = new Set((registeredChars || []).map(c => normalize(c.name)));
      console.log('[Characters] registeredNorm count:', registeredNorm.size);
      console.log('[Characters] registeredNorm sample (first 20):', Array.from(registeredNorm).slice(0, 20));

      // Find unregistered players (present in matches but not in characters)
      const unregisteredPlayers = [...playersByNorm.entries()]
        .filter(([key]) => !registeredNorm.has(key))
        .map(([_, display]) => ({
          id: `unregistered-${display}`,
          name: display,
          guild: '',
          class: '',
          banned: false,
        }));
      console.log('[Characters] unregistered count:', unregisteredPlayers.length);
      console.log('[Characters] unregistered sample (first 20):', unregisteredPlayers.map(u => u.name).slice(0, 20));

      // Combine registered and unregistered, sort by name
      const allCharacters = [ ...(registeredChars || []), ...unregisteredPlayers ]
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      console.log('[Characters] final counts => registered:', registeredChars?.length ?? 0, 'unregistered:', unregisteredPlayers.length, 'total:', allCharacters.length);
      setCharacters(allCharacters);
    } catch (error) {
      console.error('Error loading characters:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao carregar personagens',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      if (editingCharacter && !editingCharacter.id.startsWith('unregistered-')) {
        const { error } = await supabase
          .from('characters')
          .update(formData)
          .eq('id', editingCharacter.id);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Personagem atualizado!' });
      } else {
        const { error } = await supabase
          .from('characters')
          .insert([formData]);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Personagem adicionado!' });
      }

      setDialogOpen(false);
      setFormData({ name: '', guild: '', class: '', class_short: '', pilot_name: '' });
      setEditingCharacter(null);
      loadCharacters();
    } catch (error: any) {
      console.error('Error saving character:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao salvar personagem',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado',
        variant: 'destructive',
      });
      return;
    }

    // Cannot delete unregistered characters
    if (id.startsWith('unregistered-')) {
      toast({
        title: 'Aviso',
        description: 'Não é possível excluir um personagem não cadastrado',
        variant: 'destructive',
      });
      return;
    }

    if (!confirm('Tem certeza que deseja excluir este personagem?')) return;

    try {
      const { error } = await supabase
        .from('characters')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Personagem excluído!' });
      loadCharacters();
    } catch (error) {
      console.error('Error deleting character:', error);
      toast({
        title: 'Erro',
        description: 'Falha ao excluir personagem',
        variant: 'destructive',
      });
    }
  };

  const handleToggleBan = async (character: Character) => {
    if (!user) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado',
        variant: 'destructive',
      });
      return;
    }

    // Cannot ban unregistered characters
    if (character.id.startsWith('unregistered-')) {
      toast({
        title: 'Aviso',
        description: 'Cadastre o personagem antes de banir',
        variant: 'destructive',
      });
      return;
    }

    const newBannedStatus = !character.banned;
    const action = newBannedStatus ? 'banir' : 'desbanir';
    
    if (!confirm(`Tem certeza que deseja ${action} o personagem "${character.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('characters')
        .update({ banned: newBannedStatus })
        .eq('id', character.id);

      if (error) throw error;
      
      toast({ 
        title: 'Sucesso', 
        description: newBannedStatus 
          ? `Personagem "${character.name}" foi banido e não aparecerá mais nos rankings`
          : `Personagem "${character.name}" foi desbanido e voltará a aparecer nos rankings`
      });
      loadCharacters();
    } catch (error) {
      console.error('Error toggling ban:', error);
      toast({
        title: 'Erro',
        description: `Falha ao ${action} personagem`,
        variant: 'destructive',
      });
    }
  };

  const handleToggleMain = async (character: Character) => {
    if (!user || !isAdmin) {
      toast({ title: 'Erro', description: 'Apenas administradores podem definir o Main', variant: 'destructive' });
      return;
    }
    if (character.id.startsWith('unregistered-')) {
      toast({ title: 'Aviso', description: 'Cadastre o personagem antes de marcar como Main', variant: 'destructive' });
      return;
    }
    if (!character.guild || !character.guild.trim()) {
      toast({ title: 'Aviso', description: 'Personagem precisa ter uma guild definida', variant: 'destructive' });
      return;
    }
    const becomingMain = !character.is_main;
    try {
      if (becomingMain) {
        // Clear any other main of the same guild first (only one main per guild)
        const { error: clearErr } = await supabase
          .from('characters')
          .update({ is_main: false })
          .eq('guild', character.guild)
          .eq('is_main', true);
        if (clearErr) throw clearErr;
      }
      const { error } = await supabase
        .from('characters')
        .update({ is_main: becomingMain })
        .eq('id', character.id);
      if (error) throw error;
      toast({
        title: 'Sucesso',
        description: becomingMain
          ? `"${character.name}" agora é o Main da guild ${character.guild}`
          : `"${character.name}" não é mais Main`,
      });
      loadCharacters();
    } catch (error: any) {
      console.error('Error toggling main:', error);
      toast({ title: 'Erro', description: error.message || 'Falha ao atualizar Main', variant: 'destructive' });
    }
  };

  const openEditDialog = (character: Character) => {
    setEditingCharacter(character);
    setFormData({ name: character.name, guild: character.guild, class: character.class, class_short: character.class_short || CLASS_SHORT_MAP[character.class] || '', pilot_name: (character as any).pilot_name || '' });
    setDialogOpen(true);
  };

  const openAddDialog = () => {
    setEditingCharacter(null);
    setFormData({ name: '', guild: '', class: '', class_short: '', pilot_name: '' });
    setDialogOpen(true);
  };

  const handleSyncVortex = async (mode: 'unregistered' | 'all' | 'selected', names?: string[]) => {
    if (!user) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado',
        variant: 'destructive',
      });
      return;
    }

    const count = mode === 'unregistered' 
      ? unregisteredCount 
      : mode === 'selected' 
        ? (names?.length || 0) 
        : characters.length;

    if (count === 0) {
      toast({
        title: 'Aviso',
        description: mode === 'unregistered' 
          ? 'Não há personagens não cadastrados para sincronizar'
          : 'Não há personagens para sincronizar',
      });
      return;
    }

    if (mode !== 'selected' && !confirm(`Sincronizar ${count} personagens com VortexMU? Isso pode levar alguns minutos.`)) {
      return;
    }

    setSyncing(true);
    setSyncProgress(10);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      setSyncProgress(20);

      const response = await supabase.functions.invoke('sync-characters-vortex', {
        body: { mode, names },
      });

      setSyncProgress(90);

      if (response.error) throw response.error;

      const result = response.data;
      if (result.success) {
        toast({
          title: 'Sincronização Concluída',
          description: `${result.summary.updated} atualizados, ${result.summary.created} criados, ${result.summary.notFound} não encontrados`,
        });
        loadCharacters();
      } else {
        throw new Error(result.error || 'Erro desconhecido');
      }
    } catch (error: any) {
      console.error('Error syncing with VortexMU:', error);
      toast({
        title: 'Erro na Sincronização',
        description: error.message || 'Falha ao sincronizar com VortexMU',
        variant: 'destructive',
      });
    } finally {
      setSyncing(false);
      setSyncProgress(0);
    }
  };

  const handleSyncSingleCharacter = async (characterName: string, characterId: string) => {
    if (!user) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado',
        variant: 'destructive',
      });
      return;
    }

    setSyncingCharacterId(characterId);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sessão expirada');

      const response = await supabase.functions.invoke('sync-characters-vortex', {
        body: { mode: 'selected', names: [characterName] },
      });

      if (response.error) throw response.error;

      const result = response.data;
      if (result.success) {
        if (result.summary.notFound > 0) {
          toast({
            title: 'Não Encontrado',
            description: `Personagem "${characterName}" não foi encontrado no VortexMU`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Sincronizado',
            description: `"${characterName}" atualizado com sucesso!`,
          });
          loadCharacters();
        }
      } else {
        throw new Error(result.error || 'Erro desconhecido');
      }
    } catch (error: any) {
      console.error('Error syncing character:', error);
      toast({
        title: 'Erro na Sincronização',
        description: error.message || 'Falha ao sincronizar personagem',
        variant: 'destructive',
      });
    } finally {
      setSyncingCharacterId(null);
    }
  };

  const handleBatchSync = async () => {
    const namesList = batchSyncNames
      .split('\n')
      .map(n => n.trim())
      .filter(n => n.length > 0);
    
    if (namesList.length === 0) {
      toast({
        title: 'Aviso',
        description: 'Digite ao menos um nome de personagem',
        variant: 'destructive',
      });
      return;
    }

    setBatchSyncDialogOpen(false);
    await handleSyncVortex('selected', namesList);
    setBatchSyncNames('');
  };

  // Helper to normalize strings (for checking special values)
  const normalize = (s?: string) =>
    (s ?? '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  // Check if a value looks like "sem guild" placeholder (ignore case/accents/spaces)
  const isSemGuild = (val?: string) => {
    const normalized = normalize(val).replace(/[^a-z]/g, '');
    return normalized === 'semguild';
  };

  // Check if a value is missing (empty, null, '-', 'n/a', 'none', but NOT "sem guild")
  const isValueMissing = (val?: string) => {
    if (isSemGuild(val)) return false; // "sem guild" is not considered missing
    const v = normalize(val);
    return !v || v === '-' || v === 'n/a' || v === 'none';
  };

  // A character is incomplete if it's unregistered OR both guild and class are missing
  const isIncomplete = (c: Character) =>
    c.id.startsWith('unregistered-') || (isValueMissing(c.guild) && isValueMissing(c.class));

  const unregisteredCount = characters.filter(isIncomplete).length;

  const normalizedSearch = searchTerm.toLowerCase();

  // Build unique sorted lists for class and guild filters (from registered + unregistered)
  const uniqueClasses = Array.from(
    new Set(characters.map(c => (c.class ?? '').trim()).filter(v => v !== ''))
  ).sort((a, b) => a.localeCompare(b));
  const uniqueGuilds = Array.from(
    new Set(characters.map(c => (c.guild ?? '').trim()).filter(v => v !== ''))
  ).sort((a, b) => a.localeCompare(b));

  const filteredCharacters = characters.filter((char) => {
    const nameMatch = (char.name ?? '').toLowerCase().includes(normalizedSearch);
    const guildMatch = (char.guild ?? '').toLowerCase().includes(normalizedSearch);
    const classMatch = (char.class ?? '').toLowerCase().includes(normalizedSearch);
    const matchesSearch = nameMatch || guildMatch || classMatch;

    const isUnregistered = isIncomplete(char);
    const matchesUnregistered = showUnregisteredOnly ? isUnregistered : true;

    const charClass = (char.class ?? '').trim();
    const charGuild = (char.guild ?? '').trim();
    const matchesClass =
      classFilter === 'all' ||
      (classFilter === '__empty__' ? charClass === '' : charClass === classFilter);
    const matchesGuild =
      guildFilter === 'all' ||
      (guildFilter === '__empty__' ? charGuild === '' : charGuild === guildFilter);

    return matchesSearch && matchesUnregistered && matchesClass && matchesGuild;
  });


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Personagens Cadastrados</CardTitle>
            <CardDescription>
              Total de {characters.length} personagens ({unregisteredCount} não cadastrados)
            </CardDescription>
          </div>
          {unregisteredCount > 0 && (
            <Badge variant="secondary" className="text-yellow-600 border-yellow-600">
              {unregisteredCount} sem cadastro completo
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {syncing && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Sincronizando com VortexMU... Isso pode levar alguns minutos.
            </div>
            <Progress value={syncProgress} className="h-2" />
          </div>
        )}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, guild ou classe..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
              aria-label="Buscar por nome, guild ou classe"
            />
          </div>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-[180px]" aria-label="Filtrar por classe">
              <SelectValue placeholder="Classe" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              <SelectItem value="all">Todas as classes</SelectItem>
              <SelectItem value="__empty__">Sem classe</SelectItem>
              {uniqueClasses.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={guildFilter} onValueChange={setGuildFilter}>
            <SelectTrigger className="w-[180px]" aria-label="Filtrar por guild">
              <SelectValue placeholder="Guild" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              <SelectItem value="all">Todas as guilds</SelectItem>
              <SelectItem value="__empty__">Sem guild</SelectItem>
              {uniqueGuilds.map((g) => (
                <SelectItem key={g} value={g}>{g}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={showUnregisteredOnly ? "default" : "outline"}
            onClick={() => setShowUnregisteredOnly(!showUnregisteredOnly)}
            className="gap-2"
            aria-pressed={showUnregisteredOnly}
          >
            {showUnregisteredOnly ? (
              <>
                <FilterX className="w-4 h-4" />
                Mostrar Todos
              </>
            ) : (
              <>
                <Filter className="w-4 h-4" />
                Apenas Não Cadastrados
              </>
            )}
          </Button>
          {canEditData && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" disabled={syncing} className="gap-2">
                    {syncing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    Sincronizar VortexMU
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem 
                    onClick={() => handleSyncVortex('unregistered')}
                    disabled={unregisteredCount === 0}
                  >
                    Apenas não cadastrados ({unregisteredCount})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSyncVortex('all')}>
                    Todos das partidas ({characters.length})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setBatchSyncDialogOpen(true)}>
                    Por nome (digitar lista)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Dialog open={batchSyncDialogOpen} onOpenChange={setBatchSyncDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Sincronizar por Nome</DialogTitle>
                    <DialogDescription>
                      Digite os nomes dos personagens (um por linha) para sincronizar com VortexMU
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <Textarea
                      placeholder="GodSnow&#10;Conan&#10;Ronin&#10;..."
                      value={batchSyncNames}
                      onChange={(e) => setBatchSyncNames(e.target.value)}
                      rows={8}
                      className="resize-none"
                    />
                    <p className="text-sm text-muted-foreground">
                      {batchSyncNames.split('\n').filter(n => n.trim()).length} personagem(ns) para sincronizar
                    </p>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setBatchSyncDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleBatchSync} disabled={syncing}>
                      {syncing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Sincronizando...
                        </>
                      ) : (
                        'Sincronizar'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <FileUp className="w-4 h-4 mr-2" />
                    Importar em Massa
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Importar Personagens em Massa</DialogTitle>
                    <DialogDescription>
                      Importe personagens de um arquivo Excel ou TXT. Personagens existentes serão atualizados.
                    </DialogDescription>
                  </DialogHeader>
                  <CharacterImport
                    onComplete={() => {
                      setImportDialogOpen(false);
                      loadCharacters();
                    }}
                    onCancel={() => setImportDialogOpen(false)}
                  />
                </DialogContent>
              </Dialog>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={openAddDialog}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar
                  </Button>
                </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleSubmit}>
                  <DialogHeader>
                    <DialogTitle>
                      {editingCharacter ? 'Editar Personagem' : 'Novo Personagem'}
                    </DialogTitle>
                    <DialogDescription>
                      Preencha os dados do personagem
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nome do Assassino</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        disabled={submitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guild">Guild</Label>
                      <Input
                        id="guild"
                        value={formData.guild}
                        onChange={(e) => setFormData({ ...formData, guild: e.target.value })}
                        required
                        disabled={submitting}
                      />
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <div className="space-y-2">
                        <Label htmlFor="class">Classe</Label>
                        <Input
                          id="class"
                          value={formData.class}
                          onChange={(e) => {
                            const newClass = e.target.value;
                            const autoShort = CLASS_SHORT_MAP[newClass] || formData.class_short;
                            setFormData({ ...formData, class: newClass, class_short: autoShort });
                          }}
                          required
                          disabled={submitting}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="class_short">Reduzido</Label>
                        <Input
                          id="class_short"
                          value={formData.class_short}
                          onChange={(e) => setFormData({ ...formData, class_short: e.target.value.slice(0, 3) })}
                          placeholder="Ex: DrK"
                          maxLength={3}
                          className="w-20"
                          disabled={submitting}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pilot_name">Piloto</Label>
                      <Input
                        id="pilot_name"
                        value={formData.pilot_name}
                        onChange={(e) => setFormData({ ...formData, pilot_name: e.target.value })}
                        placeholder="Nome do piloto (pessoa real)"
                        disabled={submitting}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        'Salvar'
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            </>
          )}
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assassino</TableHead>
                <TableHead>Guild</TableHead>
                <TableHead>Classe</TableHead>
                <TableHead>Sigla</TableHead>
                {isAdmin && <TableHead className="text-center">Main</TableHead>}
                {canEditData && <TableHead>Status</TableHead>}
                {canEditData && <TableHead className="w-[100px]">Ações</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCharacters.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={(canEditData ? 6 : 4) + (isAdmin ? 1 : 0)} className="text-center text-muted-foreground">
                    {showUnregisteredOnly ? 'Nenhum personagem sem cadastro no momento' : 'Nenhum personagem encontrado'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredCharacters.map((character) => (
                  <TableRow 
                    key={character.id}
                    className={character.banned ? 'bg-destructive/10 opacity-70' : ''}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {character.banned && <Ban className="w-4 h-4 text-destructive" />}
                        {character.is_main && <Crown className="w-4 h-4 text-yellow-500" />}
                        <span className={character.banned ? 'text-destructive line-through' : ''}>
                          {character.name}
                        </span>
                        {character.is_main && (
                          <Badge variant="outline" className="border-yellow-500 text-yellow-600 text-[10px] px-1.5 py-0">MAIN</Badge>
                        )}
                        {isIncomplete(character) && (
                          <span className="text-xs text-yellow-600 font-semibold">
                            (Cadastro incompleto)
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{character.guild || '-'}</TableCell>
                    <TableCell>{character.class || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {character.class_short || CLASS_SHORT_MAP[character.class] || '-'}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-center">
                        <input
                          type="checkbox"
                          checked={!!character.is_main}
                          onChange={() => handleToggleMain(character)}
                          disabled={character.id.startsWith('unregistered-') || !character.guild}
                          title={character.is_main ? 'Remover marca de Main' : 'Marcar como Main da guild'}
                          className="h-4 w-4 cursor-pointer accent-yellow-500 disabled:cursor-not-allowed disabled:opacity-50"
                        />
                      </TableCell>
                    )}
                    {canEditData && (
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={!character.banned}
                            onCheckedChange={() => handleToggleBan(character)}
                            disabled={character.id.startsWith('unregistered-')}
                          />
                          <span className={`text-xs font-medium ${character.banned ? 'text-destructive' : 'text-green-600'}`}>
                            {character.banned ? 'Banido' : 'Ativo'}
                          </span>
                        </div>
                      </TableCell>
                    )}
                    {canEditData && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSyncSingleCharacter(character.name, character.id)}
                            disabled={syncingCharacterId === character.id}
                            title="Sincronizar com VortexMU"
                          >
                            {syncingCharacterId === character.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(character)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(character.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
