import { useEffect, useRef, useState } from 'react';
import { File as FileIcon, Image as ImageIcon, Loader2, Plus, Send, Smile, Video, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/lib/preferences';

const ATTACH_OPTIONS = [
  { id: 'files', label: 'Files', icon: FileIcon, accept: '.pdf,.txt,.doc,.docx,.xls,.xlsx' },
  { id: 'images', label: 'Images', icon: ImageIcon, accept: 'image/jpeg,image/png,image/gif,image/webp' },
  { id: 'video', label: 'Video', icon: Video, accept: 'video/mp4,video/webm' },
];

const EMOJI = ['😀', '😂', '🥹', '😍', '👍', '❤️', '🎉', '🔥', '😊', '🙏', '👋', '🤝', '😎', '🤔', '💯', '✨'];

/**
 * Message composer with auto-resizing input, emoji picker and an attach tray.
 * `onSend` may return a promise; the text is cleared only if it resolves to anything other than `false`.
 */
export function MessageComposer({
  onSend,
  onAttach,
  disabled = false,
  uploading = false,
  uploadProgress = 0,
  placeholder = 'Type a message',
  onTypingChange,
  className,
}) {
  const { enterToSend } = usePreferences();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);

  // Auto-grow up to ~6 lines.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [text]);

  useEffect(() => () => window.clearTimeout(typingTimer.current), []);

  const canSend = Boolean(text.trim()) && !disabled && !uploading && !sending;

  const handleSend = async () => {
    const value = text.trim();
    if (!value || disabled || uploading || sending) return;
    setSending(true);
    try {
      const ok = await onSend?.(value);
      if (ok !== false) {
        setText('');
        onTypingChange?.(false);
      }
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const wantsSend = enterToSend ? !e.shiftKey : e.ctrlKey || e.metaKey;
    if (wantsSend) {
      e.preventDefault();
      handleSend();
    }
  };

  const pick = (accept) => {
    if (!fileRef.current) return;
    fileRef.current.accept = accept;
    setAttachOpen(false);
    fileRef.current.click();
  };

  return (
    <div className={cn('message-composer border-t border-bambi-border bg-bambi-surface px-3 pt-2.5 md:px-5', className)}>
      {uploading && (
        <div className="mb-2">
          <div className="mb-1 flex items-center justify-between text-caption text-bambi-text-secondary">
            <span>Encrypting &amp; uploading…</span>
            <span>{Math.round(uploadProgress)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bambi-border">
            <div className="h-full rounded-full bg-bambi-primary transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        </div>
      )}

      {attachOpen && (
        <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Attach">
          {ATTACH_OPTIONS.map(({ id, label, icon: Icon, accept }) => (
            <button
              key={id}
              type="button"
              onClick={() => pick(accept)}
              className="inline-flex items-center gap-2 rounded-full border border-bambi-border bg-bambi-background px-4 py-2 text-sm font-medium text-bambi-text transition hover:border-bambi-primary hover:text-bambi-primary"
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onAttach?.(f);
          }}
        />
        <button
          type="button"
          disabled={disabled || uploading}
          aria-label={attachOpen ? 'Close attachment options' : 'Attach'}
          aria-expanded={attachOpen}
          onClick={() => { setAttachOpen((v) => !v); setEmojiOpen(false); }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bambi-background text-bambi-text-secondary transition hover:bg-bambi-primary-light hover:text-bambi-primary disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : attachOpen ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
        </button>

        <div className="relative min-w-0 flex-1">
          {emojiOpen && (
            <div className="absolute bottom-14 right-0 z-20 grid grid-cols-8 gap-1 rounded-2xl border border-bambi-border bg-bambi-surface p-2 shadow-xl" role="group" aria-label="Choose an emoji">
              {EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="flex h-9 w-9 items-center justify-center rounded-lg text-xl hover:bg-bambi-background"
                  onClick={() => {
                    setText((current) => `${current}${emoji}`);
                    setEmojiOpen(false);
                    textareaRef.current?.focus();
                  }}
                  aria-label={`Insert ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (onTypingChange) {
                onTypingChange(true);
                window.clearTimeout(typingTimer.current);
                typingTimer.current = window.setTimeout(() => onTypingChange(false), 1500);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || uploading}
            rows={1}
            enterKeyHint={enterToSend ? 'send' : 'enter'}
            className="composer-textarea block max-h-36 min-h-[44px] w-full resize-none rounded-3xl border border-transparent py-[11px] pl-4 pr-12 text-[15px] text-bambi-text placeholder:text-bambi-text-secondary focus:border-bambi-primary focus:outline-none focus:ring-2 focus:ring-bambi-primary/20"
            aria-label="Message input"
          />
          <button
            type="button"
            disabled={disabled || uploading}
            aria-label="Emoji"
            title="Insert emoji"
            className="absolute bottom-1 right-1.5 flex h-9 w-9 items-center justify-center rounded-full text-bambi-text-secondary hover:text-bambi-primary disabled:opacity-50"
            onClick={() => { setEmojiOpen((v) => !v); setAttachOpen(false); }}
          >
            <Smile className="h-5 w-5" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          className="send-message-button flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bambi-primary text-white transition hover:bg-bambi-primary-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-[18px] w-[18px]" />}
        </button>
      </div>
    </div>
  );
}
