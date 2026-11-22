import {
  Appointment,
  BookingFormInput,
  STUDIO_CONTACT,
  TimeSlot,
  ValidationResult,
  getServiceById,
} from '../types/studio';

export const BUSINESS_HOURS = {
  openMinutes: 8 * 60 + 30, // 08:30
  closeMinutes: 19 * 60 + 30, // 19:30
  stepMinutes: 30,
};

const DATE_REGEX = /^20[2-9][0-9]-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const TIME_REGEX = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const PHONE_REGEX = /^[0-9+()\-\s]{8,24}$/;
export const CPF_PATTERN_REGEX = /^[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}$/;

export function formatCPF(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function isValidCPF(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum1 = 0;
  for (let i = 0; i < 9; i++) {
    sum1 += Number(digits[i]) * (10 - i);
  }
  let check1 = (sum1 * 10) % 11;
  if (check1 === 10) check1 = 0;
  if (check1 !== Number(digits[9])) return false;

  let sum2 = 0;
  for (let i = 0; i < 10; i++) {
    sum2 += Number(digits[i]) * (11 - i);
  }
  let check2 = (sum2 * 10) % 11;
  if (check2 === 10) check2 = 0;
  return check2 === Number(digits[10]);
}

export function formatPhoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function parseTimeToMinutes(hhmm: string): number {
  const [hoursStr, minutesStr] = hhmm.split(':');
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return -1;
  }
  return hours * 60 + minutes;
}

export function formatMinutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function getDayOfWeekFromDateString(dateStr: string): number {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).getDay();
}

