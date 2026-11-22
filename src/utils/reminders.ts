import { Appointment, PushReminderAlert, STUDIO_CONTACT } from '../types/studio';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

function parseAppointmentLocalDate(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

export function formatCountdownLabel(diffMinutes: number): string {
  if (diffMinutes <= 0) {
    return 'Agora';
  }
  if (diffMinutes < 60) {
    return `Em ${Math.round(diffMinutes)} min`;
  }
  const hours = Math.floor(diffMinutes / 60);
  const mins = Math.round(diffMinutes % 60);
  if (hours < 24) {
    return mins > 0 ? `Em ${hours}h ${mins}min` : `Em ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `Em ${days}d ${remHours}h` : `Em ${days} dia${days > 1 ? 's' : ''}`;
}

export function computeUpcomingReminders(
  appointments: Appointment[],
  now = new Date()
): PushReminderAlert[] {
  const nowMs = now.getTime();

  const alerts: PushReminderAlert[] = [];

  for (const appt of appointments) {
    if (appt.status === 'cancelled' || appt.status === 'completed' || !appt.reminderEnabled) {
      continue;
    }

    const apptDate = parseAppointmentLocalDate(appt.date, appt.startTime);
    const apptMs = apptDate.getTime();
    if (Number.isNaN(apptMs) || apptMs < nowMs - 15 * 60 * 1000) {
      continue;
    }

    const triggerMs = apptMs - appt.reminderMinutesBefore * 60 * 1000;
    const diffToApptMinutes = (apptMs - nowMs) / 60000;
    const isDueNow = nowMs >= triggerMs && nowMs <= apptMs;

    alerts.push({
      id: `rem_${appt.id}`,
      appointmentId: appt.id,
      clientName: appt.clientName,
      serviceName: appt.serviceName,
      date: appt.date,
      startTime: appt.startTime,
      triggerAtIso: new Date(triggerMs).toISOString(),
      countdownLabel: formatCountdownLabel(diffToApptMinutes),
      isDueNow,
      leadMinutes: appt.reminderMinutesBefore,
    });
  }

  return alerts.sort((a, b) => a.triggerAtIso.localeCompare(b.triggerAtIso));
}

export function getBrowserNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return Notification.permission;
  }
}

export function sendBrowserNotification(title: string, body: string): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission !== 'granted') {
    return false;
  }
  try {
    new Notification(title, {
      body,
      icon: STUDIO_CONTACT.bannerImageUrl,
      tag: `claudia-rodrigues-${Date.now()}`,
    });
    return true;
  } catch {
    return false;
  }
}
