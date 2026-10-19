import { useState, useEffect, useCallback } from 'react';
import {
  X,
  UserPlus,
  UserMinus,
  Crown,
  Shield,
  Loader2,
  LogOut,
  Pencil,
  Check,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { getSessionUser } from '@/lib/session';

export function GroupInfoPanel({ open, conversationId, onClose, onChanged }) {
  const me = getSessionUser();
  const [group, setGroup] = useState(null);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError('');
    try {
      const [g, f] = await Promise.all([
        api.getGroup(conversationId),
        api.listFriends(),
      ]);
      setGroup(g.data);
      setTitleDraft(g.data?.title || '');
      setFriends(f.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (open) {
      load();
      setEditingName(false);
      setShowAdd(false);
    }
  }, [open, load]);

  if (!open) return null;

  const myRole = group?.members?.find((m) => m.userId === me?.id)?.role;
  const isAdmin = myRole === 'owner' || myRole === 'admin';
  const memberIds = new Set(group?.members?.map((m) => m.userId) || []);
  const addable = friends.filter((f) => !memberIds.has(f.id));

  const run = async (key, fn) => {
    setBusy(key);
    setError('');
    try {
      await fn();
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const saveTitle = () =>
    run('title', async () => {
      await api.updateGroup(conversationId, { title: titleDraft.trim() });
      setEditingName(false);
    });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[8vh]">
      <div className="flex max-h-[80vh] w-full max-w-md flex-col animate-slide-up rounded-2xl border border-bambi-border bg-bambi-surface shadow-bambi-lg">
        <div className="flex items-center justify-between border-b border-bambi-border px-4 py-3">
          <h2 className="text-lg font-semibold">Group info</h2>
          <Button variant="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-bambi-primary" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4 text-center">
              <Avatar
                src={group?.avatarUrl}
                name={group?.title}
                size="xl"
                className="mx-auto"
              />
              {editingName && isAdmin ? (
                <div className="mt-3 flex items-center gap-2">
                  <Input
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    className="text-center"
                    maxLength={80}
                  />
                  <Button
                    variant="primary"
                    className="!px-2"
                    disabled={busy === 'title' || !titleDraft.trim()}
                    onClick={saveTitle}
                  >
                    {busy === 'title' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ) : (
                <div className="mt-2 flex items-center justify-center gap-2">
                  <h3 className="text-lg font-semibold">{group?.title}</h3>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setEditingName(true)}
                      className="rounded-full p-1.5 text-bambi-text-secondary hover:bg-bambi-background hover:text-bambi-primary"
                      title="Change group name"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                </div>
              )}
              <p className="text-sm text-bambi-text-secondary">
                {group?.members?.length || 0} members
                {isAdmin ? ' · You are admin' : ''}
              </p>
            </div>

            {error && (
              <p className="mb-2 text-sm text-bambi-error" role="alert">
                {error}
              </p>
            )}

            {isAdmin && (
              <Button
                variant="secondary"
                size="sm"
                className="mb-3 w-full"
                onClick={() => setShowAdd((v) => !v)}
              >
                <UserPlus className="h-4 w-4" /> Add members
              </Button>
            )}

            {showAdd && isAdmin && (
              <div className="mb-4 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-bambi-border p-2">
                {addable.length === 0 ? (
                  <p className="px-2 py-3 text-center text-sm text-bambi-text-secondary">
                    No friends left to add
                  </p>
                ) : (
                  addable.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      disabled={busy === f.id}
                      onClick={() =>
                        run(f.id, () => api.addGroupMembers(conversationId, [f.id]))
                      }
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-bambi-background"
                    >
                      <Avatar name={f.displayName || f.username} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {f.displayName || f.username}
                      </span>
                      {busy === f.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="h-4 w-4 text-bambi-primary" />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}

            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-bambi-text-secondary">
              Members
            </h4>
            <div className="space-y-1">
              {group?.members?.map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-bambi-background"
                >
                  <Avatar
                    name={m.profile?.displayName || m.profile?.username}
                    src={m.profile?.avatarUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {m.profile?.displayName || m.profile?.username}
                      {m.userId === me?.id ? ' (you)' : ''}
                    </p>
                    <p className="text-xs capitalize text-bambi-text-secondary">
                      {m.role}
                      {m.role === 'owner' && (
                        <Crown className="ml-1 inline h-3 w-3 text-amber-500" />
                      )}
                      {m.role === 'admin' && (
                        <Shield className="ml-1 inline h-3 w-3 text-bambi-primary" />
                      )}
                    </p>
                  </div>
                  {isAdmin && m.userId !== me?.id && m.role !== 'owner' && (
                    <Button
                      variant="icon"
                      title="Remove from group"
                      disabled={busy === m.userId}
                      onClick={() =>
                        run(m.userId, () =>
                          api.removeGroupMember(conversationId, m.userId)
                        )
                      }
                    >
                      <UserMinus className="h-4 w-4 text-bambi-error" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <Button
              variant="danger"
              size="sm"
              className="mt-6 w-full"
              disabled={busy === 'leave'}
              onClick={() =>
                run('leave', async () => {
                  await api.removeGroupMember(conversationId, me.id);
                  onClose?.();
                  onChanged?.({ left: true });
                })
              }
            >
              <LogOut className="h-4 w-4" /> Leave group
            </Button>
          </div>
        )}
      </div>
      <button type="button" className="absolute inset-0 -z-10" onClick={onClose} aria-label="Close" />
    </div>
  );
}
