import { useMemo, useState } from 'react';
import {
  Bell,
  BellRing,
  CalendarClock,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ExternalLink,
  LogOut,
  MessageCircle,
  Search,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  Appointment,
  AppointmentStatus,
  STUDIO_CONTACT,
} from '../types/studio';
import { BOOTSTRAP_ADMIN_EMAIL } from '../lib/firebase';
import {
  buildClientWhatsAppUrl,
  formatCurrencyBRL,
  formatDateToBR,
  formatMinutesToTime,
  getAvailableTimeSlotsForReschedule,
  getDayOfWeekFromDateString,
  parseTimeToMinutes,
} from '../utils/scheduling';
import { NotificationPermissionState } from '../utils/reminders';
import { GoogleSignInButton } from './GoogleSignInButton';
import { ConfirmDialog } from './ConfirmDialog';

interface AdminPanelProps {
  user: User | null;
  isAdmin: boolean;
  cloudSynced: boolean;
  hasCalendarAccess: boolean;
  appointments: Appointment[];
  unreadBookingsCount: number;
  notificationPermission: NotificationPermissionState;
  pushEnabled: boolean;
  onSignIn: () => Promise<boolean>;
  onRescheduleAppointment: (
    id: string,
    newDate: string,
    newStartTime: string,
    notes?: string,
    syncCalendar?: boolean
  ) => Promise<{ calendarUpdated: boolean; calendarError?: string }>;
  onUpdateStatus: (
    id: string,
    status: AppointmentStatus,
    removeCalendarEvent?: boolean
  ) => Promise<void>;
  onDeleteAppointment: (id: string, removeCalendarEvent?: boolean) => Promise<void>;
  onMarkOwnerSeen: (id: string) => Promise<void>;
  onMarkAllOwnerSeen: () => Promise<void>;
  onEnablePushNotifications: () => Promise<NotificationPermissionState>;
  onTriggerTestOwnerNotification: () => void;
  adminUsername: string | null;
  onLogoutPanel: () => Promise<void>;
}

type AdminStatusFilter = 'all' | 'active' | 'completed' | 'cancelled';

const STATUS_META: Record<AppointmentStatus, { label: string; textClass: string }> = {
  confirmed: { label: 'Confirmado', textClass: 'text-[#15803D]' },
  pending: { label: 'Pendente', textClass: 'text-[#B45309]' },
  completed: { label: 'Concluído', textClass: 'text-[#3B492D]' },
  cancelled: { label: 'Desmarcado', textClass: 'text-[#B91C1C]' },
};

