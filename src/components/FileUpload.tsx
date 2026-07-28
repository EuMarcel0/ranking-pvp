import { useCallback, useState } from 'react';
import { Upload, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  onFileUpload: (content: string) => void;
}

export const FileUpload = ({ onFileUpload }: FileUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

    if (!file.name.endsWith('.txt')) {
      alert('Por favor, selecione um arquivo .txt');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert('Arquivo muito grande. Limite: 5MB');
      return;
    }

    if (file.size === 0) {
      alert('Arquivo vazio');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      onFileUpload(content);
      setFileName(file.name);
    };
    reader.readAsText(file);
  }, [onFileUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "relative border-2 border-dashed rounded-lg p-12 text-center transition-all duration-300",
        isDragging 
          ? "border-primary bg-primary/10 glow-primary scale-105" 
          : "border-border bg-card hover:border-primary/50"
      )}
    >
      <input
        type="file"
        accept=".txt"
        onChange={handleFileInput}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      
      <div className="flex flex-col items-center gap-4">
        {fileName ? (
          <>
            <FileText className="w-16 h-16 text-primary animate-pulse" />
            <div>
              <p className="text-lg font-semibold text-primary">{fileName}</p>
              <p className="text-sm text-muted-foreground mt-1">Arquivo carregado com sucesso!</p>
            </div>
          </>
        ) : (
          <>
            <Upload className="w-16 h-16 text-muted-foreground" />
            <div>
              <p className="text-lg font-semibold text-foreground">
                Arraste seu arquivo .txt aqui
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                ou clique para selecionar
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
