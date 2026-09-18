import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LockIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, api } from '@/lib/api';

export function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const login = useMutation({
    mutationFn: (value: string) => api.login(value),
    onSuccess: async () => {
      setError(null);
      setPassword('');
      await queryClient.invalidateQueries({ queryKey: ['session'] });
    },
    onError: (cause: unknown) => {
      setError(
        cause instanceof ApiError && cause.status === 429
          ? 'Too many attempts. Wait a few minutes and try again.'
          : cause instanceof Error
            ? cause.message
            : 'Login failed',
      );
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (password.length === 0) return;
    login.mutate(password);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LockIcon className="size-4" /> Admin sign in
          </CardTitle>
          <CardDescription>Enter the admin password to manage counters.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                aria-invalid={error !== null}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                }}
              />
              {error && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
            </div>

            <Button type="submit" disabled={login.isPending || password.length === 0}>
              {login.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
