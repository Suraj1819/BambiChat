import { useState, useEffect } from 'react';
import { X, Loader2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

export function CreateGroupDialog({ open, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [friends, setFriends] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setSelected(new Set());
    setError('');
    api.listFriends().then((r) => setFriends(r.data || [])).catch(() => {});
  }, [open]);

  const toggle = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Enter a group name');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.createGroup(title.trim(), [...selected]);
      onCreated?.(res.data);
      onClose?.();
    } catch (err) {
      setError(err.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col animate-slide-up rounded-bambi-xl border border-bambi-border bg-bambi-surface shadow-bambi-lg">
        <div className="flex items-center justify-between border-b border-bambi-border px-4 py-3">
          <h2 className="text-heading-3">New group</h2>
          <Button variant="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
          <div className="space-y-3 border-b border-bambi-border p-4">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Group name"
              autoFocus
            />
            {error && <p className="text-body-sm text-bambi-error">{error}</p>}
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <p className="px-2 py-1 text-caption text-bambi-text-secondary">
              Add friends ({selected.size} selected)
            </p>
            {friends.length === 0 ? (
              <p className="px-3 py-6 text-center text-body-sm text-bambi-text-secondary">
                Add friends first, then create a group.
              </p>
            ) : (
              friends.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggle(f.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-bambi px-3 py-2.5 text-left hover:bg-bambi-background',
                    selected.has(f.id) && 'bg-bambi-primary-light'
                  )}
                >
                  <Avatar name={f.displayName || f.username} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label">{f.displayName || f.username}</p>
                    <p className="text-caption text-bambi-text-secondary">@{f.username}</p>
                  </div>
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded-full border text-xs',
                      selected.has(f.id)
                        ? 'border-bambi-primary bg-bambi-primary text-white'
                        : 'border-bambi-border'
                    )}
                  >
                    {selected.has(f.id) ? '✓' : ''}
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-bambi-border p-4">
            <Button type="submit" variant="primary" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <>
                  <Users className="h-4 w-4" /> Create group
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
      <button type="button" className="absolute inset-0 -z-10" onClick={onClose} aria-label="Close" />
    </div>
  );
}
