import { Appointment, STUDIO_CONTACT } from '../types/studio';
import { formatMinutesToTime, parseTimeToMinutes } from './scheduling';

const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

function formatCompactLocalDateTime(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split('-');
  const [hours, minutes] = timeStr.split(':');
  return `${year}${month}${day}T${hours}${minutes}00`;
}

function escapeICS(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export interface GoogleCalendarEventPayload {
  summary: string;
  location: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  reminders: {
    useDefault: boolean;
    overrides: { method: 'popup'; minutes: number }[];
  };
}

export function buildGoogleCalendarEventPayload(
  appointment: Appointment
): GoogleCalendarEventPayload {
  const startMinutes = parseTimeToMinutes(appointment.startTime);
  const endTime = formatMinutesToTime(startMinutes + appointment.durationMinutes);
  const summary = `${appointment.serviceName} — ${STUDIO_CONTACT.professionalName}`;

  // Intentionally omit client CPF from calendar event description to minimize PII exposure
  const descriptionParts = [
    `Atendimento agendado no Estúdio ${STUDIO_CONTACT.professionalName}.`,
    `Procedimento: ${appointment.serviceName}`,
    `Cliente: ${appointment.clientName}`,
    `WhatsApp do Estúdio: ${STUDIO_CONTACT.displayPhone}`,
    `Duração estimada: ${appointment.durationMinutes} minutos`,
  ];
  if (appointment.notes.trim()) {
    descriptionParts.push(`Observações: ${appointment.notes.trim()}`);
  }

  return {
    summary,
    location: `Estúdio ${STUDIO_CONTACT.professionalName} — ${STUDIO_CONTACT.displayPhone}`,
    description: descriptionParts.join('\n'),
    start: {
      dateTime: `${appointment.date}T${appointment.startTime}:00`,
      timeZone: DEFAULT_TIMEZONE,
    },
    end: {
      dateTime: `${appointment.date}T${endTime}:00`,
      timeZone: DEFAULT_TIMEZONE,
    },
    reminders: {
      useDefault: false,
      overrides: appointment.reminderEnabled
        ? [{ method: 'popup', minutes: appointment.reminderMinutesBefore }]
        : [{ method: 'popup', minutes: 60 }],
    },
  };
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  appointment: Appointment
): Promise<{ eventId: string; htmlLink: string }> {
  const payload = buildGoogleCalendarEventPayload(appointment);
  const response = await fetch(GOOGLE_CALENDAR_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Falha ao criar evento no Google Agenda (${response.status}): ${errText.slice(0, 180)}`
    );
  }

  const data = (await response.json()) as { id?: string; htmlLink?: string };
  if (!data.id) {
    throw new Error('O Google Agenda não retornou o identificador do evento criado.');
  }

  return {
    eventId: String(data.id).slice(0, 256),
    htmlLink: typeof data.htmlLink === 'string' ? data.htmlLink.slice(0, 512) : '',
  };
}

export async function updateGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  appointment: Appointment
): Promise<{ eventId: string; htmlLink: string }> {
  const payload = buildGoogleCalendarEventPayload(appointment);
  const response = await fetch(
    `${GOOGLE_CALENDAR_API_BASE}/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Falha ao atualizar evento no Google Agenda (${response.status}): ${errText.slice(0, 180)}`
    );
  }

  const data = (await response.json()) as { id?: string; htmlLink?: string };
  return {
    eventId: String(data.id ?? eventId).slice(0, 256),
    htmlLink:
      typeof data.htmlLink === 'string'
        ? data.htmlLink.slice(0, 512)
        : appointment.googleCalendarHtmlLink,
  };
}

export async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<void> {
  const response = await fetch(
    `${GOOGLE_CALENDAR_API_BASE}/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  // 404 or 410 means the event was already deleted on Google Calendar
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const errText = await response.text().catch(() => '');
    throw new Error(
      `Falha ao remover evento do Google Agenda (${response.status}): ${errText.slice(0, 180)}`
    );
  }
}

function buildVEventBlock(appointment: Appointment): string {
  const startMinutes = parseTimeToMinutes(appointment.startTime);
  const endTime = formatMinutesToTime(startMinutes + appointment.durationMinutes);
  const dtStart = formatCompactLocalDateTime(appointment.date, appointment.startTime);
  const dtEnd = formatCompactLocalDateTime(appointment.date, endTime);
  const dtStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const summary = `${appointment.serviceName} — ${STUDIO_CONTACT.professionalName}`;
  const descriptionParts = [
    `Cliente: ${appointment.clientName}`,
    `Contato do estúdio: ${STUDIO_CONTACT.displayPhone}`,
    `Duração: ${appointment.durationMinutes} minutos`,
  ];
  if (appointment.notes.trim()) {
    descriptionParts.push(`Observações: ${appointment.notes.trim()}`);
  }

  const alarmLines = appointment.reminderEnabled
    ? [
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:Lembrete: ${escapeICS(summary)}`,
        `TRIGGER:-PT${appointment.reminderMinutesBefore}M`,
        'END:VALARM',
      ]
    : [];

  return [
    'BEGIN:VEVENT',
    `UID:${escapeICS(appointment.id)}@claudiarodrigues.studio`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICS(summary)}`,
    `DESCRIPTION:${escapeICS(descriptionParts.join('\n'))}`,
    `LOCATION:${escapeICS(`Estúdio ${STUDIO_CONTACT.professionalName} — ${STUDIO_CONTACT.displayPhone}`)}`,
    'STATUS:CONFIRMED',
    ...alarmLines,
    'END:VEVENT',
  ].join('\r\n');
}

export function generateICSContent(appointment: Appointment): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Claudia Rodrigues Studio//Agendamentos//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    buildVEventBlock(appointment),
    'END:VCALENDAR',
  ].join('\r\n');
}

