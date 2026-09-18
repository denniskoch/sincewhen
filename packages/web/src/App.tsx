import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { api } from '@/lib/api';
import { Display } from '@/pages/Display';

// The wall display runs unattended for weeks; keep its bundle free of the
// admin's dialogs, toasts and forms by loading those only on /admin.
const Admin = lazy(() => import('@/pages/Admin').then((m) => ({ default: m.Admin })));
const Login = lazy(() => import('@/pages/Login').then((m) => ({ default: m.Login })));
const Toaster = lazy(() => import('sonner').then((m) => ({ default: m.Toaster })));

function Loading({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex min-h-screen items-center justify-center text-sm">
      {label}
    </div>
  );
}

/** Shows the admin when a session cookie is valid, the login form otherwise. */
function AdminRoute() {
  const { data, isLoading } = useQuery({
    queryKey: ['session'],
    queryFn: api.session,
    retry: false,
  });

  if (isLoading) {
    return <Loading label="Checking session…" />;
  }

  return (
    <Suspense fallback={<Loading label="Loading…" />}>
      {data?.authenticated ? <Admin /> : <Login />}
      <Toaster theme="dark" position="top-right" richColors />
    </Suspense>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Display />} />
      <Route path="/admin" element={<AdminRoute />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
