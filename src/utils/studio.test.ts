import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClientWhatsAppUrl,
  buildWhatsAppBookingUrl,
  formatCPF,
  formatWhatsAppMessage,
  getAvailableTimeSlots,
  getAvailableTimeSlotsForReschedule,
  isValidCPF,
  validateBookingInput,
} from './scheduling';
import {
  buildGoogleCalendarEventPayload,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
  generateBatchICSContent,
  generateICSContent,
} from './calendarSync';
import { calculateMonthlyReport, exportReportToCSV } from './reports';
import { computeUpcomingReminders } from './reminders';
import { Appointment, STUDIO_CONTACT } from '../types/studio';

const sampleAppointment: Appointment = {
  id: 'appt_test_1',
  ownerId: 'user_demo',
  clientName: 'Mariana Silva',
  clientCpf: '529.982.247-25',
  clientPhone: '(64) 99123-4567',
  serviceId: 'extensao-cilios',
  serviceName: 'Extensão de Cílios',
  date: '2026-11-24', // Tuesday
  startTime: '10:00',
  durationMinutes: 120,
  price: 220,
  status: 'confirmed',
  notes: 'Volume russo suave',
  reminderMinutesBefore: 60,
  reminderEnabled: true,
  calendarSynced: false,
  googleCalendarEventId: '',
  googleCalendarHtmlLink: '',
  whatsappSent: false,
  ownerSeen: false,
  createdAt: '2026-11-21T12:00:00.000Z',
  updatedAt: '2026-11-21T12:00:00.000Z',
};

test('formatCPF and isValidCPF accurately format and validate Brazilian CPF check digits', () => {
  assert.equal(formatCPF('52998224725'), '529.982.247-25');
  assert.equal(formatCPF('529.982.247-25999'), '529.982.247-25');

  assert.equal(isValidCPF('529.982.247-25'), true);
  assert.equal(isValidCPF('390.533.447-05'), true);
  assert.equal(isValidCPF('111.111.111-11'), false);
  assert.equal(isValidCPF('000.000.000-00'), false);
  assert.equal(isValidCPF('529.982.247-26'), false);
  assert.equal(isValidCPF('12345'), false);
});

test('getAvailableTimeSlots blocks overlapping intervals and closes Sundays', () => {
  // 2026-11-22 is a Sunday -> should be empty
  const sundaySlots = getAvailableTimeSlots('2026-11-22', 60, [sampleAppointment]);
  assert.equal(sundaySlots.length, 0);

  // 2026-11-24 has a 120-min booking at 10:00-12:00
  // For a 60-min service, 09:30 (09:30-10:30), 10:00, 10:30, 11:00, 11:30 must be unavailable
  // While 09:00 (09:00-10:00) and 12:00 (12:00-13:00) must be available
  const slots = getAvailableTimeSlots('2026-11-24', 60, [sampleAppointment]);
  const slotMap = new Map(slots.map((s) => [s.time, s.available]));

  assert.equal(slotMap.get('09:00'), true);
  assert.equal(slotMap.get('09:30'), false);
  assert.equal(slotMap.get('10:00'), false);
  assert.equal(slotMap.get('11:30'), false);
  assert.equal(slotMap.get('12:00'), true);
});

test('getAvailableTimeSlotsForReschedule excludes the appointment being moved without freeing other bookings', () => {
  const otherBooking: Appointment = {
    ...sampleAppointment,
    id: 'appt_other',
    startTime: '14:00',
    durationMinutes: 60,
  };

  const slots = getAvailableTimeSlotsForReschedule(
    '2026-11-24',
    120,
    [sampleAppointment, otherBooking],
    sampleAppointment.id
  );
  const slotMap = new Map(slots.map((s) => [s.time, s.available]));

  // Moving sampleAppointment by 30 min to 10:30 must be allowed
  assert.equal(slotMap.get('10:30'), true);
  // Overlapping otherBooking (14:00-15:00) must still be blocked
  assert.equal(slotMap.get('13:00'), false);
  assert.equal(slotMap.get('14:00'), false);
  assert.equal(slotMap.get('15:00'), true);
});

test('cancelled appointments free up time slots immediately', () => {
  const cancelled: Appointment = { ...sampleAppointment, status: 'cancelled' };
  const slots = getAvailableTimeSlots('2026-11-24', 60, [cancelled]);
  const slot10 = slots.find((s) => s.time === '10:00');
  assert.equal(slot10?.available, true);
});

test('validateBookingInput rejects empty/invalid fields including CPF and accepts valid data', () => {
  const invalid = validateBookingInput({
    clientName: 'A',
    clientCpf: '111.111.111-11',
    clientPhone: '123',
    serviceId: 'lash-lifting',
    date: '2026-11-22', // Sunday
    startTime: '',
    notes: '',
    reminderMinutesBefore: 60,
    reminderEnabled: true,
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.clientName);
  assert.ok(invalid.errors.clientCpf);
  assert.ok(invalid.errors.clientPhone);
  assert.ok(invalid.errors.date);
  assert.ok(invalid.errors.startTime);

  const valid = validateBookingInput({
    clientName: 'Fernanda Costa',
    clientCpf: '529.982.247-25',
    clientPhone: '(64) 98448-0910',
    serviceId: 'maquiagem',
    date: '2026-11-24',
    startTime: '14:00',
    notes: 'Evento noturno',
    reminderMinutesBefore: 30,
    reminderEnabled: true,
  });
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.errors, {});
});

