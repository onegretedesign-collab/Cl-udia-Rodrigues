import {
  Appointment,
  DailyBreakdown,
  MonthlyReport,
  STUDIO_SERVICES,
  ServiceBreakdown,
} from '../types/studio';
import { formatDateToBR } from './scheduling';

const MONTH_NAMES_PT = [
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

export function formatYearMonthLabel(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split('-');
  const monthIdx = Number(monthStr) - 1;
  if (monthIdx < 0 || monthIdx > 11 || !yearStr) {
    return yearMonth;
  }
  return `${MONTH_NAMES_PT[monthIdx]} ${yearStr}`;
}

function countWorkdaysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split('-').map(Number);
  if (!year || !month) return 26;
  const daysInMonth = new Date(year, month, 0).getDate();
  let workdays = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(year, month - 1, d).getDay() !== 0) {
      workdays++;
    }
  }
  return workdays;
}

export function calculateMonthlyReport(
  appointments: Appointment[],
  yearMonth: string
): MonthlyReport {
  const monthAppts = appointments.filter((appt) => appt.date.startsWith(yearMonth));

  const completed = monthAppts.filter((a) => a.status === 'completed');
  const confirmed = monthAppts.filter((a) => a.status === 'confirmed');
  const pending = monthAppts.filter((a) => a.status === 'pending');
  const cancelled = monthAppts.filter((a) => a.status === 'cancelled');
  const active = monthAppts.filter((a) => a.status !== 'cancelled');

  const totalScheduled = monthAppts.length;
  const realizedRevenue = completed.reduce((sum, a) => sum + a.price, 0);
  const projectedRevenue = active.reduce((sum, a) => sum + a.price, 0);
  const productiveMinutes = active.reduce((sum, a) => sum + a.durationMinutes, 0);
  const productiveHours = Math.round((productiveMinutes / 60) * 10) / 10;

  // Capacity: working days (Mon-Sat) * 9 productive hours per day
  const capacityHours = countWorkdaysInMonth(yearMonth) * 9;
  const occupancyRate =
    capacityHours > 0
      ? Math.min(100, Math.round((productiveHours / capacityHours) * 1000) / 10)
      : 0;

  const completionRate =
    totalScheduled > 0 ? Math.round((completed.length / totalScheduled) * 1000) / 10 : 0;

  const cancellationRate =
    totalScheduled > 0 ? Math.round((cancelled.length / totalScheduled) * 1000) / 10 : 0;

  const averageTicket =
    active.length > 0 ? Math.round((projectedRevenue / active.length) * 100) / 100 : 0;

  const byService: ServiceBreakdown[] = STUDIO_SERVICES.map((svc) => {
    const svcActive = active.filter((a) => a.serviceId === svc.id);
    const svcCompleted = svcActive.filter((a) => a.status === 'completed');
    const svcMinutes = svcActive.reduce((sum, a) => sum + a.durationMinutes, 0);
    const svcProjected = svcActive.reduce((sum, a) => sum + a.price, 0);
    const svcRealized = svcCompleted.reduce((sum, a) => sum + a.price, 0);

    return {
      serviceId: svc.id,
      serviceName: svc.shortName,
      count: svcActive.length,
      completedCount: svcCompleted.length,
      revenue: svcRealized,
      projectedRevenue: svcProjected,
      hours: Math.round((svcMinutes / 60) * 10) / 10,
      sharePercent:
        active.length > 0 ? Math.round((svcActive.length / active.length) * 1000) / 10 : 0,
    };
  }).sort((a, b) => b.projectedRevenue - a.projectedRevenue);

  const dayMap = new Map<string, DailyBreakdown>();
  for (const appt of active) {
    const existing = dayMap.get(appt.date) ?? {
      date: appt.date,
      dayLabel: appt.date.slice(8, 10) + '/' + appt.date.slice(5, 7),
      appointmentsCount: 0,
      completedCount: 0,
      revenue: 0,
      hours: 0,
    };

    existing.appointmentsCount += 1;
    if (appt.status === 'completed') {
      existing.completedCount += 1;
    }
    existing.revenue += appt.price;
    existing.hours = Math.round((existing.hours + appt.durationMinutes / 60) * 10) / 10;
    dayMap.set(appt.date, existing);
  }

  const byDay = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    yearMonth,
    monthLabel: formatYearMonthLabel(yearMonth),
    totalScheduled,
    completedCount: completed.length,
    confirmedCount: confirmed.length,
    pendingCount: pending.length,
    cancelledCount: cancelled.length,
    completionRate,
    cancellationRate,
    realizedRevenue,
    projectedRevenue,
    productiveHours,
    occupancyRate,
    averageTicket,
    byService,
    byDay,
  };
}

function escapeCSV(cell: string | number): string {
  const str = String(cell);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportReportToCSV(report: MonthlyReport, appointments: Appointment[]): string {
  const monthAppts = appointments
    .filter((a) => a.date.startsWith(report.yearMonth))
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));

  const statusLabel: Record<Appointment['status'], string> = {
    pending: 'Pendente',
    confirmed: 'Confirmado',
    completed: 'Concluído',
    cancelled: 'Cancelado',
  };

  const lines: string[] = [
    `Relatório Mensal de Produtividade — Claudia Rodrigues (${report.monthLabel})`,
    `Total Agendado,${report.totalScheduled},Concluídos,${report.completedCount},Cancelados,${report.cancelledCount}`,
    `Receita Realizada (BRL),${report.realizedRevenue.toFixed(2)},Receita Prevista (BRL),${report.projectedRevenue.toFixed(2)},Horas Produtivas,${report.productiveHours}`,
    '',
    'Data,Horário,Cliente,Telefone,Serviço,Duração (min),Valor (BRL),Status,Calendário Sincronizado,WhatsApp Enviado',
  ];

  for (const appt of monthAppts) {
    lines.push(
      [
        formatDateToBR(appt.date),
        appt.startTime,
        appt.clientName,
        appt.clientPhone,
        appt.serviceName,
        appt.durationMinutes,
        appt.price.toFixed(2),
        statusLabel[appt.status],
        appt.calendarSynced ? 'Sim' : 'Não',
        appt.whatsappSent ? 'Sim' : 'Não',
      ]
        .map(escapeCSV)
        .join(',')
    );
  }

  return '\uFEFF' + lines.join('\r\n');
}

export function exportReportToJSON(report: MonthlyReport, appointments: Appointment[]): string {
  const monthAppts = appointments.filter((a) => a.date.startsWith(report.yearMonth));
  return JSON.stringify(
    {
      studio: 'Claudia Rodrigues',
      generatedAt: new Date().toISOString(),
      summary: report,
      appointments: monthAppts,
    },
    null,
    2
  );
}

export function getAvailableMonths(
  appointments: Appointment[],
  referenceDate = new Date()
): { value: string; label: string }[] {
  const set = new Set<string>();
  const currentYM = `${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(
    2,
    '0'
  )}`;
  set.add(currentYM);

  const prevDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
  const prevYM = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
  set.add(prevYM);

  for (const appt of appointments) {
    if (appt.date.length >= 7) {
      set.add(appt.date.slice(0, 7));
    }
  }

  return Array.from(set)
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: formatYearMonthLabel(value) }));
}
