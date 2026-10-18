import { Fragment } from 'react';
import { cn, formatMessageTime } from '@/lib/utils';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import { AttachmentCard } from '@/features/attachments/AttachmentCard';

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

/** Render text with safe, clickable http(s) links. Never injects HTML. */
function renderText(text, highlight) {
  return text.split(URL_RE).map((part, i) => {
    if (i % 2 === 1) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2 [overflow-wrap:anywhere]">
          {part}
        </a>
      );
    }
    if (!highlight) return <Fragment key={i}>{part}</Fragment>;
    const lower = part.toLowerCase();
    const needle = highlight.toLowerCase();
    const out = [];
    let from = 0;
    let idx = lower.indexOf(needle, from);
    while (idx !== -1) {
      if (idx > from) out.push(part.slice(from, idx));
      out.push(<mark key={`${i}-${idx}`} className="rounded bg-yellow-300/80 px-0.5 text-black">{part.slice(idx, idx + needle.length)}</mark>);
      from = idx + needle.length;
      idx = lower.indexOf(needle, from);
    }
    out.push(part.slice(from));
    return <Fragment key={i}>{out}</Fragment>;
  });
}

/**
 * Message bubble — text and/or encrypted attachment. The time and status sit
 * inside the bubble and never overlap the text.
 */
export function MessageBubble({ message, isOwn = false, highlight = '', onDownloadAttachment, className }) {
  const { body, createdAt, status = 'sent', isDeleted, attachment } = message;
  const hasText = body && body !== '[attachment]';

  const meta = (
    <span className={cn('inline-flex items-center gap-1 text-[11px] leading-none', isOwn ? 'text-white/75' : 'text-bambi-text-secondary')}>
      {formatMessageTime(createdAt)}
      {isOwn && <StatusIcon status={status} />}
    </span>
  );

  return (
    <div className={cn('flex w-full', isOwn ? 'justify-end' : 'justify-start', className)}>
      <div
        className={cn(
          'message-bubble relative min-w-0 max-w-[88%] rounded-[20px] px-3.5 py-2 text-[15px] leading-[22px] sm:max-w-[72%] md:max-w-[65%]',
          isOwn ? 'message-bubble-own rounded-br-md text-white' : 'message-bubble-peer rounded-bl-md border text-bambi-text'
        )}
      >
        {isDeleted ? (
          <p className="italic opacity-70">This message was deleted</p>
        ) : (
          <>
            {attachment && (
              <AttachmentCard
                filename={attachment.filename}
                mime={attachment.mime}
                size={attachment.size}
                isOwn={isOwn}
                onDownloadDecrypt={() => onDownloadAttachment?.(attachment)}
              />
            )}
            {hasText && (
              <div className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {renderText(body, highlight)}
                {/* Floats to the end of the last line, or wraps below it if there is no room. */}
                <span className="float-right ml-3 mt-[7px]">{meta}</span>
              </div>
            )}
          </>
        )}
        {(!hasText || isDeleted) && <div className="mt-1 flex justify-end">{meta}</div>}
      </div>
    </div>
  );
}

function StatusIcon({ status }) {
  const iconClass = 'h-3.5 w-3.5';
  switch (status) {
    case 'pending':
    case 'sending':
      return <Clock className={iconClass} aria-label="Sending" />;
    case 'sent':
      return <Check className={iconClass} aria-label="Sent" />;
    case 'delivered':
      return <CheckCheck className={iconClass} aria-label="Delivered" />;
    case 'read':
      return <CheckCheck className={cn(iconClass, 'text-sky-300')} aria-label="Read" />;
    case 'failed':
      return <AlertCircle className={cn(iconClass, 'text-red-300')} aria-label="Failed to send" />;
    default:
      return null;
  }
}
