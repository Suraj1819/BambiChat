import { useState } from 'react';
import { Download, FileText, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

function formatSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Renders an encrypted attachment inside a message bubble.
 * onDownloadDecrypt: async () => Blob
 */
export function AttachmentCard({
  filename,
  mime,
  size,
  isOwn,
  onDownloadDecrypt,
  className,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const isImage = mime?.startsWith('image/');

  const open = async () => {
    setLoading(true);
    setError('');
    try {
      const blob = await onDownloadDecrypt();
      const url = URL.createObjectURL(blob);
      if (isImage) {
        setPreviewUrl(url);
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'download';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
      }
    } catch (e) {
      setError(e.message || 'Download failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn('mt-1 min-w-[180px] max-w-xs', className)}>
      {previewUrl ? (
        <button type="button" onClick={() => window.open(previewUrl, '_blank')} className="block w-full overflow-hidden rounded-bambi">
          <img src={previewUrl} alt={filename} className="max-h-56 w-full object-cover" />
        </button>
      ) : (
        <button
          type="button"
          onClick={open}
          disabled={loading}
          className={cn(
            'flex w-full items-center gap-3 rounded-bambi border px-3 py-2.5 text-left transition-colors',
            isOwn
              ? 'border-white/20 bg-white/10 hover:bg-white/15'
              : 'border-bambi-border bg-bambi-background hover:bg-bambi-primary-light/40'
          )}
        >
          <div
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-bambi',
              isOwn ? 'bg-white/20' : 'bg-bambi-primary-light text-bambi-primary'
            )}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isImage ? (
              <ImageIcon className="h-5 w-5" />
            ) : (
              <FileText className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-label">{filename || 'File'}</p>
            <p className={cn('text-caption', isOwn ? 'text-white/70' : 'text-bambi-text-secondary')}>
              {formatSize(size || 0)} · Tap to {isImage ? 'view' : 'download'}
            </p>
          </div>
          <Download className="h-4 w-4 shrink-0 opacity-70" />
        </button>
      )}
      {error && (
        <p className="mt-1 flex items-center gap-1 text-caption text-red-300">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}
