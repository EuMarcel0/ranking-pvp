import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Webhook } from 'lucide-react';

export const WebhookManager = () => {

  return (
    <Card className="border-primary/50">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Webhook className="w-8 h-8 text-primary" />
          <div>
            <CardTitle className="text-2xl">Configuração de Webhooks Discord</CardTitle>
            <CardDescription className="text-base mt-1">
              Configure os webhooks para homologação e produção
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="bg-muted rounded-lg p-6">
          <h4 className="font-semibold mb-4 text-lg">ℹ️ Como configurar os webhooks Discord:</h4>
          
          <ol className="list-decimal list-inside space-y-3 text-sm mb-6">
            <li className="pl-2">
              <span className="font-medium">Acesse a área de Secrets do backend</span>
              <p className="text-muted-foreground ml-6 mt-1">
                Clique no botão "Abrir Backend" que aparece logo abaixo desta mensagem no chat
              </p>
            </li>
            
            <li className="pl-2">
              <span className="font-medium">Adicione ou atualize os seguintes secrets:</span>
              <ul className="list-disc list-inside ml-6 mt-2 space-y-1">
                <li>
                  <code className="text-xs bg-background px-2 py-1 rounded">DISCORD_WEBHOOK_URL</code>
                  <span className="text-muted-foreground ml-2">(webhook de homologação/testes)</span>
                </li>
                <li>
                  <code className="text-xs bg-background px-2 py-1 rounded">DISCORD_WEBHOOK_URL_PROD</code>
                  <span className="text-muted-foreground ml-2">(webhook de produção/oficial)</span>
                </li>
              </ul>
            </li>
            
            <li className="pl-2">
              <span className="font-medium">Cole os URLs dos webhooks do Discord</span>
              <p className="text-muted-foreground ml-6 mt-1">
                Obtenha os webhooks no Discord (Configurações do Canal → Integrações → Webhooks)
              </p>
            </li>
            
            <li className="pl-2">
              <span className="font-medium">Use ao publicar rankings</span>
              <p className="text-muted-foreground ml-6 mt-1">
                Ao publicar um ranking, selecione o ambiente desejado (Homologação ou Produção)
              </p>
            </li>
          </ol>

          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-sm text-yellow-700 dark:text-yellow-400 flex items-start gap-2">
              <span>⚠️</span>
              <span>Por segurança, os webhooks são armazenados apenas no backend (secrets) e não são visíveis no navegador.</span>
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