test('WhatsApp booking request targets exact studio phone and client WhatsApp helper builds Brazilian link', () => {
  const url = buildWhatsAppBookingUrl(sampleAppointment);
  assert.ok(url.startsWith(`https://wa.me/${STUDIO_CONTACT.e164Phone}?text=`));
  const msg = formatWhatsAppMessage(sampleAppointment);
  assert.ok(msg.includes('Claudia Rodrigues'));
  assert.ok(msg.includes('Extensão de Cílios'));
  assert.ok(msg.includes('24/11/2026'));
  assert.ok(msg.includes('10:00 às 12:00'));
  assert.ok(msg.includes('529.982.247-25'));

  const clientUrl = buildClientWhatsAppUrl('(64) 99123-4567', 'Olá!');
  assert.ok(clientUrl.startsWith('https://wa.me/5564991234567?text='));
});

test('Google Calendar API payload sets America/Sao_Paulo timezone, reminders, and omits CPF PII', () => {
  const payload = buildGoogleCalendarEventPayload(sampleAppointment);
  assert.equal(payload.start.dateTime, '2026-11-24T10:00:00');
  assert.equal(payload.start.timeZone, 'America/Sao_Paulo');
  assert.equal(payload.end.dateTime, '2026-11-24T12:00:00');
  assert.equal(payload.reminders.useDefault, false);
  assert.equal(payload.reminders.overrides[0]?.minutes, 60);
  // Ensure sensitive CPF is not leaked into calendar descriptions
  assert.equal(payload.description.includes(sampleAppointment.clientCpf), false);
});

test('External calendar exports produce valid ICS with VALARM and Google/Outlook URLs', () => {
  const ics = generateICSContent(sampleAppointment);
  assert.ok(ics.includes('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('BEGIN:VEVENT'));
  assert.ok(ics.includes('DTSTART:20261124T100000'));
  assert.ok(ics.includes('DTEND:20261124T120000'));
  assert.ok(ics.includes('TRIGGER:-PT60M'));
  assert.ok(ics.includes('(64) 98448-0910'));

  const batch = generateBatchICSContent([
    sampleAppointment,
    { ...sampleAppointment, id: 'appt_cancelled', status: 'cancelled' },
  ]);
  assert.equal((batch.match(/BEGIN:VEVENT/g) ?? []).length, 1);

  const gcal = buildGoogleCalendarUrl(sampleAppointment);
  assert.ok(gcal.includes('calendar.google.com/calendar/render'));
  assert.ok(gcal.includes('20261124T100000%2F20261124T120000'));

  const outlook = buildOutlookCalendarUrl(sampleAppointment);
  assert.ok(outlook.includes('outlook.live.com/calendar'));
});

test('calculateMonthlyReport and CSV export accurately compute productivity metrics', () => {
  const list: Appointment[] = [
    { ...sampleAppointment, id: 'a1', status: 'completed', price: 220, durationMinutes: 120 },
    {
      ...sampleAppointment,
      id: 'a2',
      serviceId: 'maquiagem',
      serviceName: 'Maquiagem',
      status: 'confirmed',
      price: 260,
      durationMinutes: 90,
      date: '2026-11-25',
    },
    {
      ...sampleAppointment,
      id: 'a3',
      serviceId: 'lash-lifting',
      serviceName: 'Lash Lifting',
      status: 'cancelled',
      price: 160,
      durationMinutes: 60,
      date: '2026-11-26',
    },
  ];

  const report = calculateMonthlyReport(list, '2026-11');
  assert.equal(report.totalScheduled, 3);
  assert.equal(report.completedCount, 1);
  assert.equal(report.confirmedCount, 1);
  assert.equal(report.cancelledCount, 1);
  assert.equal(report.realizedRevenue, 220);
  assert.equal(report.projectedRevenue, 480);
  assert.equal(report.productiveHours, 3.5);
  assert.equal(report.averageTicket, 240);

  const csv = exportReportToCSV(report, list);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('Relatório Mensal de Produtividade'));
  assert.ok(csv.includes('Mariana Silva'));
});

test('computeUpcomingReminders detects due and upcoming reminders in chronological order', () => {
  const now = new Date(2026, 10, 24, 9, 20, 0); // 2026-11-24 09:20 local
  const reminders = computeUpcomingReminders([sampleAppointment], now);
  assert.equal(reminders.length, 1);
  // 10:00 with 60 min lead -> triggers at 09:00 -> at 09:20 it is due now!
  assert.equal(reminders[0].isDueNow, true);
  assert.equal(reminders[0].countdownLabel, 'Em 40 min');
});
