import type { Counter } from '@sincewhen/shared';
import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toDateTimeLocalValue } from '@/lib/format';

export interface CounterFormValues {
  name: string;
  description: string;
  lastIncidentAt: string;
}

interface CounterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Omit to create a new counter. */
  counter?: Counter;
  onSubmit: (values: CounterFormValues) => void;
  isPending: boolean;
  fieldErrors?: Record<string, string[]>;
}

function emptyValues(): CounterFormValues {
  return {
    name: '',
    description: '',
    lastIncidentAt: toDateTimeLocalValue(new Date().toISOString()),
  };
}

export function CounterDialog({
  open,
  onOpenChange,
  counter,
  onSubmit,
  isPending,
  fieldErrors,
}: CounterDialogProps) {
  const [values, setValues] = useState<CounterFormValues>(emptyValues);
  // Server-side errors are held locally so editing a field can clear its own
  // message rather than leaving a stale complaint about the previous value.
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  // Reload the form whenever the dialog opens, so it never shows stale input.
  useEffect(() => {
    if (!open) return;

    setErrors({});
    setValues(
      counter
        ? {
            name: counter.name,
            description: counter.description,
            lastIncidentAt: toDateTimeLocalValue(counter.lastIncidentAt),
          }
        : emptyValues(),
    );
  }, [open, counter]);

  useEffect(() => {
    setErrors(fieldErrors ?? {});
  }, [fieldErrors]);

  /** Updates one field and drops any server error still attached to it. */
  const setField = (field: keyof CounterFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(values);
  };

  const errorFor = (field: string) => errors[field]?.[0];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{counter ? 'Edit counter' : 'New counter'}</DialogTitle>
          <DialogDescription>
            {counter
              ? 'Change the details or correct when the incident actually happened.'
              : 'Add something to count the days since.'}
          </DialogDescription>
        </DialogHeader>

        <form id="counter-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={values.name}
              autoFocus
              placeholder="prod-outage"
              aria-invalid={Boolean(errorFor('name'))}
              onChange={(event) => setField('name', event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              A short unique key. Not shown on the wall display.
            </p>
            {errorFor('name') && <p className="text-destructive text-sm">{errorFor('name')}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={values.description}
              placeholder="Someone took production down"
              aria-invalid={Boolean(errorFor('description'))}
              onChange={(event) => setField('description', event.target.value)}
            />
            <p className="text-muted-foreground text-xs">This is the line shown on the board.</p>
            {errorFor('description') && (
              <p className="text-destructive text-sm">{errorFor('description')}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="lastIncidentAt">Last happened</Label>
            <Input
              id="lastIncidentAt"
              type="datetime-local"
              value={values.lastIncidentAt}
              aria-invalid={Boolean(errorFor('lastIncidentAt'))}
              onChange={(event) => setField('lastIncidentAt', event.target.value)}
            />
            {errorFor('lastIncidentAt') && (
              <p className="text-destructive text-sm">{errorFor('lastIncidentAt')}</p>
            )}
          </div>
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="counter-form" disabled={isPending}>
            {isPending ? 'Saving…' : counter ? 'Save changes' : 'Create counter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
