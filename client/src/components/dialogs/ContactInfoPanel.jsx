import { useEffect, useMemo, useState } from 'react';
import { Ban, Download, File as FileIcon, Image as ImageIcon, Loader2, Lock, Phone, Search, Video, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Avatar } from '@/components/ui/Avatar';

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Right-side drawer with a contact's details, call/search actions and the
 * files shared in the messages loaded in this chat.
 */
export function ContactInfoPanel({
  open,
  conversation,
  messages = [],
  onClose,
  onAudioCall,
  onVideoCall,
  onSearch,
  onDownloadAttachment,
  onBlocked,
  callsDisabled,
  callsDisabledReason,
}) {
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    if (!open) { setConfirmBlock(false); setError(''); return undefined; }
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const shared = useMemo(() => messages.filter((m) => m.attachment && !m.isDeleted), [messages]);
  const media = shared.filter((m) => m.attachment.mime?.startsWith('image/') || m.attachment.mime?.startsWith('video/'));
  const files = shared.filter((m) => !media.includes(m));

  if (!open || !conversation) return null;
  const { name, avatarUrl, isOnline, peerUserId } = conversation;
  const username = conversation.username || conversation.peerUsername;

  const download = async (message) => {
    const att = message.attachment;
    setDownloading(message.id);
    setError('');
    try {
      const blob = await onDownloadAttachment(att);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.filename || 'file';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message || 'Download failed');
    } finally {
      setDownloading(null);
    }
  };

  const block = async () => {
    setBusy(true);
    setError('');
    try {
      await api.blockUser(peerUserId);
      onBlocked?.();
      onClose?.();
    } catch (e) {
      setError(e.message || 'Could not block this user');
    } finally {
      setBusy(false);
    }
  };

  const ActionPill = ({ icon: Icon, label, onClick, disabled, title }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex flex-1 items-center justify-center gap-2 rounded-full border border-bambi-border bg-bambi-surface px-4 py-2.5 text-sm font-medium text-bambi-text transition hover:border-bambi-primary hover:text-bambi-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-bambi-border disabled:hover:text-bambi-text"
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" role="presentation">
      <button type="button" className="absolute inset-0 cursor-default bg-black/40" onClick={onClose} aria-label="Close contact info" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Contact info for ${name}`}
        className="relative z-10 flex h-full w-full flex-col overflow-y-auto bg-bambi-surface shadow-2xl sm:w-[380px] sm:border-l"
      >
        <header className="flex items-center justify-between px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
          <h2 className="text-base font-semibold">Contact info</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-bambi-background text-bambi-text-secondary hover:text-bambi-text">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex flex-col items-center px-6 pb-5 pt-3 text-center">
          <div className="scale-[1.9] py-9"><Avatar src={avatarUrl} name={name} size="xl" online={isOnline} /></div>
          <h3 className="mt-3 max-w-full break-words text-xl font-semibold">{name}</h3>
          {username && <p className="text-sm text-bambi-text-secondary">@{username}</p>}
          <p className={`mt-1 text-sm ${isOnline ? 'text-bambi-success' : 'text-bambi-text-secondary'}`}>{isOnline ? 'Online' : 'Offline'}</p>
          <div className="mt-5 flex w-full gap-2">
            <ActionPill icon={Phone} label="Audio" onClick={() => { onClose?.(); onAudioCall?.(); }} disabled={callsDisabled} title={callsDisabled ? callsDisabledReason : undefined} />
            <ActionPill icon={Video} label="Video" onClick={() => { onClose?.(); onVideoCall?.(); }} disabled={callsDisabled} title={callsDisabled ? callsDisabledReason : undefined} />
            <ActionPill icon={Search} label="Search" onClick={() => { onClose?.(); onSearch?.(); }} />
          </div>
        </div>

        <div className="space-y-5 px-4 pb-6">
          <section className="flex items-start gap-3 rounded-2xl bg-bambi-background p-3.5">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-bambi-success" />
            <p className="text-sm leading-5 text-bambi-text-secondary">Messages and files in this chat are end-to-end encrypted. Calls are encrypted peer-to-peer.</p>
          </section>

          <section>
            <h4 className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-2"><ImageIcon className="h-4 w-4 text-bambi-text-secondary" /> Media</span>
              <span className="text-xs font-normal text-bambi-text-secondary">{media.length}</span>
            </h4>
            {media.length === 0 ? (
              <p className="text-sm text-bambi-text-secondary">No photos or videos in the loaded messages.</p>
            ) : (
              <ul className="space-y-1">{media.map((m) => <SharedRow key={m.id} m={m} busy={downloading === m.id} onDownload={download} />)}</ul>
            )}
          </section>

          <section>
            <h4 className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span className="flex items-center gap-2"><FileIcon className="h-4 w-4 text-bambi-text-secondary" /> Files</span>
              <span className="text-xs font-normal text-bambi-text-secondary">{files.length}</span>
            </h4>
            {files.length === 0 ? (
              <p className="text-sm text-bambi-text-secondary">No files in the loaded messages.</p>
            ) : (
              <ul className="space-y-1">{files.map((m) => <SharedRow key={m.id} m={m} busy={downloading === m.id} onDownload={download} />)}</ul>
            )}
          </section>

          {error && <p role="alert" className="text-sm text-bambi-error">{error}</p>}

          <section className="border-t pt-4">
            {!confirmBlock ? (
              <button type="button" onClick={() => setConfirmBlock(true)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-bambi-error hover:bg-bambi-error/10">
                <Ban className="h-4 w-4" /> Block {name}
              </button>
            ) : (
              <div className="rounded-2xl border border-bambi-error/30 bg-bambi-error/5 p-4">
                <p className="text-sm font-medium">Block {name}?</p>
                <p className="mt-1 text-sm text-bambi-text-secondary">They will no longer be able to message you. You can unblock them in Settings.</p>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setConfirmBlock(false)} className="flex-1 rounded-xl border px-3 py-2 text-sm font-medium hover:bg-bambi-background">Cancel</button>
                  <button type="button" onClick={block} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-bambi-error px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Block
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function SharedRow({ m, busy, onDownload }) {
  const att = m.attachment;
  return (
    <li>
      <button type="button" onClick={() => onDownload(m)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-bambi-background">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-bambi-primary-light text-bambi-primary">
          {att.mime?.startsWith('image/') ? <ImageIcon className="h-5 w-5" /> : <FileIcon className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{att.filename || 'Attachment'}</span>
          <span className="block text-xs text-bambi-text-secondary">{formatSize(att.size)}</span>
        </span>
        {busy ? <Loader2 className="h-4 w-4 animate-spin text-bambi-text-secondary" /> : <Download className="h-4 w-4 text-bambi-text-secondary" />}
      </button>
    </li>
  );
}
