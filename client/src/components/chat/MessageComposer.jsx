import { useState, useRef } from 'react';
import { Paperclip, Send, Smile, Mic, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

/**
 * Message composer with optional encrypted file attach.
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
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
  const typingTimer = useRef(null);

  const handleSend = () => {
    const value = text.trim();
    if (!value || disabled || uploading) return;
    onSend?.(value);
    setText('');
    onTypingChange?.(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={cn('message-composer border-t border-bambi-border bg-bambi-surface px-3 py-3 md:px-6 md:py-4', className)}>
      {uploading && (
        <div className="mb-2">
          <div className="mb-1 flex items-center justify-between text-caption text-bambi-text-secondary">
            <span>Encrypting & uploading…</span>
            <span>{Math.round(uploadProgress)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-bambi-border">
            <div
              className="h-full rounded-full bg-bambi-primary transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-end gap-1.5">
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,video/mp4,video/webm"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onAttach?.(f);
          }}
        />
        <Button
          variant="icon"
          disabled={disabled || uploading}
          aria-label="Attach file"
          title="Attach encrypted file"
          className="shrink-0"
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
        </Button>

        <div className="relative min-w-0 flex-1">
          {emojiOpen && (
            <div className="absolute bottom-14 right-0 z-20 grid grid-cols-8 gap-1 rounded-xl border border-bambi-border bg-bambi-surface p-2 shadow-xl" role="group" aria-label="Choose an emoji">
              {['😀', '😂', '🥹', '😍', '👍', '❤️', '🎉', '🔥', '😊', '🙏', '👋', '🤝', '😎', '🤔', '💯', '✨'].map((emoji) => (
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
              const v = e.target.value;
              setText(v);
              if (onTypingChange) {
                onTypingChange(true);
                clearTimeout(typingTimer.current);
                typingTimer.current = setTimeout(() => onTypingChange(false), 1500);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || uploading}
            rows={1}
            className={cn('composer-textarea max-h-32 min-h-[46px] resize-none rounded-2xl py-3 pr-11 text-sm')}
            aria-label="Message input"
          />
          <Button
            variant="icon"
            disabled={disabled || uploading}
            aria-label="Emoji"
            title="Insert emoji"
            className="absolute bottom-1 right-1"
            onClick={() => setEmojiOpen((value) => !value)}
          >
            <Smile className="h-5 w-5" />
          </Button>
        </div>

        {text.trim() ? (
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={disabled || uploading}
            aria-label="Send message"
            className="send-message-button h-[46px] shrink-0 rounded-2xl px-3.5"
          >
            <Send className="h-5 w-5" />
          </Button>
        ) : (
          <Button variant="icon" disabled className="shrink-0" aria-label="Voice (soon)">
            <Mic className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );
}