export function generateBatchICSContent(appointments: Appointment[]): string {
  const active = appointments.filter((a) => a.status !== 'cancelled');
  const events = active.map((appt) => buildVEventBlock(appt));
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Claudia Rodrigues Studio//Agendamentos//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Claudia Rodrigues — Agendamentos',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

export function buildGoogleCalendarUrl(appointment: Appointment): string {
  const startMinutes = parseTimeToMinutes(appointment.startTime);
  const endTime = formatMinutesToTime(startMinutes + appointment.durationMinutes);
  const dtStart = formatCompactLocalDateTime(appointment.date, appointment.startTime);
  const dtEnd = formatCompactLocalDateTime(appointment.date, endTime);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${appointment.serviceName} — ${STUDIO_CONTACT.professionalName}`,
    dates: `${dtStart}/${dtEnd}`,
    details: `Agendamento no Estúdio ${STUDIO_CONTACT.professionalName}.\nCliente: ${appointment.clientName}\nContato direto: ${STUDIO_CONTACT.displayPhone}${
      appointment.notes ? `\nObservações: ${appointment.notes}` : ''
    }`,
    location: `Estúdio ${STUDIO_CONTACT.professionalName} (${STUDIO_CONTACT.displayPhone})`,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildOutlookCalendarUrl(appointment: Appointment): string {
  const startMinutes = parseTimeToMinutes(appointment.startTime);
  const endTime = formatMinutesToTime(startMinutes + appointment.durationMinutes);

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: `${appointment.serviceName} — ${STUDIO_CONTACT.professionalName}`,
    startdt: `${appointment.date}T${appointment.startTime}:00`,
    enddt: `${appointment.date}T${endTime}:00`,
    body: `Atendimento com ${STUDIO_CONTACT.professionalName} (${STUDIO_CONTACT.displayPhone}). Cliente: ${appointment.clientName}.`,
    location: `Estúdio ${STUDIO_CONTACT.professionalName}`,
  });

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

export function triggerFileDownload(
  filename: string,
  content: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
