import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Swords, Loader2 } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { z } from 'zod';


const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate('/');
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/');
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);


  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate email format for login
    const emailValidation = z.string().email('Email inválido').safeParse(email);
    if (!emailValidation.success) {
      toast({
        title: "Erro de validação",
        description: emailValidation.error.errors[0].message,
        variant: "destructive"
      });
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: emailValidation.data,
        password
      });

      if (error) {
        toast({
          title: "Erro no login",
          description: error.message,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Bem-vindo!",
          description: "Login realizado com sucesso",
        });
      }
    } catch (error) {
      toast({
        title: "Erro",
        description: "Ocorreu um erro ao fazer login",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background gradient-gaming flex items-center justify-center p-4">
      <Helmet>
        <title>Login - Ranking de Kill PVP BOSS</title>
        <meta name="description" content="Acesse o painel administrativo do Ranking de Kill PVP BOSS para gerenciar partidas, personagens e configurações." />
        <meta name="robots" content="noindex,follow" />
        <link rel="canonical" href="https://rankingpvpboss.lovable.app/auth" />
        <meta property="og:title" content="Login - Ranking de Kill PVP BOSS" />
        <meta property="og:description" content="Acesse o painel administrativo do Ranking de Kill PVP BOSS." />
        <meta property="og:url" content="https://rankingpvpboss.lovable.app/auth" />
        <meta property="og:type" content="website" />
      </Helmet>
      <main className="w-full max-w-md">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Swords className="w-12 h-12 text-primary animate-pulse" />
          </div>
          <CardTitle className="text-3xl">Placar da Humilhação</CardTitle>
          <CardDescription>
            Faça login para acessar o sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Senha</Label>
              <Input
                id="login-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar'
              )}
            </Button>
          </form>
          
          <div className="mt-4 text-center">
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="text-sm"
            >
              Voltar para o placar
            </Button>
          </div>
        </CardContent>
      </Card>
      </main>
    </div>
  );
};

export default Auth;
