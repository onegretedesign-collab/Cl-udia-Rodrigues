import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  details?: { label: string; value: string }[];
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  details,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  if (!open) return null;

  const confirmClasses =
    tone === 'danger'
      ? 'bg-[#B91C1C] hover:bg-[#991B1B] text-white'
      : tone === 'warning'
      ? 'bg-[#B45309] hover:bg-[#92400E] text-white'
      : 'bg-[#3B492D] hover:bg-[#4A5A38] text-[#F8F7F3]';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A2015]/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-md bg-white border border-[#D8D5CA] rounded-2xl shadow-xl overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              {tone !== 'primary' && (
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                    tone === 'danger'
                      ? 'bg-[#FEF2F2] text-[#B91C1C]'
                      : 'bg-[#FFFBEB] text-[#B45309]'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                </div>
              )}
              <div>
                <h2
                  id="confirm-dialog-title"
                  className="font-display text-2xl font-semibold text-[#22261E] leading-tight"
                >
                  {title}
                </h2>
                <p className="text-sm text-[#64695E] mt-1.5 leading-relaxed">
                  {description}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onCancel}
              aria-label="Fechar janela de confirmação"
              className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-[#64695E] hover:bg-[#F8F7F3] shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {details && details.length > 0 && (
            <dl className="bg-[#F8F7F3] border border-[#E5E2D9] rounded-xl p-3.5 space-y-1.5 text-xs">
              {details.map((row) => (
                <div key={row.label} className="flex justify-between gap-3">
                  <dt className="text-[#64695E] shrink-0">{row.label}</dt>
                  <dd className="font-medium text-[#22261E] text-right tabular-nums">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {children}
        </div>

        <div className="px-6 py-4 bg-[#F8F7F3] border-t border-[#E5E2D9] flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-4 py-2.5 text-xs font-medium text-[#22261E] bg-white border border-[#D8D5CA] rounded-lg hover:bg-[#EFECE4] disabled:opacity-60 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`px-4 py-2.5 text-xs font-medium rounded-lg disabled:opacity-60 transition-colors ${confirmClasses}`}
          >
            {busy ? 'Processando...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
