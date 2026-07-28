import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';

interface Props {
  lastEventAt: number | null;
}

/**
 * Indicador "AO VIVO" — pulsa por alguns segundos a cada novo evento,
 * volta a "Conectado" quando ocioso.
 */
export const LiveIndicator = ({ lastEventAt }: Props) => {
  const [pulsing, setPulsing] = useState(false);

  useEffect(() => {
    if (!lastEventAt) return;
    setPulsing(true);
    const t = window.setTimeout(() => setPulsing(false), 4000);
    return () => window.clearTimeout(t);
  }, [lastEventAt]);

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
        pulsing
          ? 'bg-red-500/20 border-red-500/60 text-red-400'
          : 'bg-green-500/10 border-green-500/40 text-green-500'
      }`}
      title={lastEventAt ? `Última atualização: ${new Date(lastEventAt).toLocaleTimeString('pt-BR')}` : 'Conectado em tempo real'}
    >
      <Radio className={`w-3 h-3 ${pulsing ? 'animate-pulse' : ''}`} />
      {pulsing ? 'AO VIVO' : 'Conectado'}
    </div>
  );
};