export function AdminPanel({
  user,
  isAdmin,
  cloudSynced,
  hasCalendarAccess,
  appointments,
  unreadBookingsCount,
  notificationPermission,
  pushEnabled,
  onSignIn,
  onRescheduleAppointment,
  onUpdateStatus,
  onDeleteAppointment,
  onMarkOwnerSeen,
  onMarkAllOwnerSeen,
  onEnablePushNotifications,
  onTriggerTestOwnerNotification,
  adminUsername,
  onLogoutPanel,
}: AdminPanelProps) {
  const [statusFilter, setStatusFilter] = useState<AdminStatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Modal state for Reschedule, Cancel (Desmarcar), Delete (Excluir)
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleNotes, setRescheduleNotes] = useState('');
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Appointment | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionBanner, setActionBanner] = useState<string | null>(null);

  const unreadAppointments = useMemo(
    () =>
      appointments
        .filter((a) => !a.ownerSeen && a.status !== 'cancelled')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [appointments]
  );

  const metrics = useMemo(() => {
    const active = appointments.filter(
      (a) => a.status === 'confirmed' || a.status === 'pending'
    ).length;
    const synced = appointments.filter((a) => a.calendarSynced).length;
    return {
      total: appointments.length,
      active,
      unread: unreadBookingsCount,
      synced,
    };
  }, [appointments, unreadBookingsCount]);

  const filteredAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, '');

    return appointments
      .filter((appt) => {
        if (statusFilter === 'active') {
          return appt.status === 'confirmed' || appt.status === 'pending';
        }
        if (statusFilter === 'completed') return appt.status === 'completed';
        if (statusFilter === 'cancelled') return appt.status === 'cancelled';
        return true;
      })
      .filter((appt) => {
        if (!dateFilter) return true;
        return appt.date === dateFilter;
      })
      .filter((appt) => {
        if (!q) return true;
        const cpfDigits = appt.clientCpf.replace(/\D/g, '');
        const phoneDigits = appt.clientPhone.replace(/\D/g, '');
        return (
          appt.clientName.toLowerCase().includes(q) ||
          appt.clientCpf.toLowerCase().includes(q) ||
          appt.clientPhone.toLowerCase().includes(q) ||
          appt.serviceName.toLowerCase().includes(q) ||
          appt.date.includes(q) ||
          formatDateToBR(appt.date).includes(q) ||
          (qDigits.length >= 3 && (cpfDigits.includes(qDigits) || phoneDigits.includes(qDigits)))
        );
      })
      .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
  }, [appointments, statusFilter, searchQuery, dateFilter]);

  const rescheduleSlots = useMemo(() => {
    if (!rescheduleTarget || !rescheduleDate) return [];
    return getAvailableTimeSlotsForReschedule(
      rescheduleDate,
      rescheduleTarget.durationMinutes,
      appointments,
      rescheduleTarget.id
    );
  }, [rescheduleTarget, rescheduleDate, appointments]);

  const openRescheduleModal = (appt: Appointment) => {
    setRescheduleTarget(appt);
    setRescheduleDate(appt.date);
    setRescheduleTime(appt.startTime);
    setRescheduleNotes(appt.notes);
    setRescheduleError(null);
  };

  const handleConfirmReschedule = async () => {
    if (!rescheduleTarget) return;
    if (!rescheduleDate) {
      setRescheduleError('Selecione a nova data do atendimento.');
      return;
    }
    if (getDayOfWeekFromDateString(rescheduleDate) === 0) {
      setRescheduleError('O estúdio não realiza atendimentos aos domingos.');
      return;
    }
    const chosenSlot = rescheduleSlots.find((s) => s.time === rescheduleTime);
    if (!chosenSlot || !chosenSlot.available) {
      setRescheduleError('Selecione um horário disponível para a nova data.');
      return;
    }

    setRescheduleBusy(true);
    setRescheduleError(null);
    try {
      const shouldSyncCalendar = Boolean(
        hasCalendarAccess && rescheduleTarget.googleCalendarEventId
      );
      const outcome = await onRescheduleAppointment(
        rescheduleTarget.id,
        rescheduleDate,
        rescheduleTime,
        rescheduleNotes,
        shouldSyncCalendar
      );
      if (!rescheduleTarget.ownerSeen) {
        await onMarkOwnerSeen(rescheduleTarget.id);
      }
      setActionBanner(
        `Agendamento de ${rescheduleTarget.clientName} reagendado para ${formatDateToBR(
          rescheduleDate
        )} às ${rescheduleTime}.${
          outcome.calendarUpdated ? ' Evento atualizado no Google Agenda.' : ''
        }`
      );
      setRescheduleTarget(null);
    } finally {
      setRescheduleBusy(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    setActionBusy(true);
    try {
      const shouldRemoveCal = Boolean(
        hasCalendarAccess && cancelTarget.googleCalendarEventId
      );
      await onUpdateStatus(cancelTarget.id, 'cancelled', shouldRemoveCal);
      if (!cancelTarget.ownerSeen) {
        await onMarkOwnerSeen(cancelTarget.id);
      }
      setActionBanner(
        `Agendamento de ${cancelTarget.clientName} (${formatDateToBR(cancelTarget.date)} às ${
          cancelTarget.startTime
        }) foi desmarcado e o horário voltou a ficar livre.`
      );
      setCancelTarget(null);
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setActionBusy(true);
    try {
      const shouldRemoveCal = Boolean(
        hasCalendarAccess && deleteTarget.googleCalendarEventId
      );
      await onDeleteAppointment(deleteTarget.id, shouldRemoveCal);
      setActionBanner(
        `Agendamento de ${deleteTarget.clientName} excluído permanentemente do painel.`
      );
      setDeleteTarget(null);
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <section aria-labelledby="painel-heading" className="py-8 sm:py-10 space-y-7">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-[#E5E2D9] pb-6">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#596649]">
            Gestão do Estúdio · {STUDIO_CONTACT.professionalName}
          </p>
          <h1
            id="painel-heading"
            className="font-display text-3xl sm:text-4xl font-semibold text-[#22261E] tracking-tight mt-1"
          >
            Painel de Agendamentos
          </h1>
          <p className="text-sm sm:text-base text-[#64695E] mt-1.5">
            Receba todas as solicitações com Nome, CPF, WhatsApp, procedimento, data e horário.
            Reagende, desmarque ou exclua compromissos com atualização imediata da grade.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onTriggerTestOwnerNotification}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-[#22261E] bg-white border border-[#D8D5CA] rounded-lg hover:bg-[#EFECE4] transition-colors whitespace-nowrap shrink-0"
          >
            <BellRing className="w-3.5 h-3.5 text-[#596649]" aria-hidden="true" />
            <span>Testar Notificação</span>
          </button>

          {notificationPermission !== 'granted' && (
            <button
              type="button"
              onClick={() => void onEnablePushNotifications()}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-[#F8F7F3] bg-[#3B492D] rounded-lg hover:bg-[#4A5A38] transition-colors whitespace-nowrap shrink-0"
            >
              <Bell className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Ativar Alertas Push</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void onLogoutPanel()}
            aria-label={`Sair do painel (${adminUsername ?? 'Administradora'})`}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-[#B91C1C] bg-white border border-[#FECACA] rounded-lg hover:bg-[#FEF2F2] transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sair do Painel{adminUsername ? ` (${adminUsername})` : ''}</span>
          </button>
        </div>
      </div>

      {/* Owner Access & Cloud Status Bar */}
      <div className="bg-white border border-[#E5E2D9] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-[#22261E]">
            {isAdmin
              ? `Painel administrativo conectado (${user?.email})`
              : user
              ? `Conectada como ${user.email}`
              : 'Modo de visualização local — conecte sua conta do estúdio para receber agendamentos em nuvem'}
          </p>
          <p className="text-xs text-[#64695E]">
            {isAdmin
              ? 'Todos os agendamentos enviados pelas clientes aparecem aqui em tempo real com notificação imediata.'
              : user
              ? `Para visualizar e administrar agendamentos de todas as clientes na nuvem, entre com a conta administradora (${BOOTSTRAP_ADMIN_EMAIL}).`
              : `Entre com sua conta Google administradora (${BOOTSTRAP_ADMIN_EMAIL}) para receber todos os agendamentos das clientes sincronizados na nuvem.`}
          </p>
        </div>

        {!isAdmin && (
          <GoogleSignInButton
            onClick={() => void onSignIn()}
            label={user ? 'Trocar para conta do estúdio' : 'Entrar com Google (Estúdio)'}
            size="sm"
          />
        )}
      </div>

      {/* Feedback Banner */}
      {actionBanner && (
        <div
          role="status"
          className="flex items-center justify-between gap-4 bg-[#F0FDF4] border border-[#BBF7D0] text-[#166534] rounded-xl px-4 py-3 text-xs font-medium"
        >
          <span>{actionBanner}</span>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            aria-label="Fechar aviso"
            className="text-[#166534] hover:opacity-75 shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Compact Editorial Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E5E2D9] rounded-xl p-4 sm:p-5">
          <p className="text-xs text-[#64695E]">Total no Painel</p>
          <p className="font-display text-3xl font-semibold text-[#22261E] mt-1 tabular-nums">
            {metrics.total}
          </p>
        </div>
        <div className="bg-white border border-[#E5E2D9] rounded-xl p-4 sm:p-5">
          <p className="text-xs text-[#64695E]">Horários Ativos</p>
          <p className="font-display text-3xl font-semibold text-[#3B492D] mt-1 tabular-nums">
            {metrics.active}
          </p>
        </div>
        <div className="bg-white border border-[#E5E2D9] rounded-xl p-4 sm:p-5">
          <p className="text-xs text-[#64695E]">Novos Não Lidos</p>
          <p
            data-testid="admin-unread-count"
            className="font-display text-3xl font-semibold text-[#B45309] mt-1 tabular-nums"
          >
            {metrics.unread}
          </p>
        </div>
        <div className="bg-white border border-[#E5E2D9] rounded-xl p-4 sm:p-5">
          <p className="text-xs text-[#64695E]">No Google Agenda</p>
          <p className="font-display text-3xl font-semibold text-[#15803D] mt-1 tabular-nums">
            {metrics.synced}
          </p>
        </div>
      </div>

      {/* Real-Time New-Booking Notifications Inbox */}
      <div
        data-testid="owner-notifications-inbox"
        className="bg-white border border-[#D2D6C8] rounded-xl p-5 sm:p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold text-[#22261E] flex items-center gap-2">
              <BellRing className="w-5 h-5 text-[#596649]" aria-hidden="true" />
              <span>Notificações de Novos Agendamentos</span>
            </h2>
            <p className="text-xs text-[#64695E] mt-1">
              Alertas no navegador:{' '}
              <span className="font-medium text-[#22261E]">
                {notificationPermission === 'granted' && pushEnabled
                  ? 'Ativos em tempo real'
                  : 'Alerta interno ativo (clique em "Ativar Alertas Push" para notificações do sistema)'}
              </span>
              {cloudSynced ? ' · Sincronização na nuvem ativa' : ''}
            </p>
          </div>

          {unreadAppointments.length > 0 && (
            <button
              type="button"
              onClick={() => void onMarkAllOwnerSeen()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#3B492D] bg-[#F8F7F3] border border-[#D8D5CA] rounded-lg hover:bg-[#EFECE4] transition-colors whitespace-nowrap shrink-0"
            >
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Marcar todas como lidas</span>
            </button>
          )}
        </div>

        {unreadAppointments.length === 0 ? (
          <p className="text-sm text-[#64695E] py-2">
            Todas as solicitações de agendamento já foram visualizadas. Quando uma nova cliente
            agendar, você será notificada aqui e pelo navegador.
          </p>
        ) : (
          <ul className="divide-y divide-[#ECEAE2]">
            {unreadAppointments.map((appt) => (
              <li
                key={appt.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm font-medium text-[#22261E]">
                    Novo agendamento de {appt.clientName} — {appt.serviceName}
                  </p>
                  <p className="text-xs text-[#64695E] font-mono tabular-nums">
                    Data: {formatDateToBR(appt.date)} · Horário: {appt.startTime} · CPF:{' '}
                    {appt.clientCpf} · WhatsApp: {appt.clientPhone}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void onMarkOwnerSeen(appt.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#3B492D] bg-[#F8F7F3] border border-[#D8D5CA] rounded-lg hover:bg-[#EFECE4] transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Marcar vista</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Filtrar agendamentos no painel"
          className="inline-flex items-center gap-1 p-1 bg-[#EFECE4] rounded-lg self-start"
        >
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: 'active', label: 'Ativos' },
              { id: 'completed', label: 'Concluídos' },
              { id: 'cancelled', label: 'Desmarcados' },
            ] as const
          ).map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-white text-[#22261E] shadow-xs'
                    : 'text-[#64695E] hover:text-[#22261E]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <input
            type="date"
            aria-label="Filtrar por data"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-10 px-3 text-xs font-mono tabular-nums bg-white border border-[#D8D5CA] rounded-lg text-[#22261E]"
          />
          {dateFilter && (
            <button
              type="button"
              onClick={() => setDateFilter('')}
              className="text-xs font-medium text-[#596649] hover:text-[#22261E] px-2 whitespace-nowrap"
            >
              Limpar data
            </button>
          )}
          <div className="relative w-full sm:w-72">
            <Search
              className="w-4 h-4 text-[#7D8475] absolute left-3.5 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Buscar por nome, CPF, WhatsApp ou procedimento"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Nome, CPF, WhatsApp ou serviço..."
              className="w-full h-10 pl-10 pr-3.5 text-sm bg-white border border-[#D8D5CA] rounded-lg text-[#22261E] placeholder:text-[#8C9184]"
            />
          </div>
        </div>
      </div>

      {/* Bookings Management List */}
      {filteredAppointments.length === 0 ? (
        <div className="bg-white border border-[#E5E2D9] rounded-xl p-10 text-center space-y-2">
          <p className="font-display text-2xl font-semibold text-[#22261E]">
            Nenhum agendamento encontrado
          </p>
          <p className="text-sm text-[#64695E]">
            Ajuste os filtros ou aguarde novas solicitações enviadas pelas clientes.
          </p>
        </div>
      ) : (
        <div
          data-testid="admin-appointments-list"
          className="space-y-4"
        >
          {filteredAppointments.map((appt) => {
            const endTime = formatMinutesToTime(
              parseTimeToMinutes(appt.startTime) + appt.durationMinutes
            );
            const meta = STATUS_META[appt.status];
            const isCancelled = appt.status === 'cancelled';
            const isCompleted = appt.status === 'completed';

            return (
              <article
                key={appt.id}
                data-testid={`admin-booking-card-${appt.id}`}
                className={`bg-white border rounded-xl p-5 sm:p-6 space-y-4 transition-colors ${
                  !appt.ownerSeen && !isCancelled
                    ? 'border-[#3B492D] ring-1 ring-[#3B492D]/15'
                    : 'border-[#E5E2D9]'
                }`}
              >
                {/* Row 1: Procedure + Schedule + Status */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs tabular-nums">
                      <span className={`font-semibold ${meta.textClass}`}>{meta.label}</span>
                      <span className="text-[#AEB3A8]" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono font-medium text-[#22261E]">
                        Data: {formatDateToBR(appt.date)}
                      </span>
                      <span className="text-[#AEB3A8]" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono font-medium text-[#22261E]">
                        Horário: {appt.startTime} às {endTime} ({appt.durationMinutes} min)
                      </span>
                      <span className="text-[#AEB3A8]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-[#64695E]">{formatCurrencyBRL(appt.price)}</span>
                      {!appt.ownerSeen && !isCancelled && (
                        <>
                          <span className="text-[#AEB3A8]" aria-hidden="true">
                            ·
                          </span>
                          <span className="font-semibold text-[#B45309]">Novo</span>
                        </>
                      )}
                    </div>

                    <h3 className="font-display text-2xl font-semibold text-[#22261E] leading-snug">
                      {appt.serviceName}
                    </h3>
                  </div>

                  {/* Google Calendar Sync status */}
                  <div className="flex items-center gap-2 text-xs shrink-0">
                    {appt.calendarSynced ? (
                      <span className="inline-flex items-center gap-1.5 text-[#15803D] font-medium">
                        <CalendarCheck2 className="w-4 h-4" aria-hidden="true" />
                        <span>Sincronizado no Google Agenda</span>
                      </span>
                    ) : (
                      <span className="text-[#73786C]">Google Agenda pendente</span>
                    )}
                    {appt.googleCalendarHtmlLink && (
                      <a
                        href={appt.googleCalendarHtmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[#3B492D] underline underline-offset-2 hover:text-[#4A5A38]"
                      >
                        <span>Ver evento</span>
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Row 2: Client Data Grid (Nome, CPF, WhatsApp, Observações) */}
                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-3.5 border-y border-[#F0EEE6] text-sm">
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-[#73786C]">
                      Nome da Cliente
                    </dt>
                    <dd className="font-medium text-[#22261E] mt-0.5">{appt.clientName}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-[#73786C]">
                      CPF
                    </dt>
                    <dd className="font-mono text-[#22261E] mt-0.5 tabular-nums">
                      {appt.clientCpf}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wider text-[#73786C]">
                      WhatsApp
                    </dt>
                    <dd className="mt-0.5 flex items-center gap-2">
                      <span className="font-mono text-[#22261E] tabular-nums">
                        {appt.clientPhone}
                      </span>
                      <a
                        href={buildClientWhatsAppUrl(
                          appt.clientPhone,
                          `Olá, ${appt.clientName}! Aqui é do Estúdio Claudia Rodrigues sobre seu agendamento de ${appt.serviceName} em ${formatDateToBR(
                            appt.date
                          )} às ${appt.startTime}.`
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-[#3B492D] hover:underline"
                      >
                        <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Conversar</span>
                      </a>
                    </dd>
                  </div>
                </dl>

                {appt.notes && (
                  <p className="text-xs text-[#64695E]">
                    <span className="font-medium text-[#22261E]">Observações:</span> {appt.notes}
                  </p>
                )}

                {/* Row 3: Owner Management Actions (Reagendar, Desmarcar, Excluir, Concluir) */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openRescheduleModal(appt)}
                      aria-label={`Reagendar agendamento de ${appt.clientName}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#F8F7F3] bg-[#3B492D] rounded-lg hover:bg-[#4A5A38] transition-colors whitespace-nowrap"
                    >
                      <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Reagendar</span>
                    </button>

                    {!isCancelled && !isCompleted && (
                      <button
                        type="button"
                        onClick={() => setCancelTarget(appt)}
                        aria-label={`Desmarcar agendamento de ${appt.clientName}`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#B45309] bg-white border border-[#FDE68A] rounded-lg hover:bg-[#FFFBEB] transition-colors whitespace-nowrap"
                      >
                        <XCircle className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Desmarcar</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(appt)}
                      aria-label={`Excluir agendamento de ${appt.clientName}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-[#B91C1C] bg-white border border-[#FECACA] rounded-lg hover:bg-[#FEF2F2] transition-colors whitespace-nowrap"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Excluir</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!isCancelled && !isCompleted && (
                      <button
                        type="button"
                        onClick={() => void onUpdateStatus(appt.id, 'completed')}
                        aria-label={`Concluir atendimento de ${appt.clientName}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#15803D] bg-white border border-[#BBF7D0] rounded-lg hover:bg-[#F0FDF4] transition-colors whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Concluir</span>
                      </button>
                    )}

                    {!appt.ownerSeen && !isCancelled && (
                      <button
                        type="button"
                        onClick={() => void onMarkOwnerSeen(appt.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-[#22261E] bg-[#F8F7F3] border border-[#E5E2D9] rounded-lg hover:bg-[#EFECE4] transition-colors whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5 text-[#596649]" aria-hidden="true" />
                        <span>Marcar vista</span>
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Reschedule Modal (Explicit Confirmation before mutating appointment / calendar) */}
      {rescheduleTarget && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reschedule-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1A2015]/60 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg bg-white border border-[#D8D5CA] rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-[#ECEAE2] flex items-start justify-between gap-4">
              <div>
                <h2
                  id="reschedule-modal-title"
                  className="font-display text-2xl font-semibold text-[#22261E]"
                >
                  Reagendar Horário
                </h2>
                <p className="text-xs text-[#64695E] mt-1">
                  {rescheduleTarget.clientName} · {rescheduleTarget.serviceName} (
                  {rescheduleTarget.durationMinutes} min)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleTarget(null)}
                aria-label="Fechar janela de reagendamento"
                className="w-8 h-8 rounded-lg inline-flex items-center justify-center text-[#64695E] hover:bg-[#F8F7F3]"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="bg-[#F8F7F3] border border-[#E5E2D9] rounded-xl p-3.5 text-xs space-y-1 tabular-nums">
                <p className="text-[#64695E]">
                  Horário atual:{' '}
                  <span className="font-medium text-[#22261E]">
                    {formatDateToBR(rescheduleTarget.date)} às {rescheduleTarget.startTime}
                  </span>
                </p>
                <p className="text-[#64695E]">
                  CPF: <span className="font-mono text-[#22261E]">{rescheduleTarget.clientCpf}</span> ·
                  WhatsApp:{' '}
                  <span className="font-mono text-[#22261E]">{rescheduleTarget.clientPhone}</span>
                </p>
              </div>

              <div>
                <label
                  htmlFor="reschedule-date-input"
                  className="block text-xs font-medium text-[#22261E] mb-1.5"
                >
                  Nova data
                </label>
                <input
                  id="reschedule-date-input"
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => {
                    setRescheduleDate(e.target.value);
                    setRescheduleTime('');
                    setRescheduleError(null);
                  }}
                  className="w-full h-11 px-3.5 text-sm font-mono tabular-nums bg-[#F8F7F3] border border-[#D8D5CA] rounded-lg text-[#22261E]"
                />
              </div>

              <div>
                <p className="text-xs font-medium text-[#22261E] mb-2">
                  Novo horário disponível ({rescheduleTarget.durationMinutes} min)
                </p>
                {rescheduleSlots.length === 0 ? (
                  <p className="text-xs text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-3">
                    Sem atendimento nesta data (domingos fechados). Escolha de segunda a sábado.
                  </p>
                ) : (
                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-44 overflow-y-auto pr-1">
                    {rescheduleSlots.map((slot) => {
                      const selected = rescheduleTime === slot.time;
                      return (
                        <button
                          key={slot.time}
                          type="button"
                          disabled={!slot.available}
                          onClick={() => {
                            setRescheduleTime(slot.time);
                            setRescheduleError(null);
                          }}
                          className={`h-9 rounded-lg text-xs font-mono tabular-nums border transition-colors ${
                            !slot.available
                              ? 'bg-[#F8F7F3] text-[#A4AA9E] border-[#ECEAE2] line-through cursor-not-allowed'
                              : selected
                              ? 'bg-[#3B492D] text-[#F8F7F3] border-[#3B492D] font-semibold'
                              : 'bg-white text-[#22261E] border-[#D8D5CA] hover:border-[#3B492D]'
                          }`}
                        >
                          {slot.time}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label
                  htmlFor="reschedule-notes-input"
                  className="block text-xs font-medium text-[#22261E] mb-1.5"
                >
                  Observações
                </label>
                <textarea
                  id="reschedule-notes-input"
                  rows={2}
                  maxLength={400}
                  value={rescheduleNotes}
                  onChange={(e) => setRescheduleNotes(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-[#F8F7F3] border border-[#D8D5CA] rounded-lg text-[#22261E]"
                />
              </div>

              {rescheduleError && (
                <p role="alert" className="text-xs font-medium text-[#B91C1C]">
                  {rescheduleError}
                </p>
              )}

              {hasCalendarAccess && rescheduleTarget.googleCalendarEventId && (
                <p className="text-xs text-[#596649]">
                  Ao confirmar, o evento vinculado no Google Agenda também será atualizado para a nova
                  data e horário.
                </p>
              )}
            </div>

            <div className="px-6 py-4 bg-[#F8F7F3] border-t border-[#E5E2D9] flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={rescheduleBusy}
                onClick={() => setRescheduleTarget(null)}
                className="px-4 py-2.5 text-xs font-medium text-[#22261E] bg-white border border-[#D8D5CA] rounded-lg hover:bg-[#EFECE4]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={rescheduleBusy}
                onClick={() => void handleConfirmReschedule()}
                className="px-4 py-2.5 text-xs font-medium text-[#F8F7F3] bg-[#3B492D] rounded-lg hover:bg-[#4A5A38] disabled:opacity-60"
              >
                {rescheduleBusy ? 'Salvando...' : 'Confirmar Reagendamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel (Desmarcar) Explicit Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="Desmarcar Agendamento?"
        description={
          cancelTarget && hasCalendarAccess && cancelTarget.googleCalendarEventId
            ? 'Este horário será marcado como desmarcado, liberado imediatamente para novas reservas e o evento vinculado será removido do Google Agenda.'
            : 'Este horário será marcado como desmarcado e liberado imediatamente para novas reservas.'
        }
        details={
          cancelTarget
            ? [
                { label: 'Cliente', value: cancelTarget.clientName },
                { label: 'CPF', value: cancelTarget.clientCpf },
                { label: 'Procedimento', value: cancelTarget.serviceName },
                {
                  label: 'Data e horário',
                  value: `${formatDateToBR(cancelTarget.date)} às ${cancelTarget.startTime}`,
                },
              ]
            : undefined
        }
        confirmLabel="Confirmar Desmarcação"
        cancelLabel="Manter Horário"
        tone="warning"
        busy={actionBusy}
        onConfirm={() => void handleConfirmCancel()}
        onCancel={() => setCancelTarget(null)}
      />

      {/* Delete (Excluir) Explicit Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir Agendamento Permanentemente?"
        description={
          deleteTarget && hasCalendarAccess && deleteTarget.googleCalendarEventId
            ? 'Esta ação remove definitivamente o registro do painel e exclui o evento vinculado no Google Agenda. Não pode ser desfeita.'
            : 'Esta ação remove definitivamente o registro do painel e não pode ser desfeita.'
        }
        details={
          deleteTarget
            ? [
                { label: 'Cliente', value: deleteTarget.clientName },
                { label: 'CPF', value: deleteTarget.clientCpf },
                { label: 'WhatsApp', value: deleteTarget.clientPhone },
                { label: 'Procedimento', value: deleteTarget.serviceName },
                {
                  label: 'Data e horário',
                  value: `${formatDateToBR(deleteTarget.date)} às ${deleteTarget.startTime}`,
                },
              ]
            : undefined
        }
        confirmLabel="Excluir Permanentemente"
        cancelLabel="Cancelar"
        tone="danger"
        busy={actionBusy}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
