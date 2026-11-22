import React, { useMemo, useState } from 'react';
import {
  Bell,
  Calendar as CalendarIcon,
  CalendarCheck2,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import {
  Appointment,
  BookingFormInput,
  CalendarSyncResult,
  REMINDER_OPTIONS,
  ReminderLeadTime,
  STUDIO_CONTACT,
  STUDIO_SERVICES,
  ServiceId,
  getServiceById,
} from '../types/studio';
import { CreateAppointmentOutcome } from '../hooks/useStudioCloud';
import {
  buildWhatsAppBookingUrl,
  formatCPF,
  formatCurrencyBRL,
  formatDateToBR,
  formatMinutesToTime,
  formatPhoneBR,
  formatWhatsAppMessage,
  getAvailableTimeSlots,
  getDayOfWeekFromDateString,
  getNextBookableDateISO,
  parseTimeToMinutes,
  validateBookingInput,
} from '../utils/scheduling';
import {
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  generateICSContent,
  triggerFileDownload,
} from '../utils/calendarSync';
import { GoogleSignInButton } from './GoogleSignInButton';

interface BookingWorkspaceProps {
  appointments: Appointment[];
  initialServiceId: ServiceId;
  defaultReminderMinutes: ReminderLeadTime;
  pushEnabled: boolean;
  hasCalendarAccess: boolean;
  userEmail: string | null;
  onSignIn: () => Promise<boolean>;
  onCreateAppointment: (input: BookingFormInput) => Promise<CreateAppointmentOutcome>;
  onSyncAppointmentToGoogleCalendar: (appointment: Appointment) => Promise<CalendarSyncResult>;
  onMarkCalendarSynced: (id: string, eventId?: string, htmlLink?: string) => Promise<void>;
  onMarkWhatsAppSent: (id: string) => Promise<void>;
  onNavigateToAgenda: () => void;
}

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export function BookingWorkspace({
  appointments,
  initialServiceId,
  defaultReminderMinutes,
  pushEnabled,
  hasCalendarAccess,
  userEmail,
  onSignIn,
  onCreateAppointment,
  onSyncAppointmentToGoogleCalendar,
  onMarkCalendarSynced,
  onMarkWhatsAppSent,
  onNavigateToAgenda,
}: BookingWorkspaceProps) {
  const initialDate = useMemo(() => getNextBookableDateISO(), []);
  const [selectedServiceId, setSelectedServiceId] = useState<ServiceId>(initialServiceId);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [calendarMonth, setCalendarMonth] = useState<{ year: number; month: number }>(() => {
    const [y, m] = initialDate.split('-').map(Number);
    return { year: y, month: m - 1 };
  });
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [clientName, setClientName] = useState('');
  const [clientCpf, setClientCpf] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [reminderEnabled, setReminderEnabled] = useState(pushEnabled);
  const [reminderMinutesBefore, setReminderMinutesBefore] =
    useState<ReminderLeadTime>(defaultReminderMinutes);
  const [errors, setErrors] = useState<Partial<Record<keyof BookingFormInput, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmedAppt, setConfirmedAppt] = useState<Appointment | null>(null);
  const [calendarSyncFeedback, setCalendarSyncFeedback] = useState<CalendarSyncResult | null>(
    null
  );
  const [syncingNow, setSyncingNow] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  // Sync external service selection from HeroAndServices
  React.useEffect(() => {
    setSelectedServiceId(initialServiceId);
    setSelectedTime('');
  }, [initialServiceId]);

  const activeService = useMemo(
    () => getServiceById(selectedServiceId),
    [selectedServiceId]
  );

  const slots = useMemo(
    () => getAvailableTimeSlots(selectedDate, activeService.durationMinutes, appointments),
    [selectedDate, activeService.durationMinutes, appointments]
  );

  const slotsByPeriod = useMemo(() => {
    return {
      manha: slots.filter((s) => s.period === 'manha'),
      tarde: slots.filter((s) => s.period === 'tarde'),
      noite: slots.filter((s) => s.period === 'noite'),
    };
  }, [slots]);

  const availableCount = useMemo(() => slots.filter((s) => s.available).length, [slots]);

  // Build calendar cells for current month
  const calendarDays = useMemo(() => {
    const { year, month } = calendarMonth;
    const firstDayWeekday = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: ({ dateIso: string; day: number; isSunday: boolean; bookingsCount: number } | null)[] = [];

    for (let i = 0; i < firstDayWeekday; i++) {
      cells.push(null);
    }

    for (let day = 1; day <= totalDays; day++) {
      const dateIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(
        2,
        '0'
      )}`;
      const isSunday = getDayOfWeekFromDateString(dateIso) === 0;
      const bookingsCount = appointments.filter(
        (a) => a.date === dateIso && a.status !== 'cancelled'
      ).length;
      cells.push({ dateIso, day, isSunday, bookingsCount });
    }

    return cells;
  }, [calendarMonth, appointments]);

  const shiftMonth = (delta: number) => {
    setCalendarMonth((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: BookingFormInput = {
      clientName,
      clientCpf,
      clientPhone,
      serviceId: selectedServiceId,
      date: selectedDate,
      startTime: selectedTime,
      notes,
      reminderMinutesBefore,
      reminderEnabled,
    };

    const validation = validateBookingInput(input);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }

    // Verify slot is still free
    const chosenSlot = slots.find((s) => s.time === selectedTime);
    if (!chosenSlot || !chosenSlot.available) {
      setErrors({ startTime: 'Este horário não está mais disponível. Escolha outro horário livre.' });
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      const outcome = await onCreateAppointment(input);
      setConfirmedAppt(outcome.appointment);
      setCalendarSyncFeedback(outcome.calendarSync);
      setSelectedTime('');
      setClientName('');
      setClientCpf('');
      setClientPhone('');
      setNotes('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSyncConfirmedToGoogleCalendar = async () => {
    if (!confirmedAppt) return;
    setSyncingNow(true);
    try {
      const result = await onSyncAppointmentToGoogleCalendar(confirmedAppt);
      setCalendarSyncFeedback(result);
      if (result.synced) {
        setConfirmedAppt((prev) =>
          prev
            ? {
                ...prev,
                calendarSynced: true,
                googleCalendarEventId: result.eventId ?? prev.googleCalendarEventId,
                googleCalendarHtmlLink: result.htmlLink ?? prev.googleCalendarHtmlLink,
              }
            : prev
        );
      }
    } finally {
      setSyncingNow(false);
    }
  };

  const handleDownloadICS = async (appt: Appointment) => {
    const ics = generateICSContent(appt);
    triggerFileDownload(
      `agendamento-claudia-rodrigues-${appt.date}-${appt.startTime.replace(':', '')}.ics`,
      ics,
      'text/calendar;charset=utf-8'
    );
    await onMarkCalendarSynced(appt.id);
    setConfirmedAppt((prev) => (prev && prev.id === appt.id ? { ...prev, calendarSynced: true } : prev));
  };

  const handleCopyWhatsAppText = async (appt: Appointment) => {
    try {
      await navigator.clipboard.writeText(formatWhatsAppMessage(appt));
      setCopiedMessage(true);
      window.setTimeout(() => setCopiedMessage(false), 2500);
    } catch {
      // Fallback ignored if clipboard denied
    }
  };

  return (
    <section aria-labelledby="agendar-heading" className="py-6 sm:py-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E6DDD3] pb-5">
        <div className="max-w-2xl">
          <h1
            id="agendar-heading"
            className="font-display text-3xl sm:text-4xl font-semibold text-[#261C17] tracking-tight"
          >
            Agendar Horário
          </h1>
          <p className="text-sm sm:text-base text-[#6B5B51] mt-1.5">
            Escolha o procedimento, selecione data e horário livres e sincronize automaticamente com
            o seu Google Agenda.
          </p>
        </div>
        <p className="text-xs text-[#6B5B51] tabular-nums whitespace-nowrap shrink-0">
          {formatDateToBR(selectedDate)} · {availableCount} horários livres
        </p>
      </div>

      {/* Step 1: Service selector bar */}
      <div>
        <p className="text-xs font-medium text-[#6B5B51] mb-2.5">1. Escolha o procedimento</p>
        <div
          role="radiogroup"
          aria-label="Procedimentos disponíveis"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
        >
          {STUDIO_SERVICES.map((svc) => {
            const isSelected = svc.id === selectedServiceId;
            return (
              <button
                key={svc.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => {
                  setSelectedServiceId(svc.id);
                  setSelectedTime('');
                  setErrors((prev) => ({ ...prev, startTime: undefined }));
                }}
                className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                  isSelected
                    ? 'bg-[#5A3D2E] text-[#FAF7F3] border-[#5A3D2E]'
                    : 'bg-white text-[#261C17] border-[#E6DDD3] hover:border-[#A8846D]'
                }`}
              >
                <p className="font-medium text-sm leading-snug">{svc.shortName}</p>
                <p
                  className={`text-xs mt-1 tabular-nums ${
                    isSelected ? 'text-[#E5D7C8]' : 'text-[#6B5B51]'
                  }`}
                >
                  {svc.durationMinutes} min · {formatCurrencyBRL(svc.price)}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main 2-Column Interactive Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Calendar + Visual Time Slot Matrix */}
        <div className="lg:col-span-7 space-y-5">
          {/* Interactive Month Calendar */}
          <div className="bg-white border border-[#E6DDD3] rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3.5">
              <div>
                <p className="text-xs font-medium text-[#6B5B51]">2. Selecione a data</p>
                <h2 className="font-display text-2xl font-semibold text-[#261C17] leading-tight mt-0.5">
                  {MONTHS_PT[calendarMonth.month]} {calendarMonth.year}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  aria-label="Mês anterior"
                  className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-[#E6DDD3] text-[#261C17] hover:bg-[#FAF7F3] transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  aria-label="Próximo mês"
                  className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-[#E6DDD3] text-[#261C17] hover:bg-[#FAF7F3] transition-colors"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
              {WEEKDAYS_PT.map((dayName) => (
                <div key={dayName} className="text-xs font-medium text-[#6B5B51] py-0.5">
                  {dayName}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((cell, idx) => {
                if (!cell) {
                  return <div key={`empty-${idx}`} className="h-9" aria-hidden="true" />;
                }
                const isSelected = cell.dateIso === selectedDate;
                return (
                  <button
                    key={cell.dateIso}
                    type="button"
                    disabled={cell.isSunday}
                    aria-label={`${cell.day} de ${MONTHS_PT[calendarMonth.month]}${
                      cell.isSunday ? ' — Estúdio fechado' : ''
                    }${cell.bookingsCount > 0 ? ` — ${cell.bookingsCount} agendados` : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedDate(cell.dateIso);
                      setSelectedTime('');
                      setErrors((prev) => ({ ...prev, date: undefined, startTime: undefined }));
                    }}
                    className={`h-9 rounded-lg flex flex-col items-center justify-center text-xs tabular-nums transition-colors ${
                      cell.isSunday
                        ? 'text-[#A6978B] bg-[#FAF7F3] cursor-not-allowed'
                        : isSelected
                        ? 'bg-[#5A3D2E] text-[#FAF7F3] font-semibold'
                        : 'text-[#261C17] hover:bg-[#F1EAE2] border border-transparent hover:border-[#CEBFB0]'
                    }`}
                  >
                    <span className="leading-none">{cell.day}</span>
                    {!cell.isSunday && cell.bookingsCount > 0 && (
                      <span
                        className={`text-[9px] leading-none mt-0.5 ${
                          isSelected ? 'text-[#E5D7C8]' : 'text-[#7D5A46]'
                        }`}
                      >
                        {cell.bookingsCount} ag.
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Visual Time Slot Matrix */}
          <div className="bg-white border border-[#E6DDD3] rounded-xl p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-5">
              <div>
                <p className="text-xs font-medium text-[#6B5B51]">
                  3. Horários disponíveis para {formatDateToBR(selectedDate)}
                </p>
                <p className="text-xs text-[#7D6D62] mt-1">
                  Duração reservada: {activeService.durationMinutes} minutos · Conflitos bloqueados
                  automaticamente
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-[#6B5B51]">
                <span>Disponível</span>
                <span aria-hidden="true">·</span>
                <span className="line-through text-[#A6978B]">Ocupado</span>
              </div>
            </div>

            {slots.length === 0 ? (
              <div className="py-10 text-center bg-[#FAF7F3] rounded-lg border border-[#E6DDD3]">
                <p className="text-sm font-medium text-[#261C17]">
                  Sem atendimento nesta data
                </p>
                <p className="text-xs text-[#6B5B51] mt-1">
                  O estúdio atende de segunda a sábado. Selecione outro dia no calendário.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {(
                  [
                    { key: 'manha', label: 'Manhã', items: slotsByPeriod.manha },
                    { key: 'tarde', label: 'Tarde', items: slotsByPeriod.tarde },
                    { key: 'noite', label: 'Final do dia', items: slotsByPeriod.noite },
                  ] as const
                )
                  .filter((group) => group.items.length > 0)
                  .map((group) => (
                    <div key={group.key}>
                      <h3 className="text-xs font-medium text-[#6B5B51] mb-2.5">{group.label}</h3>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                        {group.items.map((slot) => {
                          const isSelected = selectedTime === slot.time;
                          return (
                            <button
                              key={slot.time}
                              type="button"
                              disabled={!slot.available}
                              aria-label={
                                slot.available
                                  ? `Horário ${slot.time} disponível`
                                  : `Horário ${slot.time} ocupado`
                              }
                              aria-pressed={isSelected}
                              onClick={() => {
                                setSelectedTime(slot.time);
                                setErrors((prev) => ({ ...prev, startTime: undefined }));
                              }}
                              className={`min-h-[44px] px-3 py-2 rounded-lg text-sm font-mono tabular-nums transition-colors border ${
                                !slot.available
                                  ? 'bg-[#FAF7F3] text-[#A6978B] border-[#ECE4DB] line-through cursor-not-allowed'
                                  : isSelected
                                  ? 'bg-[#5A3D2E] text-[#FAF7F3] border-[#5A3D2E] font-medium'
                                  : 'bg-white text-[#261C17] border-[#D8CCC0] hover:border-[#5A3D2E] hover:bg-[#FAF7F3]'
                              }`}
                            >
                              {slot.time}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {errors.startTime && (
              <p role="alert" className="text-xs font-medium text-[#B91C1C] mt-4">
                {errors.startTime}
              </p>
            )}
          </div>
        </div>

        {/* Right 5 Columns: Booking Form OR Post-Booking Confirmation & Dispatch */}
        <div className="lg:col-span-5">
          {confirmedAppt ? (
            <div
              data-testid="booking-confirmation"
              className="bg-white border border-[#CEBFB0] rounded-xl p-6 space-y-6"
            >
              <div>
                <p className="text-xs font-medium text-[#15803D] flex items-center gap-1.5">
                  <Check className="w-4 h-4" aria-hidden="true" />
                  <span>Agendamento enviado para o painel do estúdio</span>
                </p>
                <h2 className="font-display text-3xl font-semibold text-[#261C17] mt-1">
                  Horário reservado
                </h2>
                <p className="text-sm text-[#6B5B51] mt-1">
                  {STUDIO_CONTACT.professionalName} já recebeu seus dados no painel de gestão.
                </p>
              </div>

              <div className="py-4 border-y border-[#ECE4DB] space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5B51]">Procedimento</span>
                  <span className="font-medium text-[#261C17] text-right">
                    {confirmedAppt.serviceName}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5B51]">Data e horário</span>
                  <span className="font-mono text-[#261C17] tabular-nums">
                    {formatDateToBR(confirmedAppt.date)} · {confirmedAppt.startTime}–
                    {formatMinutesToTime(
                      parseTimeToMinutes(confirmedAppt.startTime) + confirmedAppt.durationMinutes
                    )}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5B51]">Cliente</span>
                  <span className="text-[#261C17]">{confirmedAppt.clientName}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5B51]">CPF</span>
                  <span className="font-mono text-[#261C17] tabular-nums">
                    {confirmedAppt.clientCpf}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5B51]">WhatsApp</span>
                  <span className="font-mono text-[#261C17] tabular-nums">
                    {confirmedAppt.clientPhone}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5B51]">Valor estimado</span>
                  <span className="font-medium text-[#261C17] tabular-nums">
                    {formatCurrencyBRL(confirmedAppt.price)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#6B5B51]">Lembrete push</span>
                  <span className="text-[#261C17]">
                    {confirmedAppt.reminderEnabled
                      ? REMINDER_OPTIONS.find((r) => r.value === confirmedAppt.reminderMinutesBefore)
                          ?.label ?? `${confirmedAppt.reminderMinutesBefore} min antes`
                      : 'Desativado'}
                  </span>
                </div>
              </div>

              {/* Automatic Google Calendar Sync Status & 1-Click Action */}
              <div className="rounded-xl bg-[#FAF7F3] border border-[#E6DDD3] p-4 space-y-3">
                <p className="text-xs font-medium text-[#261C17] flex items-center gap-1.5">
                  <CalendarCheck2 className="w-4 h-4 text-[#5A3D2E]" aria-hidden="true" />
                  <span>Google Agenda da Cliente</span>
                </p>

                {confirmedAppt.calendarSynced && confirmedAppt.googleCalendarEventId ? (
                  <div className="space-y-2">
                    <p className="text-xs text-[#15803D] font-medium">
                      Sincronizado automaticamente no seu Google Agenda com lembrete programado.
                    </p>
                    {confirmedAppt.googleCalendarHtmlLink && (
                      <a
                        href={confirmedAppt.googleCalendarHtmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5A3D2E] underline underline-offset-4 hover:text-[#6F4C3A]"
                      >
                        <span>Abrir evento no Google Agenda</span>
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <p className="text-xs text-[#6B5B51] leading-relaxed">
                      Conecte sua conta Google para salvar este horário automaticamente no seu
                      Google Agenda agora mesmo.
                    </p>
                    <GoogleSignInButton
                      onClick={() => void handleSyncConfirmedToGoogleCalendar()}
                      disabled={syncingNow}
                      label={
                        syncingNow
                          ? 'Sincronizando com Google Agenda...'
                          : 'Salvar no meu Google Agenda'
                      }
                      size="sm"
                      fullWidth
                    />
                    {calendarSyncFeedback?.error && (
                      <p role="alert" className="text-xs text-[#B91C1C]">
                        {calendarSyncFeedback.error}
                      </p>
                    )}
                  </div>
                )}

                {/* Secondary manual calendar exports */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-[#E6DDD3]">
                  <a
                    href={buildGoogleCalendarUrl(confirmedAppt)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      void onMarkCalendarSynced(confirmedAppt.id);
                      setConfirmedAppt((prev) => (prev ? { ...prev, calendarSynced: true } : prev));
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[#261C17] bg-white border border-[#D8CCC0] rounded-lg hover:bg-[#F1EAE2] transition-colors whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Link Google</span>
                  </a>
                  <a
                    href={buildOutlookCalendarUrl(confirmedAppt)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => {
                      void onMarkCalendarSynced(confirmedAppt.id);
                      setConfirmedAppt((prev) => (prev ? { ...prev, calendarSynced: true } : prev));
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[#261C17] bg-white border border-[#D8CCC0] rounded-lg hover:bg-[#F1EAE2] transition-colors whitespace-nowrap"
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Outlook</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleDownloadICS(confirmedAppt)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-[#261C17] bg-white border border-[#D8CCC0] rounded-lg hover:bg-[#F1EAE2] transition-colors whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Baixar .ics</span>
                  </button>
                </div>
              </div>

              {/* Direct WhatsApp dispatch to (64) 98448-0910 */}
              <div className="space-y-2.5">
                <p className="text-xs font-medium text-[#6B5B51]">
                  Confirmar também no WhatsApp oficial
                </p>
                <a
                  href={buildWhatsAppBookingUrl(confirmedAppt)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    void onMarkWhatsAppSent(confirmedAppt.id);
                    setConfirmedAppt((prev) => (prev ? { ...prev, whatsappSent: true } : prev));
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-[#FAF7F3] bg-[#5A3D2E] rounded-lg hover:bg-[#6F4C3A] transition-colors"
                >
                  <MessageCircle className="w-4 h-4" aria-hidden="true" />
                  <span className="tabular-nums">
                    Enviar no WhatsApp {STUDIO_CONTACT.displayPhone}
                  </span>
                </a>
                <button
                  type="button"
                  onClick={() => void handleCopyWhatsAppText(confirmedAppt)}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium text-[#261C17] bg-[#FAF7F3] border border-[#E6DDD3] rounded-lg hover:bg-[#F1EAE2] transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{copiedMessage ? 'Mensagem copiada!' : 'Copiar texto da solicitação'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#ECE4DB]">
                <button
                  type="button"
                  onClick={() => {
                    setConfirmedAppt(null);
                    setCalendarSyncFeedback(null);
                  }}
                  className="text-xs font-medium text-[#7D5A46] hover:text-[#261C17] transition-colors"
                >
                  Fazer outro agendamento
                </button>
                <button
                  type="button"
                  onClick={onNavigateToAgenda}
                  className="text-xs font-medium text-[#261C17] underline underline-offset-4 hover:text-[#7D5A46] transition-colors"
                >
                  Ir para minha agenda
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => void handleSubmit(e)}
              noValidate
              className="bg-white border border-[#E6DDD3] rounded-xl p-5 sm:p-6 space-y-4"
            >
              <div>
                <p className="text-xs font-medium text-[#6B5B51]">4. Dados da cliente e lembrete</p>
                <h2 className="font-display text-2xl font-semibold text-[#261C17] mt-0.5">
                  Resumo da reserva
                </h2>
              </div>

              {/* Selected summary line */}
              <div className="py-3 border-y border-[#ECE4DB] text-sm space-y-1">
                <p className="font-medium text-[#261C17]">{activeService.name}</p>
                <p className="text-xs text-[#6B5B51] tabular-nums">
                  {formatDateToBR(selectedDate)} ·{' '}
                  {selectedTime
                    ? `${selectedTime} às ${formatMinutesToTime(
                        parseTimeToMinutes(selectedTime) + activeService.durationMinutes
                      )}`
                    : 'Escolha um horário à esquerda'}{' '}
                  · {formatCurrencyBRL(activeService.price)}
                </p>
              </div>

              {/* Google Calendar Auto-Sync Connection Box */}
              <div className="rounded-xl bg-[#FAF7F3] border border-[#E6DDD3] p-3.5 space-y-2.5">
                {hasCalendarAccess ? (
                  <p className="text-xs text-[#15803D] font-medium flex items-center gap-1.5">
                    <CalendarCheck2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>
                      Google Agenda conectado ({userEmail ?? 'conta Google'}) — sincronização
                      automática ativa ao confirmar.
                    </span>
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-[#54443B] leading-relaxed">
                      Conecte sua conta Google para salvar o agendamento{' '}
                      <strong className="font-medium text-[#261C17]">
                        automaticamente no seu Google Agenda
                      </strong>
                      .
                    </p>
                    <GoogleSignInButton
                      onClick={() => void onSignIn()}
                      label="Conectar Google Agenda"
                      size="sm"
                      fullWidth
                    />
                  </>
                )}
              </div>

              <div>
                <label
                  htmlFor="booking-client-name"
                  className="block text-xs font-medium text-[#261C17] mb-1.5"
                >
                  Nome completo
                </label>
                <input
                  id="booking-client-name"
                  name="clientName"
                  type="text"
                  required
                  maxLength={100}
                  value={clientName}
                  onChange={(e) => {
                    setClientName(e.target.value);
                    setErrors((prev) => ({ ...prev, clientName: undefined }));
                  }}
                  placeholder="Ex: Ana Paula Ferreira"
                  className="w-full h-11 px-3.5 text-sm bg-[#FAF7F3] border border-[#D8CCC0] rounded-lg text-[#261C17] placeholder:text-[#A6978B] focus:bg-white focus:border-[#5A3D2E]"
                />
                {errors.clientName && (
                  <p role="alert" className="text-xs font-medium text-[#B91C1C] mt-1.5">
                    {errors.clientName}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label
                    htmlFor="booking-client-cpf"
                    className="block text-xs font-medium text-[#261C17] mb-1.5"
                  >
                    CPF
                  </label>
                  <input
                    id="booking-client-cpf"
                    name="clientCpf"
                    type="text"
                    inputMode="numeric"
                    required
                    maxLength={14}
                    value={clientCpf}
                    onChange={(e) => {
                      setClientCpf(formatCPF(e.target.value));
                      setErrors((prev) => ({ ...prev, clientCpf: undefined }));
                    }}
                    placeholder="000.000.000-00"
                    className="w-full h-11 px-3.5 text-sm font-mono tabular-nums bg-[#FAF7F3] border border-[#D8CCC0] rounded-lg text-[#261C17] placeholder:text-[#A6978B] focus:bg-white focus:border-[#5A3D2E]"
                  />
                  {errors.clientCpf && (
                    <p role="alert" className="text-xs font-medium text-[#B91C1C] mt-1.5">
                      {errors.clientCpf}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="booking-client-phone"
                    className="block text-xs font-medium text-[#261C17] mb-1.5"
                  >
                    WhatsApp
                  </label>
                  <input
                    id="booking-client-phone"
                    name="clientPhone"
                    type="tel"
                    inputMode="tel"
                    required
                    maxLength={24}
                    value={clientPhone}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setClientPhone(raw.startsWith('+') ? raw : formatPhoneBR(raw));
                      setErrors((prev) => ({ ...prev, clientPhone: undefined }));
                    }}
                    placeholder="(64) 99999-9999"
                    className="w-full h-11 px-3.5 text-sm font-mono tabular-nums bg-[#FAF7F3] border border-[#D8CCC0] rounded-lg text-[#261C17] placeholder:text-[#A6978B] focus:bg-white focus:border-[#5A3D2E]"
                  />
                  {errors.clientPhone && (
                    <p role="alert" className="text-xs font-medium text-[#B91C1C] mt-1.5">
                      {errors.clientPhone}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="booking-notes"
                  className="block text-xs font-medium text-[#261C17] mb-1.5"
                >
                  Observações (opcional)
                </label>
                <textarea
                  id="booking-notes"
                  name="notes"
                  rows={2}
                  maxLength={400}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Preferência de curvatura, ocasião da maquiagem ou sensibilidade..."
                  className="w-full px-3.5 py-2.5 text-sm bg-[#FAF7F3] border border-[#D8CCC0] rounded-lg text-[#261C17] placeholder:text-[#A6978B] focus:bg-white focus:border-[#5A3D2E]"
                />
              </div>

              {/* Automated Push Reminder Controls */}
              <div className="pt-2 border-t border-[#ECE4DB] space-y-3">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="inline-flex items-center gap-2 text-xs font-medium text-[#261C17]">
                    <Bell className="w-4 h-4 text-[#7D5A46]" aria-hidden="true" />
                    <span>Ativar lembrete automático por notificação push</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={reminderEnabled}
                    onChange={(e) => setReminderEnabled(e.target.checked)}
                    className="w-4 h-4 accent-[#5A3D2E] rounded"
                  />
                </label>

                {reminderEnabled && (
                  <div>
                    <label
                      htmlFor="booking-reminder-lead"
                      className="block text-xs text-[#6B5B51] mb-1"
                    >
                      Antecedência do alerta
                    </label>
                    <select
                      id="booking-reminder-lead"
                      value={reminderMinutesBefore}
                      onChange={(e) =>
                        setReminderMinutesBefore(Number(e.target.value) as ReminderLeadTime)
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
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3.5 text-sm font-medium text-[#FAF7F3] bg-[#5A3D2E] rounded-lg hover:bg-[#6F4C3A] disabled:opacity-60 transition-colors"
              >
                <CalendarIcon className="w-4 h-4" aria-hidden="true" />
                <span>{submitting ? 'Confirmando...' : 'Confirmar Agendamento'}</span>
              </button>

              <p className="text-xs text-[#6B5B51] leading-relaxed">
                Seu agendamento é enviado diretamente ao painel de {STUDIO_CONTACT.professionalName}{' '}
                e sincronizado com seu Google Agenda.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
