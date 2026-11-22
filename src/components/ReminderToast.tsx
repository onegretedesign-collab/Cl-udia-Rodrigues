import { Bell, X } from 'lucide-react';

interface ReminderToastProps {
  reminder: { title: string; body: string } | null;
  onDismiss: () => void;
}

export function ReminderToast({ reminder, onDismiss }: ReminderToastProps) {
  if (!reminder) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-40 max-w-md w-[calc(100vw-2.5rem)] bg-[#242E1B] text-[#F8F7F3] border border-[#4A5A38] rounded-xl p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-[#C6CF9E] shrink-0">
          <Bell className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug">{reminder.title}</p>
          <p className="text-xs text-[#DCE3D3] mt-1 leading-relaxed">{reminder.body}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar notificação de lembrete"
          className="text-[#C6CF9E] hover:text-white p-1 rounded transition-colors shrink-0"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
