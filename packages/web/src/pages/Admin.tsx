import type { Counter } from '@sincewhen/shared';
import { elapsedSince } from '@sincewhen/shared/time';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLinkIcon, LogOutIcon, PencilIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { CounterDialog, type CounterFormValues } from '@/components/CounterDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError, api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useConfig } from '@/lib/useConfig';

function elapsedLabel(counter: Counter): string {
  const { days, hours } = elapsedSince(counter.lastIncidentAt);
  if (days === 0) return `${hours}h`;
  return `${days}d ${hours}h`;
}

export function Admin() {
  const { pageTitle } = useConfig();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Counter | undefined>();
  const [deleting, setDeleting] = useState<Counter | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>();

  const { data: counters = [], isLoading } = useQuery({
    queryKey: ['counters'],
    queryFn: api.listCounters,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['counters'] });

  /** Surfaces field-level validation errors in the dialog, everything else as a toast. */
  const handleMutationError = (cause: unknown, fallback: string) => {
    if (cause instanceof ApiError && cause.fields) {
      setFieldErrors(cause.fields);
      return;
    }

    toast.error(cause instanceof Error ? cause.message : fallback);
  };

  const save = useMutation({
    mutationFn: async (values: CounterFormValues) => {
      const payload = {
        name: values.name,
        description: values.description,
        lastIncidentAt: values.lastIncidentAt,
      };

      return editing ? api.updateCounter(editing.id, payload) : api.createCounter(payload);
    },
    onSuccess: async (counter) => {
      setFieldErrors(undefined);
      setDialogOpen(false);
      toast.success(editing ? `Updated ${counter.name}` : `Created ${counter.name}`);
      await invalidate();
    },
    onError: (cause) => handleMutationError(cause, 'Could not save counter'),
  });

  const reset = useMutation({
    mutationFn: (counter: Counter) => api.resetCounter(counter.id),
    onSuccess: async (counter) => {
      toast.success(`${counter.description} — clock restarted`);
      await invalidate();
    },
    onError: (cause) => handleMutationError(cause, 'Could not reset counter'),
  });

  const remove = useMutation({
    mutationFn: (counter: Counter) => api.deleteCounter(counter.id),
    onSuccess: async () => {
      toast.success('Counter deleted');
      setDeleting(undefined);
      await invalidate();
    },
    onError: (cause) => handleMutationError(cause, 'Could not delete counter'),
  });

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session'] });
    },
  });

  const openCreate = () => {
    setEditing(undefined);
    setFieldErrors(undefined);
    setDialogOpen(true);
  };

  const openEdit = (counter: Counter) => {
    setEditing(counter);
    setFieldErrors(undefined);
    setDialogOpen(true);
  };

  return (
    <div className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-wide uppercase">
            {pageTitle}
          </h1>
          <p className="text-muted-foreground text-sm">
            Add, edit, reset and delete the counters shown on the wall.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/" target="_blank" rel="noreferrer">
              <ExternalLinkIcon /> View board
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
          >
            <LogOutIcon /> Sign out
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Counters</CardTitle>
            <CardDescription>
              {counters.length} {counters.length === 1 ? 'counter' : 'counters'}, most recent
              incident first.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openCreate}>
            <PlusIcon /> New counter
          </Button>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Loading counters…</p>
          ) : counters.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-muted-foreground mb-4 text-sm">
                No counters yet. The board will be empty until you add one.
              </p>
              <Button onClick={openCreate}>
                <PlusIcon /> Add the first counter
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Last happened</TableHead>
                  <TableHead>Elapsed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {counters.map((counter) => (
                  <TableRow key={counter.id}>
                    <TableCell className="font-mono text-xs">{counter.name}</TableCell>
                    <TableCell className="max-w-[22rem]">{counter.description}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDateTime(counter.lastIncidentAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{elapsedLabel(counter)}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Reset the clock to now"
                          onClick={() => reset.mutate(counter)}
                          disabled={reset.isPending}
                        >
                          <RotateCcwIcon /> Reset
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit"
                          onClick={() => openEdit(counter)}
                        >
                          <PencilIcon />
                          <span className="sr-only">Edit {counter.name}</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleting(counter)}
                        >
                          <Trash2Icon />
                          <span className="sr-only">Delete {counter.name}</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CounterDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        counter={editing}
        onSubmit={(values) => save.mutate(values)}
        isPending={save.isPending}
        fieldErrors={fieldErrors}
      />

      <AlertDialog
        open={deleting !== undefined}
        onOpenChange={(open) => !open && setDeleting(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this counter?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.description}” will be removed from the board permanently. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                if (deleting) remove.mutate(deleting);
              }}
            >
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
