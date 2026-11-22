import { useMemo, useState } from 'react';
import {
  Bell,
  BellOff,
  CalendarCheck2,
  CalendarPlus,
  CheckCircle2,
  Download,
  ExternalLink,
  MessageCircle,
  Search,
  XCircle,
} from 'lucide-react';
import {
  Appointment,
  AppointmentStatus,
  CalendarSyncResult,
  PushReminderAlert,
  REMINDER_OPTIONS,
  ReminderLeadTime,
  STUDIO_CONTACT,
  UserPreferences,
} from '../types/studio';
import {
  buildWhatsAppBookingUrl,
  formatCurrencyBRL,
  formatDateToBR,
  formatMinutesToTime,
  parseTimeToMinutes,
} from '../utils/scheduling';
import {
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  generateBatchICSContent,
  generateICSContent,
  triggerFileDownload,
} from '../utils/calendarSync';
import { NotificationPermissionState } from '../utils/reminders';
import { ConfirmDialog } from './ConfirmDialog';

interface AgendaAndRemindersProps {
  appointments: Appointment[];
  preferences: UserPreferences;
  notificationPermission: NotificationPermissionState;
  upcomingReminders: PushReminderAlert[];
  cloudSynced: boolean;
  hasCalendarAccess: boolean;
  onUpdateStatus: (
    id: string,
    status: AppointmentStatus,
    removeCalendarEvent?: boolean
  ) => Promise<void>;
  onSyncAppointmentToGoogleCalendar: (appointment: Appointment) => Promise<CalendarSyncResult>;
  onMarkCalendarSynced: (id: string, eventId?: string, htmlLink?: string) => Promise<void>;
  onMarkWhatsAppSent: (id: string) => Promise<void>;
  onToggleAppointmentReminder: (id: string, enabled: boolean) => Promise<void>;
  onUpdatePreferences: (
    patch: Partial<Pick<UserPreferences, 'pushEnabled' | 'defaultReminderMinutes'>>
  ) => Promise<void>;
  onEnablePushNotifications: () => Promise<NotificationPermissionState>;
  onTriggerTestReminder: () => void;
  onGoToBooking: () => void;
}

type StatusFilter = 'all' | 'active' | 'completed' | 'cancelled';

const STATUS_META: Record<AppointmentStatus, { label: string; textClass: string }> = {
  confirmed: { label: 'Confirmado', textClass: 'text-[#15803D]' },
  pending: { label: 'Pendente', textClass: 'text-[#B45309]' },
  completed: { label: 'Concluído', textClass: 'text-[#5A3D2E]' },
  cancelled: { label: 'Cancelado', textClass: 'text-[#B91C1C]' },
};