export function formatDateToBR(dateStr: string): string {
  if (!DATE_REGEX.test(dateStr)) return dateStr;
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function getAvailableTimeSlots(
  date: string,
  serviceDurationMinutes: number,
  appointments: Appointment[],
  hours = BUSINESS_HOURS
): TimeSlot[] {
  if (!DATE_REGEX.test(date)) {
    return [];
  }

  // Studio closed on Sundays (day === 0)
  if (getDayOfWeekFromDateString(date) === 0) {
    return [];
  }

  const activeDayBookings = appointments
    .filter((appt) => appt.date === date && appt.status !== 'cancelled')
    .map((appt) => {
      const start = parseTimeToMinutes(appt.startTime);
      return {
        start,
        end: start + appt.durationMinutes,
        serviceName: appt.serviceName,
      };
    });

  const slots: TimeSlot[] = [];

  for (
    let start = hours.openMinutes;
    start + serviceDurationMinutes <= hours.closeMinutes;
    start += hours.stepMinutes
  ) {
    const end = start + serviceDurationMinutes;
    const conflicting = activeDayBookings.find(
      (booking) => start < booking.end && end > booking.start
    );

    const period: TimeSlot['period'] =
      start < 12 * 60 ? 'manha' : start < 18 * 60 ? 'tarde' : 'noite';

    slots.push({
      time: formatMinutesToTime(start),
      period,
      available: !conflicting,
      reason: conflicting ? 'Horário reservado' : undefined,
    });
  }

  return slots;
}

export function getAvailableTimeSlotsForReschedule(
  date: string,
  serviceDurationMinutes: number,
  appointments: Appointment[],
  excludeAppointmentId: string,
  hours = BUSINESS_HOURS
): TimeSlot[] {
  const otherAppointments = appointments.filter((appt) => appt.id !== excludeAppointmentId);
  return getAvailableTimeSlots(date, serviceDurationMinutes, otherAppointments, hours);
}

export function validateBookingInput(input: BookingFormInput): ValidationResult {
  const errors: ValidationResult['errors'] = {};

  const trimmedName = input.clientName.trim();
  if (trimmedName.length < 2) {
    errors.clientName = 'Informe seu nome completo (mínimo 2 caracteres).';
  } else if (trimmedName.length > 100) {
    errors.clientName = 'O nome deve ter no máximo 100 caracteres.';
  }

  const formattedCpf = formatCPF(input.clientCpf);
  if (!CPF_PATTERN_REGEX.test(formattedCpf) || !isValidCPF(formattedCpf)) {
    errors.clientCpf = 'Informe um CPF válido (ex: 123.456.789-09).';
  }

  const trimmedPhone = input.clientPhone.trim();
  const digitsOnly = trimmedPhone.replace(/\D/g, '');
  if (!PHONE_REGEX.test(trimmedPhone) || digitsOnly.length < 10 || digitsOnly.length > 13) {
    errors.clientPhone = 'Informe um WhatsApp válido com DDD (ex: (64) 98448-0910).';
  }

  if (!DATE_REGEX.test(input.date)) {
    errors.date = 'Selecione uma data válida para o atendimento.';
  } else if (getDayOfWeekFromDateString(input.date) === 0) {
    errors.date = 'O estúdio não realiza atendimentos aos domingos.';
  }

  if (!TIME_REGEX.test(input.startTime)) {
    errors.startTime = 'Escolha um horário disponível na grade.';
  }

  if (input.notes.trim().length > 400) {
    errors.notes = 'As observações devem ter no máximo 400 caracteres.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function sanitizeBookingInput(input: BookingFormInput): BookingFormInput {
  return {
    ...input,
    clientName: input.clientName.trim().slice(0, 100),
    clientCpf: formatCPF(input.clientCpf),
    clientPhone: input.clientPhone.trim().slice(0, 24),
    notes: input.notes.trim().slice(0, 400),
  };
}

export function formatWhatsAppMessage(appointment: Appointment): string {
  const service = getServiceById(appointment.serviceId);
  const endTime = formatMinutesToTime(
    parseTimeToMinutes(appointment.startTime) + appointment.durationMinutes
  );
  const lines = [
    `Olá, ${STUDIO_CONTACT.professionalName}! Gostaria de confirmar minha solicitação de agendamento:`,
    '',
    `*Procedimento:* ${appointment.serviceName || service.name}`,
    `*Data:* ${formatDateToBR(appointment.date)}`,
    `*Horário:* ${appointment.startTime} às ${endTime} (${appointment.durationMinutes} min)`,
    `*Valor estimado:* ${formatCurrencyBRL(appointment.price)}`,
    `*Cliente:* ${appointment.clientName}`,
    `*CPF:* ${appointment.clientCpf}`,
    `*WhatsApp:* ${appointment.clientPhone}`,
  ];

  if (appointment.notes.trim()) {
    lines.push(`*Observações:* ${appointment.notes.trim()}`);
  }

  lines.push('', 'Enviado pelo aplicativo de agendamento Claudia Rodrigues.');
  return lines.join('\n');
}

export function buildWhatsAppBookingUrl(appointment: Appointment): string {
  const text = encodeURIComponent(formatWhatsAppMessage(appointment));
  return `https://wa.me/${STUDIO_CONTACT.e164Phone}?text=${text}`;
}

export function buildDirectWhatsAppUrl(customMessage?: string): string {
  const message =
    customMessage ??
    `Olá, ${STUDIO_CONTACT.professionalName}! Gostaria de consultar horários disponíveis no estúdio.`;
  return `https://wa.me/${STUDIO_CONTACT.e164Phone}?text=${encodeURIComponent(message)}`;
}

export function buildClientWhatsAppUrl(clientPhone: string, customMessage?: string): string {
  const digits = clientPhone.replace(/\D/g, '');
  const e164 = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
  const query = customMessage ? `?text=${encodeURIComponent(customMessage)}` : '';
  return `https://wa.me/${e164}${query}`;
}

export function getLocalTodayISO(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getNextBookableDateISO(now = new Date()): string {
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (cursor.getDay() === 0) {
    cursor.setDate(cursor.getDate() + 1);
  }
  return getLocalTodayISO(cursor);
}
