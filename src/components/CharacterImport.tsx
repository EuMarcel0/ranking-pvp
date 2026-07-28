import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

import { CLASS_SHORT_MAP } from '@/lib/classShortMap';

interface CharacterData {
  name: string;
  guild: string;
  class: string;
  class_short: string;
  pilot_name: string;
}

interface ImportSummary {
  toUpdate: number;
  toInsert: number;
  total: number;
}

interface CharacterImportProps {
  onComplete: () => void;
  onCancel: () => void;
}

export const CharacterImport = ({ onComplete, onCancel }: CharacterImportProps) => {
  const [dragOver, setDragOver] = useState(false);
  const [parsedData, setParsedData] = useState<CharacterData[]>([]);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());

  const normalize = (s: string) =>
    (s ?? '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const fetchExistingCharacters = async () => {
    const { data, error } = await supabase
      .from('characters')
      .select('name');
    
    if (error) throw error;
    
    const names = new Set((data || []).map(c => normalize(c.name)));
    setExistingNames(names);
    return names;
  };

  const parseFile = async (file: File): Promise<CharacterData[]> => {
    const extension = file.name.split('.').pop()?.toLowerCase();
    
    if (extension === 'xlsx' || extension === 'xls') {
      return parseExcel(file);
    } else if (extension === 'txt' || extension === 'csv') {
      return parseTxt(file);
    } else {
      throw new Error('Formato não suportado. Use .xlsx, .xls, .csv ou .txt');
    }
  };

  const parseExcel = (file: File): Promise<CharacterData[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet);
          
          const characters: CharacterData[] = rows
            .map((row) => {
              // Normalize keys to lowercase for comparison
              const normalizedRow: Record<string, any> = {};
              for (const key of Object.keys(row)) {
                normalizedRow[key.toLowerCase().trim()] = row[key];
              }
              
              // Try different column name variations (all lowercase now)
              const name = normalizedRow['nome'] || normalizedRow['name'] || normalizedRow['personagem'] || '';
              const guild = normalizedRow['guild'] || normalizedRow['guilda'] || '';
              const charClass = normalizedRow['classe'] || normalizedRow['class'] || '';
              const pilot = normalizedRow['piloto'] || normalizedRow['pilot'] || normalizedRow['pilot_name'] || '';
              
              return {
                name: String(name).trim(),
                guild: String(guild).trim(),
                class: String(charClass).trim(),
                class_short: CLASS_SHORT_MAP[String(charClass).trim()] || '',
                pilot_name: String(pilot).trim(),
              };
            })
            .filter((c) => c.name.length > 0);
          
          resolve(characters);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsBinaryString(file);
    });
  };

  const parseTxt = (file: File): Promise<CharacterData[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const lines = content.split(/\r?\n/).filter(line => line.trim());
          
          // Detect separator (tab, semicolon, or comma)
          const firstDataLine = lines.find(line => !line.toLowerCase().includes('nome'));
          let separator = '\t';
          if (firstDataLine) {
            if (firstDataLine.includes('\t')) separator = '\t';
            else if (firstDataLine.includes(';')) separator = ';';
            else if (firstDataLine.includes(',')) separator = ',';
          }
          
          const characters: CharacterData[] = [];
          
          for (const line of lines) {
            const parts = line.split(separator).map(p => p.trim());
            
            // Skip header line
            const firstPart = parts[0]?.toLowerCase();
            if (firstPart === 'nome' || firstPart === 'name' || firstPart === 'personagem') {
              continue;
            }
            
            if (parts.length >= 3 && parts[0]) {
              characters.push({
                name: parts[0],
                guild: parts[1] || '',
                class: parts[2] || '',
                class_short: CLASS_SHORT_MAP[parts[2]?.trim() || ''] || '',
                pilot_name: parts[3] || '',
              });
            }
          }
          
          resolve(characters);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsText(file);
    });
  };

  const handleFile = async (file: File) => {
    try {
      const [data, existing] = await Promise.all([
        parseFile(file),
        fetchExistingCharacters()
      ]);
      
      // Deduplicate by name (keep last occurrence)
      const uniqueMap = new Map<string, CharacterData>();
      for (const char of data) {
        uniqueMap.set(normalize(char.name), char);
      }
      const uniqueData = Array.from(uniqueMap.values());
      
      // Calculate summary
      let toUpdate = 0;
      let toInsert = 0;
      
      for (const char of uniqueData) {
        if (existing.has(normalize(char.name))) {
          toUpdate++;
        } else {
          toInsert++;
        }
      }
      
      setParsedData(uniqueData);
      setSummary({ toUpdate, toInsert, total: uniqueData.length });
      
    } catch (error: any) {
      console.error('Error parsing file:', error);
      toast({
        title: 'Erro ao processar arquivo',
        description: error.message || 'Verifique o formato do arquivo',
        variant: 'destructive',
      });
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const importCharacters = async () => {
    if (parsedData.length === 0) return;
    
    setImporting(true);
    setProgress(0);
    
    let successCount = 0;
    let errorCount = 0;
    const batchSize = 50;
    
    try {
      for (let i = 0; i < parsedData.length; i += batchSize) {
        const batch = parsedData.slice(i, i + batchSize);
        
        for (const char of batch) {
          try {
            const normalizedName = normalize(char.name);
            
            // Check if exists
            const { data: existing } = await supabase
              .from('characters')
              .select('id')
              .ilike('name', char.name)
              .maybeSingle();
            
            if (existing) {
              const { error } = await supabase
                .from('characters')
                .update({ guild: char.guild, class: char.class, class_short: char.class_short, pilot_name: char.pilot_name })
                .eq('id', existing.id);
              
              if (error) throw error;
            } else {
              const { error } = await supabase
                .from('characters')
                .insert({ name: char.name, guild: char.guild, class: char.class, class_short: char.class_short, pilot_name: char.pilot_name });
              
              if (error) throw error;
            }
            successCount++;
          } catch (err) {
            console.error('Error processing character:', char.name, err);
            errorCount++;
          }
        }
        
        setProgress(Math.round(((i + batch.length) / parsedData.length) * 100));
      }
      
      toast({
        title: 'Importação concluída!',
        description: `${successCount} personagens processados${errorCount > 0 ? `, ${errorCount} erros` : ''}`,
      });
      
      onComplete();
      
    } catch (error: any) {
      console.error('Import error:', error);
      toast({
        title: 'Erro na importação',
        description: error.message || 'Falha ao importar personagens',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {parsedData.length === 0 ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-lg font-medium mb-2">Arraste seu arquivo aqui</p>
          <p className="text-sm text-muted-foreground mb-4">
            Formatos aceitos: .xlsx, .xls, .csv, .txt
          </p>
          <label className="cursor-pointer">
            <Button variant="outline" asChild>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                Selecionar Arquivo
              </span>
            </Button>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              onChange={handleFileInput}
              className="hidden"
            />
          </label>
          
          <div className="mt-6 text-left bg-muted/50 rounded-md p-4">
            <p className="text-sm font-medium mb-2">Formato esperado:</p>
            <code className="text-xs block bg-background p-2 rounded">
              Nome;Guild;Classe;Piloto<br/>
              KOMBAT;BADBOYS;Force Emperor;João<br/>
              Melisandre;BADBOYS;Endless Summoner;Maria
            </code>
          </div>
        </div>
      ) : (
        <>
          {/* Summary */}
          {summary && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-muted/50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold">{summary.total}</p>
                <p className="text-sm text-muted-foreground">Total</p>
              </div>
              <div className="bg-blue-500/10 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{summary.toUpdate}</p>
                <p className="text-sm text-muted-foreground">Atualizar</p>
              </div>
              <div className="bg-green-500/10 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{summary.toInsert}</p>
                <p className="text-sm text-muted-foreground">Novos</p>
              </div>
            </div>
          )}
          
          {/* Preview Table */}
          <div className="border rounded-md max-h-[300px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Guild</TableHead>
                  <TableHead>Classe</TableHead>
                  <TableHead>Sigla</TableHead>
                  <TableHead>Piloto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedData.slice(0, 50).map((char, idx) => {
                  const isExisting = existingNames.has(normalize(char.name));
                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        {isExisting ? (
                          <span className="flex items-center gap-1 text-blue-600 text-xs">
                            <AlertCircle className="w-3 h-3" />
                            Atualizar
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-green-600 text-xs">
                            <CheckCircle2 className="w-3 h-3" />
                            Novo
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{char.name}</TableCell>
                      <TableCell>{char.guild || '-'}</TableCell>
                      <TableCell>{char.class || '-'}</TableCell>
                      <TableCell className="font-mono text-xs">{char.class_short || '-'}</TableCell>
                      <TableCell>{char.pilot_name || '-'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {parsedData.length > 50 && (
              <p className="text-center text-sm text-muted-foreground py-2">
                ... e mais {parsedData.length - 50} registros
              </p>
            )}
          </div>
          
          {/* Progress */}
          {importing && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-center text-muted-foreground">
                Importando... {progress}%
              </p>
            </div>
          )}
          
          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setParsedData([]);
                setSummary(null);
              }}
              disabled={importing}
            >
              Escolher outro arquivo
            </Button>
            <Button variant="outline" onClick={onCancel} disabled={importing}>
              Cancelar
            </Button>
            <Button onClick={importCharacters} disabled={importing}>
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Importar {summary?.total} Personagens
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
