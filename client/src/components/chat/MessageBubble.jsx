import { cn, formatMessageTime } from '@/lib/utils';
import { Check, CheckCheck, Clock, AlertCircle } from 'lucide-react';
import { AttachmentCard } from '@/features/attachments/AttachmentCard';

/**
 * Message bubble — text and/or encrypted attachment.
 * attachment: { filename, mime, size, attachmentId, fileKeyB64, fileIvB64 }
 * onDownloadAttachment: async (attachment) => Blob
 */
export function MessageBubble({
  message,
  isOwn = false,
  onDownloadAttachment,
  className,
}) {
  const {
    body,
    createdAt,
    status = 'sent',
    isDeleted,
    encrypted,
    attachment,
  } = message;

  return (
    <div className={cn('flex w-full', isOwn ? 'justify-end' : 'justify-start', className)}>
      <div
        className={cn(
          'message-bubble relative max-w-[88%] rounded-bambi-lg px-4 py-2.5 text-sm leading-6 shadow-bambi-sm sm:max-w-[72%] md:max-w-[68%]',
          isOwn
            ? 'message-bubble-own rounded-br-md bg-bambi-primary text-white'
            : 'message-bubble-peer rounded-bl-md border border-bambi-border bg-bambi-surface text-bambi-text'
        )}
      >
        {isDeleted ? (
          <p className="italic opacity-70">This message was deleted</p>
        ) : (
          <>
            {body && body !== '[attachment]' && (
              <p className="whitespace-pre-wrap break-words">{body}</p>
            )}
            {attachment && (
              <AttachmentCard
                filename={attachment.filename}
                mime={attachment.mime}
                size={attachment.size}
                isOwn={isOwn}
                onDownloadDecrypt={() => onDownloadAttachment?.(attachment)}
              />
            )}
          </>
        )}

        <div
          className={cn(
            'mt-1 flex items-center justify-end gap-1',
            isOwn ? 'text-white/70' : 'text-bambi-text-secondary'
          )}
        >
          <span className="text-caption">{formatMessageTime(createdAt)}</span>
          {encrypted && (
            <span title="End-to-end encrypted" className="opacity-70">
              🔒
            </span>
          )}
          {isOwn && <StatusIcon status={status} />}
        </div>
      </div>
    </div>
  );
}

function StatusIcon({ status }) {
  const iconClass = 'h-3.5 w-3.5';
  switch (status) {
    case 'pending':
    case 'sending':
      return <Clock className={iconClass} />;
    case 'sent':
      return <Check className={iconClass} />;
    case 'delivered':
      return <CheckCheck className={iconClass} />;
    case 'read':
      return <CheckCheck className={cn(iconClass, 'text-sky-300')} />;
    case 'failed':
      return <AlertCircle className={cn(iconClass, 'text-red-300')} />;
    default:
      return null;
  }
}