export function AgendaAndReminders({
  appointments,
  preferences,
  notificationPermission,
  upcomingReminders,
  cloudSynced,
  hasCalendarAccess,
  onUpdateStatus,
  onSyncAppointmentToGoogleCalendar,
  onMarkCalendarSynced,
  onMarkWhatsAppSent,
  onToggleAppointmentReminder,
  onUpdatePreferences,
  onEnablePushNotifications,
  onTriggerTestReminder,
  onGoToBooking,
}: AgendaAndRemindersProps) {
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [batchExportFeedback, setBatchExportFeedback] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<{ id: string; message: string; isError: boolean } | null>(
    null
  );
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  const filteredAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return appointments
      .filter((appt) => {
        if (filter === 'active') {
          return appt.status === 'confirmed' || appt.status === 'pending';
        }
        if (filter === 'completed') return appt.status === 'completed';
        if (filter === 'cancelled') return appt.status === 'cancelled';
        return true;
      })
      .filter((appt) => {
        if (!q) return true;
        return (
          appt.clientName.toLowerCase().includes(q) ||
          appt.clientCpf.toLowerCase().includes(q) ||
          appt.serviceName.toLowerCase().includes(q) ||
          appt.date.includes(q)
        );
      })
      .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
  }, [appointments, filter, searchQuery]);

  const handleBatchICS = () => {
    const ics = generateBatchICSContent(appointments);
    triggerFileDownload(
      'agenda-claudia-rodrigues.ics',
      ics,
      'text/calendar;charset=utf-8'
    );
    setBatchExportFeedback(true);
    window.setTimeout(() => setBatchExportFeedback(false), 3000);
  };

  const handleSingleICS = async (appt: Appointment) => {
    const ics = generateICSContent(appt);
    triggerFileDownload(
      `claudia-rodrigues-${appt.date}-${appt.startTime.replace(':', '')}.ics`,
      ics,
      'text/calendar;charset=utf-8'
    );
    await onMarkCalendarSynced(appt.id);
  };

  const handleSyncToGoogleCalendar = async (appt: Appointment) => {
    setSyncingId(appt.id);
    setSyncNotice(null);
    try {
      const res = await onSyncAppointmentToGoogleCalendar(appt);
      if (res.synced) {
        setSyncNotice({
          id: appt.id,
          message: 'Evento sincronizado com sucesso no seu Google Agenda.',
          isError: false,
        });
      } else {
        setSyncNotice({
          id: appt.id,
          message: res.error ?? 'Não foi possível sincronizar agora.',
          isError: true,
        });
      }
    } finally {
      setSyncingId(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelBusy(true);
    try {
      const shouldRemoveCal = Boolean(
        hasCalendarAccess && cancelTarget.googleCalendarEventId
      );
      await onUpdateStatus(cancelTarget.id, 'cancelled', shouldRemoveCal);
      setCancelTarget(null);
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <section aria-labelledby="agenda-heading" className="py-8 sm:py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-[#E6DDD3] pb-6">
        <div className="max-w-xl">
          <h1
            id="agenda-heading"
            className="font-display text-3xl sm:text-4xl font-semibold text-[#261C17] tracking-tight"
          >
            Agenda, Lembretes Push e Google Agenda
          </h1>
          <p className="text-sm sm:text-base text-[#6B5B51] mt-2">
            Acompanhe seus compromissos, receba lembretes automáticos e sincronize diretamente com
            seu Google Agenda.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleBatchICS}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-[#261C17] bg-white border border-[#D8CCC0] rounded-lg hover:bg-[#F1EAE2] transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {batchExportFeedback ? 'Agenda .ics exportada!' : 'Exportar Agenda Completa (.ics)'}
            </span>
          </button>

          <button
            type="button"
            onClick={onGoToBooking}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-[#FAF7F3] bg-[#5A3D2E] rounded-lg hover:bg-[#6F4C3A] transition-colors whitespace-nowrap shrink-0"
          >
            <CalendarPlus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Novo Agendamento</span>
          </button>
        </div>
      </div>

      {/* Push Notifications & Reminder Queue Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-[#E6DDD3] rounded-xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-semibold text-[#261C17]">
                Lembretes Automáticos via Push
              </h2>
              <p className="text-xs text-[#6B5B51] mt-1">
                Permissão do navegador:{' '}
                <span className="font-medium text-[#261C17]">
                  {notificationPermission === 'granted'
                    ? 'Autorizada'
                    : notificationPermission === 'denied'
                    ? 'Bloqueada no navegador (alerta interno ativo)'
                    : 'Aguardando ativação'}
                </span>{' '}
                · Armazenamento:{' '}
                <span className="font-medium text-[#261C17]">
                  {cloudSynced ? 'Nuvem Firebase em tempo real' : 'Modo local sincronizável'}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={onTriggerTestReminder}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-[#261C17] bg-[#FAF7F3] border border-[#D8CCC0] rounded-lg hover:bg-[#F1EAE2] transition-colors whitespace-nowrap shrink-0"
            >
              <Bell className="w-3.5 h-3.5 text-[#7D5A46]" aria-hidden="true" />
              <span>Testar Lembrete Agora</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#ECE4DB]">
            <div className="flex items-center justify-between gap-3 py-1">
              <div>
                <p className="text-sm font-medium text-[#261C17]">Notificações Push</p>
                <p className="text-xs text-[#6B5B51]">Alertas antes de cada horário marcado</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.pushEnabled}
                aria-label="Alternar notificações push automáticas"
                onClick={() => {
                  if (!preferences.pushEnabled) {
                    void onEnablePushNotifications();
                  } else {
                    void onUpdatePreferences({ pushEnabled: false });
                  }
                }}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  preferences.pushEnabled
                    ? 'bg-[#5A3D2E] text-[#FAF7F3]'
                    : 'bg-[#F1EAE2] text-[#6B5B51]'
                }`}
              >
                {preferences.pushEnabled ? 'Ativado' : 'Desativado'}
              </button>
            </div>

            <div>
              <label
                htmlFor="default-reminder-select"
                className="block text-xs font-medium text-[#6B5B51] mb-1"
              >
                Antecedência padrão dos lembretes
              </label>
              <select
                id="default-reminder-select"
                value={preferences.defaultReminderMinutes}
                onChange={(e) =>
                  void onUpdatePreferences({
                    defaultReminderMinutes: Number(e.target.value) as ReminderLeadTime,
                  })
                }
                className="w-full h-10 px-3 text-sm bg-[#FAF7F3] border border-[#D8CCC0] rounded-lg text-[#261C17]"
              >
                {REMINDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Upcoming Automated Reminders Queue */}
        <div className="lg:col-span-5 bg-white border border-[#E6DDD3] rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold text-[#261C17] mb-1">
              Próximos Alertas Programados
            </h2>
            <p className="text-xs text-[#6B5B51] mb-4">
              Disparo automático baseado na antecedência configurada em cada agendamento.
            </p>

            {upcomingReminders.length === 0 ? (
              <p className="text-sm text-[#6B5B51] py-4">
                Nenhum lembrete futuro pendente no momento.
              </p>
            ) : (
              <ul className="divide-y divide-[#ECE4DB]">
                {upcomingReminders.slice(0, 3).map((rem) => (
                  <li key={rem.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#261C17] truncate">
                        {rem.serviceName}
                      </p>
                      <p className="text-xs text-[#6B5B51] truncate tabular-nums">
                        {rem.clientName} · {formatDateToBR(rem.date)} às {rem.startTime}
                      </p>
                    </div>
                    <span className="text-xs font-mono font-medium text-[#7D5A46] whitespace-nowrap shrink-0 tabular-nums">
                      {rem.countdownLabel}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Filtrar agendamentos por status"
          className="inline-flex items-center gap-1 p-1 bg-[#F1EAE2] rounded-lg self-start"
        >
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: 'active', label: 'Ativos' },
              { id: 'completed', label: 'Concluídos' },
              { id: 'cancelled', label: 'Cancelados' },
            ] as const
          ).map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilter(tab.id)}
                className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white text-[#261C17] shadow-xs'
                    : 'text-[#6B5B51] hover:text-[#261C17]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="w-4 h-4 text-[#7D6D62] absolute left-3.5 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Buscar por cliente, CPF, serviço ou data"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar cliente, CPF ou serviço..."
            className="w-full h-10 pl-10 pr-3.5 text-sm bg-white border border-[#D8CCC0] rounded-lg text-[#261C17] placeholder:text-[#A6978B]"
          />
        </div>
      </div>

      {/* Appointments List */}
      {filteredAppointments.length === 0 ? (
        <div className="bg-white border border-[#E6DDD3] rounded-xl p-10 text-center space-y-3">
          <p className="font-display text-2xl font-semibold text-[#261C17]">
            Nenhum agendamento encontrado
          </p>
          <p className="text-sm text-[#6B5B51]">
            Ajuste os filtros acima ou crie um novo agendamento para visualizar os horários.
          </p>
          <button
            type="button"
            onClick={onGoToBooking}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-[#FAF7F3] bg-[#5A3D2E] rounded-lg hover:bg-[#6F4C3A] transition-colors"
          >
            Agendar primeiro horário
          </button>
        </div>
      ) : (
        <div
          data-testid="appointments-list"
          className="bg-white border border-[#E6DDD3] rounded-xl divide-y divide-[#ECE4DB]"
        >
          {filteredAppointments.map((appt) => {
            const endTime = formatMinutesToTime(
              parseTimeToMinutes(appt.startTime) + appt.durationMinutes
            );
            const meta = STATUS_META[appt.status];
            const isTerminal = appt.status === 'completed' || appt.status === 'cancelled';

            return (
              <article
                key={appt.id}
                className="p-5 sm:p-6 space-y-4 hover:bg-[#FCF9F6] transition-colors"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[#6B5B51] tabular-nums">
                      <span className="font-mono font-medium text-[#261C17]">
                        {formatDateToBR(appt.date)} · {appt.startTime}–{endTime}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className={`font-medium ${meta.textClass}`}>{meta.label}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatCurrencyBRL(appt.price)}</span>
                      {appt.calendarSynced && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#15803D] font-medium">
                            Sincronizado no Google Agenda
                          </span>
                        </>
                      )}
                      {appt.whatsappSent && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-[#7D5A46]">Enviado ao WhatsApp</span>
                        </>
                      )}
                    </div>

                    <h3 className="font-display text-2xl font-semibold text-[#261C17] leading-snug">
                      {appt.serviceName}
                    </h3>

                    <p className="text-sm text-[#54443B] tabular-nums">
                      {appt.clientName} · CPF {appt.clientCpf} · {appt.clientPhone}
                      {appt.notes ? ` — ${appt.notes}` : ''}
                    </p>
                  </div>

                  {/* Primary status controls */}
                  {!isTerminal && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void onUpdateStatus(appt.id, 'completed')}
                        aria-label={`Concluir agendamento de ${appt.clientName}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#15803D] bg-white border border-[#BBF7D0] rounded-lg hover:bg-[#F0FDF4] transition-colors whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Concluir</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCancelTarget(appt)}
                        aria-label={`Cancelar agendamento de ${appt.clientName}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#B91C1C] bg-white border border-[#FECACA] rounded-lg hover:bg-[#FEF2F2] transition-colors whitespace-nowrap"
                      >
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Cancelar</span>
                      </button>
                    </div>
                  )}
                </div>

                {syncNotice && syncNotice.id === appt.id && (
                  <p
                    role="status"
                    className={`text-xs font-medium ${
                      syncNotice.isError ? 'text-[#B91C1C]' : 'text-[#15803D]'
                    }`}
                  >
                    {syncNotice.message}
                  </p>
                )}

                {/* Secondary Dispatch, External Calendar Sync & Reminder bar */}
                <div className="pt-3 border-t border-[#F2EBE3] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={buildWhatsAppBookingUrl(appt)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void onMarkWhatsAppSent(appt.id)}
                      aria-label={`Enviar agendamento de ${appt.clientName} para WhatsApp ${STUDIO_CONTACT.displayPhone}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#FAF7F3] bg-[#5A3D2E] rounded-lg hover:bg-[#6F4C3A] transition-colors whitespace-nowrap"
                    >
                      <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      <span className="tabular-nums">WhatsApp {STUDIO_CONTACT.displayPhone}</span>
                    </a>

                    {appt.googleCalendarHtmlLink ? (
                      <a
                        href={appt.googleCalendarHtmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg hover:bg-[#DCFCE7] transition-colors whitespace-nowrap"
                      >
                        <CalendarCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Abrir no Google Agenda</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        disabled={syncingId === appt.id}
                        onClick={() => void handleSyncToGoogleCalendar(appt)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#261C17] bg-white border border-[#D8CCC0] rounded-lg hover:bg-[#F1EAE2] disabled:opacity-60 transition-colors whitespace-nowrap"
                      >
                        <CalendarCheck2 className="w-3.5 h-3.5 text-[#5A3D2E]" aria-hidden="true" />
                        <span>
                          {syncingId === appt.id
                            ? 'Sincronizando...'
                            : 'Sincronizar Google Agenda'}
                        </span>
                      </button>
                    )}

                    <a
                      href={buildGoogleCalendarUrl(appt)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void onMarkCalendarSynced(appt.id)}
                      aria-label={`Abrir modelo no Google Calendar para ${appt.clientName}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#261C17] bg-white border border-[#D8CCC0] rounded-lg hover:bg-[#F1EAE2] transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Link Google</span>
                    </a>

                    <a
                      href={buildOutlookCalendarUrl(appt)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void onMarkCalendarSynced(appt.id)}
                      aria-label={`Adicionar agendamento de ${appt.clientName} ao Outlook`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#261C17] bg-white border border-[#D8CCC0] rounded-lg hover:bg-[#F1EAE2] transition-colors whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Outlook</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => void handleSingleICS(appt)}
                      aria-label={`Baixar arquivo .ics de ${appt.clientName}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#261C17] bg-white border border-[#D8CCC0] rounded-lg hover:bg-[#F1EAE2] transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Baixar .ics</span>
                    </button>
                  </div>

                  {!isTerminal && (
                    <button
                      type="button"
                      onClick={() =>
                        void onToggleAppointmentReminder(appt.id, !appt.reminderEnabled)
                      }
                      aria-label={
                        appt.reminderEnabled
                          ? `Desativar lembrete push de ${appt.clientName}`
                          : `Ativar lembrete push de ${appt.clientName}`
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#261C17] bg-[#FAF7F3] border border-[#E6DDD3] rounded-lg hover:bg-[#F1EAE2] transition-colors whitespace-nowrap"
                    >
                      {appt.reminderEnabled ? (
                        <Bell className="w-3.5 h-3.5 text-[#7D5A46]" aria-hidden="true" />
                      ) : (
                        <BellOff className="w-3.5 h-3.5 text-[#A6978B]" aria-hidden="true" />
                      )}
                      <span>{appt.reminderEnabled ? 'Lembrete push ativo' : 'Lembrete desativado'}</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Cancel confirmation modal (prevents silent calendar event deletion) */}
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Cancelar Agendamento?"
        description={
          cancelTarget && hasCalendarAccess && cancelTarget.googleCalendarEventId
            ? 'Este horário será cancelado, liberado na grade e o evento vinculado será removido do seu Google Agenda.'
            : 'Este horário será cancelado e liberado novamente na grade de disponibilidade.'
        }
        details={
          cancelTarget
            ? [
                { label: 'Procedimento', value: cancelTarget.serviceName },
                { label: 'Cliente', value: cancelTarget.clientName },
                {
                  label: 'Data e horário',
                  value: `${formatDateToBR(cancelTarget.date)} às ${cancelTarget.startTime}`,
                },
              ]
            : undefined
        }
        confirmLabel="Confirmar Cancelamento"
        cancelLabel="Manter Horário"
        tone="warning"
        busy={cancelBusy}
        onConfirm={() => void handleConfirmCancel()}
        onCancel={() => setCancelTarget(null)}
      />
    </section>
  );
}
