import { useState } from 'react';
import { Download, FileText, Film, Image as ImageIcon, Loader2, Mic, Music } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconFor(mime = '', filename = '') {
  if (mime.startsWith('audio/') || /\.(webm|ogg|m4a|mp3|wav)$/i.test(filename)) {
    return Mic;
  }
  if (mime.startsWith('image/')) return ImageIcon;
  if (mime.startsWith('video/')) return Film;
  if (mime.startsWith('audio/') || mime.includes('mpeg')) return Music;
  return FileText;
}

/**
 * Attachment card — works in light and dark bubbles.
 */
export function AttachmentCard({
  filename = 'File',
  mime = '',
  size,
  isOwn = false,
  onDownloadDecrypt,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const Icon = iconFor(mime, filename);
  const isVoice =
    mime.startsWith('audio/') || /\.(webm|ogg|m4a|mp3|wav)$/i.test(filename);

  const handle = async () => {
    if (!onDownloadDecrypt || busy) return;
    setBusy(true);
    setError('');
    try {
      const blob = await onDownloadDecrypt();
      if (!blob) throw new Error('Download failed');
      const url = URL.createObjectURL(blob);
      if (isVoice || mime.startsWith('audio/')) {
        const audio = new Audio(url);
        audio.play().catch(() => {
          // fallback download
          const a = document.createElement('a');
          a.href = url;
          a.download = filename || 'audio.webm';
          a.click();
        });
        audio.onended = () => URL.revokeObjectURL(url);
      } else if (mime.startsWith('image/')) {
        window.open(url, '_blank', 'noopener,noreferrer');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'file';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    } catch (e) {
      setError(e?.message || 'Could not open file');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-1 min-w-[200px] max-w-full">
      <button
        type="button"
        onClick={handle}
        disabled={busy}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition',
          isOwn
            ? 'bg-black/10 hover:bg-black/15 dark:bg-white/10 dark:hover:bg-white/15'
            : 'bg-bambi-background hover:bg-bambi-border/40'
        )}
      >
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
            isOwn
              ? 'bg-black/10 text-bambi-text dark:bg-white/10 dark:text-white'
              : 'bg-bambi-primary/15 text-bambi-primary'
          )}
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Icon className="h-5 w-5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-sm font-medium',
              isOwn ? 'text-inherit' : 'text-bambi-text'
            )}
          >
            {isVoice ? 'Voice message' : filename}
          </span>
          <span
            className={cn(
              'mt-0.5 block text-xs',
              isOwn ? 'opacity-70' : 'text-bambi-text-secondary'
            )}
          >
            {formatSize(size)}
            {busy ? ' · Opening…' : isVoice ? ' · Tap to play' : ' · Tap to open'}
          </span>
        </span>
        <Download
          className={cn(
            'h-4 w-4 shrink-0',
            isOwn ? 'opacity-60' : 'text-bambi-text-secondary'
          )}
        />
      </button>
      {error && (
        <p className="mt-1 text-xs text-bambi-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
