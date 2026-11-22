import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  BOOTSTRAP_ADMIN_EMAIL,
  OperationType,
  auth,
  clearGoogleAccessToken,
  db,
  getGoogleAccessToken,
  handleFirestoreError,
  isAuthSignInInProgress,
  signInWithGoogleCalendar,
  signOutFromGoogle,
} from '../lib/firebase';
import {
  Appointment,
  AppointmentStatus,
  BookingFormInput,
  CalendarProvider,
  CalendarSyncResult,
  PushReminderAlert,
  ReminderLeadTime,
  UserPreferences,
  getServiceById,
} from '../types/studio';
import { createSeedAppointments } from '../data/seedAppointments';
import { formatDateToBR, sanitizeBookingInput } from '../utils/scheduling';
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  updateGoogleCalendarEvent,
} from '../utils/calendarSync';
import {
  NotificationPermissionState,
  computeUpcomingReminders,
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  sendBrowserNotification,
} from '../utils/reminders';

const STORAGE_APPTS_KEY = 'claudia_rodrigues_appointments_v2';
const STORAGE_PREFS_KEY = 'claudia_rodrigues_prefs_v1';

const DEFAULT_PREFERENCES: UserPreferences = {
  userId: 'demo_local',
  pushEnabled: true,
  defaultReminderMinutes: 60,
  calendarProvider: 'google',
  updatedAt: new Date().toISOString(),
};

function normalizeAppointment(raw: Partial<Appointment> & { id: string }): Appointment {
  return {
    id: raw.id,
    ownerId: String(raw.ownerId ?? 'demo_local'),
    clientName: String(raw.clientName ?? ''),
    clientCpf: String(raw.clientCpf ?? '000.000.000-00'),
    clientPhone: String(raw.clientPhone ?? ''),
    serviceId: raw.serviceId ?? 'brow-lamination',
    serviceName: String(raw.serviceName ?? ''),
    date: String(raw.date ?? ''),
    startTime: String(raw.startTime ?? ''),
    durationMinutes: Number(raw.durationMinutes ?? 60),
    price: Number(raw.price ?? 0),
    status: (raw.status as AppointmentStatus) ?? 'confirmed',
    notes: String(raw.notes ?? ''),
    reminderMinutesBefore: Number(raw.reminderMinutesBefore ?? 60) as ReminderLeadTime,
    reminderEnabled: Boolean(raw.reminderEnabled ?? true),
    calendarSynced: Boolean(raw.calendarSynced),
    googleCalendarEventId: String(raw.googleCalendarEventId ?? ''),
    googleCalendarHtmlLink: String(raw.googleCalendarHtmlLink ?? ''),
    whatsappSent: Boolean(raw.whatsappSent),
    ownerSeen: Boolean(raw.ownerSeen ?? true),
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

function readLocalAppointments(): Appointment[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_APPTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as (Partial<Appointment> & { id: string })[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalizeAppointment);
      }
    }
  } catch {
    // Fallback to seed data
  }
  const seeded = createSeedAppointments();
  try {
    window.localStorage.setItem(STORAGE_APPTS_KEY, JSON.stringify(seeded));
  } catch {
    // Ignore storage quota issues
  }
  return seeded;
}

function readLocalPreferences(): UserPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFS_KEY);
    if (raw) {
      return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<UserPreferences>) };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_PREFERENCES;
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') {
    return value;
  }
  return new Date().toISOString();
}

export interface CreateAppointmentOutcome {
  appointment: Appointment;
  calendarSync: CalendarSyncResult;
}

export interface StudioCloudState {
  user: User | null;
  authReady: boolean;
  isAdmin: boolean;
  cloudSynced: boolean;
  hasCalendarAccess: boolean;
  loading: boolean;
  authError: string | null;
  appointments: Appointment[];
  unreadBookingsCount: number;
  preferences: UserPreferences;
  notificationPermission: NotificationPermissionState;
  upcomingReminders: PushReminderAlert[];
  activeToastReminder: { title: string; body: string } | null;
  dismissToastReminder: () => void;
  signInWithGoogle: () => Promise<boolean>;
  signOutUser: () => Promise<void>;
  createAppointment: (input: BookingFormInput) => Promise<CreateAppointmentOutcome>;
  syncAppointmentToGoogleCalendar: (appointment: Appointment) => Promise<CalendarSyncResult>;
  rescheduleAppointment: (
    id: string,
    newDate: string,
    newStartTime: string,
    notes?: string,
    syncCalendar?: boolean
  ) => Promise<{ calendarUpdated: boolean; calendarError?: string }>;
  updateAppointmentStatus: (
    id: string,
    status: AppointmentStatus,
    removeCalendarEvent?: boolean
  ) => Promise<void>;
  markCalendarSynced: (
    id: string,
    eventId?: string,
    htmlLink?: string
  ) => Promise<void>;
  markWhatsAppSent: (id: string) => Promise<void>;
  toggleAppointmentReminder: (id: string, enabled: boolean) => Promise<void>;
  deleteAppointment: (id: string, removeCalendarEvent?: boolean) => Promise<void>;
  markOwnerSeen: (id: string) => Promise<void>;
  markAllOwnerSeen: () => Promise<void>;
  updatePreferences: (
    patch: Partial<Pick<UserPreferences, 'pushEnabled' | 'defaultReminderMinutes' | 'calendarProvider'>>
  ) => Promise<void>;
  enablePushNotifications: () => Promise<NotificationPermissionState>;
  triggerTestReminder: () => void;
  triggerTestOwnerNotification: () => void;
}

export function useStudioCloud(): StudioCloudState {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [hasCalendarAccess, setHasCalendarAccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>(() => readLocalAppointments());
  const [preferences, setPreferences] = useState<UserPreferences>(() => readLocalPreferences());
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>(() => getBrowserNotificationPermission());
  const [activeToastReminder, setActiveToastReminder] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const [firedReminderIds, setFiredReminderIds] = useState<Set<string>>(() => new Set());
  const [clockTick, setClockTick] = useState(() => Date.now());

  const initialSnapshotLoadedRef = useRef(false);
  const notifiedBookingIdsRef = useRef<Set<string>>(new Set());

  const isAdmin = Boolean(
    user && user.email === BOOTSTRAP_ADMIN_EMAIL && user.emailVerified
  );

  const unreadBookingsCount = useMemo(
    () => appointments.filter((a) => !a.ownerSeen && a.status !== 'cancelled').length,
    [appointments]
  );

  const emitNewBookingAlert = useCallback((appt: Appointment) => {
    if (notifiedBookingIdsRef.current.has(appt.id)) return;
    notifiedBookingIdsRef.current.add(appt.id);

    const title = `Novo agendamento: ${appt.serviceName}`;
    const body = `${appt.clientName} (CPF ${appt.clientCpf}) · ${formatDateToBR(
      appt.date
    )} às ${appt.startTime} · WhatsApp ${appt.clientPhone}`;

    sendBrowserNotification(title, body);
    setActiveToastReminder({ title, body });
  }, []);

  // Persist local mode state
  useEffect(() => {
    if (!user) {
      try {
        window.localStorage.setItem(STORAGE_APPTS_KEY, JSON.stringify(appointments));
      } catch {
        // Ignore storage errors
      }
    }
  }, [appointments, user]);

  useEffect(() => {
    if (!user) {
      try {
        window.localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(preferences));
      } catch {
        // Ignore storage errors
      }
    }
  }, [preferences, user]);

  // Listen to Firebase Auth state & clear in-memory token on sign-out
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        clearGoogleAccessToken();
        setHasCalendarAccess(false);
        initialSnapshotLoadedRef.current = false;
        setAppointments(readLocalAppointments());
        setPreferences(readLocalPreferences());
        setLoading(false);
      } else if (!isAuthSignInInProgress()) {
        setHasCalendarAccess(Boolean(getGoogleAccessToken()));
      }
    });
    return () => unsubscribe();
  }, []);

  // Real-time Firestore sync once authenticated + live new-booking notifications for studio owner
  useEffect(() => {
    if (!authReady || !user) {
      return;
    }

    setLoading(true);
    initialSnapshotLoadedRef.current = false;

    const apptsRef = collection(db, 'appointments');
    const apptsQuery = isAdmin
      ? query(apptsRef)
      : query(apptsRef, where('ownerId', '==', user.uid));

    const unsubAppts = onSnapshot(
      apptsQuery,
      (snapshot) => {
        const docs: Appointment[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return normalizeAppointment({
            id: docSnap.id,
            ownerId: String(data.ownerId ?? user.uid),
            clientName: String(data.clientName ?? ''),
            clientCpf: String(data.clientCpf ?? '000.000.000-00'),
            clientPhone: String(data.clientPhone ?? ''),
            serviceId: data.serviceId,
            serviceName: String(data.serviceName ?? ''),
            date: String(data.date ?? ''),
            startTime: String(data.startTime ?? ''),
            durationMinutes: Number(data.durationMinutes ?? 60),
            price: Number(data.price ?? 0),
            status: data.status as AppointmentStatus,
            notes: String(data.notes ?? ''),
            reminderMinutesBefore: Number(data.reminderMinutesBefore ?? 60) as ReminderLeadTime,
            reminderEnabled: Boolean(data.reminderEnabled),
            calendarSynced: Boolean(data.calendarSynced),
            googleCalendarEventId: String(data.googleCalendarEventId ?? ''),
            googleCalendarHtmlLink: String(data.googleCalendarHtmlLink ?? ''),
            whatsappSent: Boolean(data.whatsappSent),
            ownerSeen: Boolean(data.ownerSeen ?? false),
            createdAt: timestampToIso(data.createdAt),
            updatedAt: timestampToIso(data.updatedAt),
          });
        });

        // Notify studio owner in real time whenever a brand-new appointment is added
        if (initialSnapshotLoadedRef.current && isAdmin) {
          for (const change of snapshot.docChanges()) {
            if (change.type === 'added') {
              const added = docs.find((d) => d.id === change.doc.id);
              if (added && !added.ownerSeen) {
                emitNewBookingAlert(added);
              }
            }
          }
        } else if (!initialSnapshotLoadedRef.current && isAdmin) {
          // On first load, if there are unseen bookings, gently notify summary once
          const unseen = docs.filter((d) => !d.ownerSeen && d.status !== 'cancelled');
          if (unseen.length > 0) {
            const newest = unseen[0];
            setActiveToastReminder({
              title:
                unseen.length === 1
                  ? '1 novo agendamento aguardando no Painel'
                  : `${unseen.length} novos agendamentos aguardando no Painel`,
              body: `Mais recente: ${newest.clientName} · ${newest.serviceName} (${formatDateToBR(
                newest.date
              )} às ${newest.startTime})`,
            });
          }
        }

        initialSnapshotLoadedRef.current = true;
        setAppointments(docs);
        setLoading(false);
      },
      (error) => {
        setLoading(false);
        handleFirestoreError(error, OperationType.LIST, 'appointments');
      }
    );

    const prefDocRef = doc(db, 'userPreferences', user.uid);
    const unsubPrefs = onSnapshot(
      prefDocRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setPreferences({
            userId: user.uid,
            pushEnabled: Boolean(data.pushEnabled),
            defaultReminderMinutes: Number(data.defaultReminderMinutes ?? 60) as ReminderLeadTime,
            calendarProvider: (data.calendarProvider as CalendarProvider) ?? 'google',
            updatedAt: timestampToIso(data.updatedAt),
          });
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `userPreferences/${user.uid}`);
      }
    );

    return () => {
      unsubAppts();
      unsubPrefs();
    };
  }, [authReady, user, isAdmin, emitNewBookingAlert]);

  // Automatic push reminder tick every 30s
  useEffect(() => {
    const interval = window.setInterval(() => {
      setClockTick(Date.now());
    }, 30000);
    return () => window.clearInterval(interval);
  }, []);

  const upcomingReminders = useMemo(
    () => computeUpcomingReminders(appointments, new Date(clockTick)),
    [appointments, clockTick]
  );

  // Fire live push notification for any newly due reminder
  useEffect(() => {
    if (!preferences.pushEnabled) return;
    const nextDue = upcomingReminders.find(
      (rem) => rem.isDueNow && !firedReminderIds.has(rem.id)
    );
    if (!nextDue) return;

    const title = `Lembrete: ${nextDue.serviceName}`;
    const body = `${nextDue.clientName} · Hoje às ${nextDue.startTime} (${nextDue.countdownLabel}) — Estúdio Claudia Rodrigues.`;

    sendBrowserNotification(title, body);
    setActiveToastReminder({ title, body });
    setFiredReminderIds((prev) => {
      const next = new Set(prev);
      next.add(nextDue.id);
      return next;
    });
  }, [upcomingReminders, preferences.pushEnabled, firedReminderIds]);

  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    setAuthError(null);
    try {
      const { accessToken } = await signInWithGoogleCalendar();
      setHasCalendarAccess(Boolean(accessToken));
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Não foi possível conectar com o Google.';
      setAuthError(message);
      return false;
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    setHasCalendarAccess(false);
    await signOutFromGoogle();
  }, []);

  const markCalendarSynced = useCallback(
    async (id: string, eventId = '', htmlLink = '') => {
      const safeEventId = eventId.slice(0, 256);
      const safeHtmlLink = htmlLink.startsWith('https://') ? htmlLink.slice(0, 512) : '';

      if (user) {
        const path = `appointments/${id}`;
        try {
          await updateDoc(doc(db, 'appointments', id), {
            calendarSynced: true,
            googleCalendarEventId: safeEventId,
            googleCalendarHtmlLink: safeHtmlLink,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      } else {
        setAppointments((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...a,
                  calendarSynced: true,
                  googleCalendarEventId: safeEventId || a.googleCalendarEventId,
                  googleCalendarHtmlLink: safeHtmlLink || a.googleCalendarHtmlLink,
                  updatedAt: new Date().toISOString(),
                }
              : a
          )
        );
      }
    },
    [user]
  );

  const syncAppointmentToGoogleCalendar = useCallback(
    async (appointment: Appointment): Promise<CalendarSyncResult> => {
      let token = getGoogleAccessToken();
      if (!token) {
        try {
          const authRes = await signInWithGoogleCalendar();
          token = authRes.accessToken;
          setHasCalendarAccess(Boolean(token));
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : 'Conecte sua conta Google para sincronizar com o Google Agenda.';
          return { synced: false, error: message };
        }
      }

      if (!token) {
        return {
          synced: false,
          error: 'Permissão do Google Agenda não concedida nesta sessão.',
        };
      }

      try {
        const created = await createGoogleCalendarEvent(token, appointment);
        await markCalendarSynced(appointment.id, created.eventId, created.htmlLink);
        return {
          synced: true,
          eventId: created.eventId,
          htmlLink: created.htmlLink,
        };
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Não foi possível criar o evento no Google Agenda.';
        return { synced: false, error: message };
      }
    },
    [markCalendarSynced]
  );

  const createAppointment = useCallback(
    async (rawInput: BookingFormInput): Promise<CreateAppointmentOutcome> => {
      const clean = sanitizeBookingInput(rawInput);
      const service = getServiceById(clean.serviceId);
      const id = `appt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const nowIso = new Date().toISOString();

      let newAppt: Appointment = {
        id,
        ownerId: user?.uid ?? 'demo_local',
        clientName: clean.clientName,
        clientCpf: clean.clientCpf,
        clientPhone: clean.clientPhone,
        serviceId: service.id,
        serviceName: service.name.slice(0, 80),
        date: clean.date,
        startTime: clean.startTime,
        durationMinutes: service.durationMinutes,
        price: service.price,
        status: 'confirmed',
        notes: clean.notes,
        reminderMinutesBefore: clean.reminderMinutesBefore,
        reminderEnabled: clean.reminderEnabled,
        calendarSynced: false,
        googleCalendarEventId: '',
        googleCalendarHtmlLink: '',
        whatsappSent: false,
        ownerSeen: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      // Automatically sync with the client's Google Calendar if signed in with Calendar permission
      let calendarSync: CalendarSyncResult = { synced: false };
      const token = getGoogleAccessToken();
      if (token) {
        try {
          const eventRes = await createGoogleCalendarEvent(token, newAppt);
          newAppt = {
            ...newAppt,
            calendarSynced: true,
            googleCalendarEventId: eventRes.eventId,
            googleCalendarHtmlLink: eventRes.htmlLink,
          };
          calendarSync = {
            synced: true,
            eventId: eventRes.eventId,
            htmlLink: eventRes.htmlLink,
          };
        } catch (err) {
          calendarSync = {
            synced: false,
            error:
              err instanceof Error
                ? err.message
                : 'Não foi possível sincronizar automaticamente com o Google Agenda.',
          };
        }
      }

      if (user) {
        const path = `appointments/${id}`;
        try {
          await setDoc(doc(db, 'appointments', id), {
            ownerId: user.uid,
            clientName: newAppt.clientName,
            clientCpf: newAppt.clientCpf,
            clientPhone: newAppt.clientPhone,
            serviceId: newAppt.serviceId,
            serviceName: newAppt.serviceName,
            date: newAppt.date,
            startTime: newAppt.startTime,
            durationMinutes: newAppt.durationMinutes,
            price: newAppt.price,
            status: newAppt.status,
            notes: newAppt.notes,
            reminderMinutesBefore: newAppt.reminderMinutesBefore,
            reminderEnabled: newAppt.reminderEnabled,
            calendarSynced: newAppt.calendarSynced,
            googleCalendarEventId: newAppt.googleCalendarEventId,
            googleCalendarHtmlLink: newAppt.googleCalendarHtmlLink,
            whatsappSent: false,
            ownerSeen: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      } else {
        setAppointments((prev) => [newAppt, ...prev]);
        // In local mode, immediately fire the owner notification preview so the studio owner sees it live
        emitNewBookingAlert(newAppt);
      }

      return { appointment: newAppt, calendarSync };
    },
    [user, emitNewBookingAlert]
  );

  const rescheduleAppointment = useCallback(
    async (
      id: string,
      newDate: string,
      newStartTime: string,
      notes?: string,
      syncCalendar = false
    ): Promise<{ calendarUpdated: boolean; calendarError?: string }> => {
      const target = appointments.find((a) => a.id === id);
      if (!target) {
        return { calendarUpdated: false };
      }

      const cleanNotes = (notes ?? target.notes).trim().slice(0, 400);
      const updatedAppt: Appointment = {
        ...target,
        date: newDate,
        startTime: newStartTime,
        notes: cleanNotes,
        status: target.status === 'cancelled' ? 'confirmed' : target.status,
        updatedAt: new Date().toISOString(),
      };

      let calendarUpdated = false;
      let calendarError: string | undefined;
      let nextEventId = target.googleCalendarEventId;
      let nextHtmlLink = target.googleCalendarHtmlLink;
      let nextSynced = target.calendarSynced;

      const token = getGoogleAccessToken();
      const canTouchOwnEvent =
        syncCalendar &&
        Boolean(token) &&
        Boolean(target.googleCalendarEventId) &&
        (!user || target.ownerId === user.uid);

      if (canTouchOwnEvent && token) {
        try {
          const patchRes = await updateGoogleCalendarEvent(
            token,
            target.googleCalendarEventId,
            updatedAppt
          );
          nextEventId = patchRes.eventId;
          nextHtmlLink = patchRes.htmlLink;
          nextSynced = true;
          calendarUpdated = true;
        } catch (err) {
          calendarError =
            err instanceof Error ? err.message : 'Erro ao atualizar evento no Google Agenda.';
        }
      }

      if (user) {
        const path = `appointments/${id}`;
        try {
          const payload: Record<string, unknown> = {
            date: newDate,
            startTime: newStartTime,
            notes: cleanNotes,
            calendarSynced: nextSynced,
            googleCalendarEventId: nextEventId,
            googleCalendarHtmlLink: nextHtmlLink,
            updatedAt: serverTimestamp(),
          };
          if (isAdmin && target.status === 'cancelled') {
            payload.status = 'confirmed';
          }
          await updateDoc(doc(db, 'appointments', id), payload);
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      } else {
        setAppointments((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...updatedAppt,
                  calendarSynced: nextSynced,
                  googleCalendarEventId: nextEventId,
                  googleCalendarHtmlLink: nextHtmlLink,
                }
              : a
          )
        );
      }

      return { calendarUpdated, calendarError };
    },
    [appointments, user, isAdmin]
  );

  const updateAppointmentStatus = useCallback(
    async (id: string, status: AppointmentStatus, removeCalendarEvent = false) => {
      const target = appointments.find((a) => a.id === id);
      let nextSynced = target?.calendarSynced ?? false;
      let nextEventId = target?.googleCalendarEventId ?? '';
      let nextHtmlLink = target?.googleCalendarHtmlLink ?? '';

      if (status === 'cancelled' && removeCalendarEvent && target?.googleCalendarEventId) {
        const token = getGoogleAccessToken();
        if (token && (!user || target.ownerId === user.uid)) {
          try {
            await deleteGoogleCalendarEvent(token, target.googleCalendarEventId);
            nextSynced = false;
            nextEventId = '';
            nextHtmlLink = '';
          } catch (err) {
            console.error('Could not remove Google Calendar event:', err);
          }
        }
      }

      if (user) {
        const path = `appointments/${id}`;
        try {
          await updateDoc(doc(db, 'appointments', id), {
            status,
            calendarSynced: nextSynced,
            googleCalendarEventId: nextEventId,
            googleCalendarHtmlLink: nextHtmlLink,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      } else {
        setAppointments((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...a,
                  status,
                  calendarSynced: nextSynced,
                  googleCalendarEventId: nextEventId,
                  googleCalendarHtmlLink: nextHtmlLink,
                  updatedAt: new Date().toISOString(),
                }
              : a
          )
        );
      }
    },
    [appointments, user]
  );

  const markWhatsAppSent = useCallback(
    async (id: string) => {
      if (user) {
        const path = `appointments/${id}`;
        try {
          await updateDoc(doc(db, 'appointments', id), {
            whatsappSent: true,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      } else {
        setAppointments((prev) =>
          prev.map((a) =>
            a.id === id
              ? { ...a, whatsappSent: true, updatedAt: new Date().toISOString() }
              : a
          )
        );
      }
    },
    [user]
  );

  const toggleAppointmentReminder = useCallback(
    async (id: string, enabled: boolean) => {
      if (user) {
        const path = `appointments/${id}`;
        try {
          await updateDoc(doc(db, 'appointments', id), {
            reminderEnabled: enabled,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      } else {
        setAppointments((prev) =>
          prev.map((a) =>
            a.id === id
              ? { ...a, reminderEnabled: enabled, updatedAt: new Date().toISOString() }
              : a
          )
        );
      }
    },
    [user]
  );

  const deleteAppointment = useCallback(
    async (id: string, removeCalendarEvent = false) => {
      const target = appointments.find((a) => a.id === id);

      if (removeCalendarEvent && target?.googleCalendarEventId) {
        const token = getGoogleAccessToken();
        if (token && (!user || target.ownerId === user.uid)) {
          try {
            await deleteGoogleCalendarEvent(token, target.googleCalendarEventId);
          } catch (err) {
            console.error('Could not remove Google Calendar event on delete:', err);
          }
        }
      }

      if (user) {
        const path = `appointments/${id}`;
        try {
          await deleteDoc(doc(db, 'appointments', id));
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, path);
        }
      } else {
        setAppointments((prev) => prev.filter((a) => a.id !== id));
      }
    },
    [appointments, user]
  );

  const markOwnerSeen = useCallback(
    async (id: string) => {
      if (user && isAdmin) {
        const path = `appointments/${id}`;
        try {
          await updateDoc(doc(db, 'appointments', id), {
            ownerSeen: true,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      } else {
        setAppointments((prev) =>
          prev.map((a) =>
            a.id === id
              ? { ...a, ownerSeen: true, updatedAt: new Date().toISOString() }
              : a
          )
        );
      }
    },
    [user, isAdmin]
  );

  const markAllOwnerSeen = useCallback(async () => {
    const unseenIds = appointments.filter((a) => !a.ownerSeen).map((a) => a.id);
    if (unseenIds.length === 0) return;

    if (user && isAdmin) {
      await Promise.all(
        unseenIds.map(async (id) => {
          const path = `appointments/${id}`;
          try {
            await updateDoc(doc(db, 'appointments', id), {
              ownerSeen: true,
              updatedAt: serverTimestamp(),
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.UPDATE, path);
          }
        })
      );
    } else {
      setAppointments((prev) =>
        prev.map((a) =>
          a.ownerSeen ? a : { ...a, ownerSeen: true, updatedAt: new Date().toISOString() }
        )
      );
    }
  }, [appointments, user, isAdmin]);

  const updatePreferences = useCallback(
    async (
      patch: Partial<
        Pick<UserPreferences, 'pushEnabled' | 'defaultReminderMinutes' | 'calendarProvider'>
      >
    ) => {
      const next: UserPreferences = {
        ...preferences,
        ...patch,
        userId: user?.uid ?? 'demo_local',
        updatedAt: new Date().toISOString(),
      };
      setPreferences(next);

      if (user) {
        const path = `userPreferences/${user.uid}`;
        try {
          await setDoc(doc(db, 'userPreferences', user.uid), {
            userId: user.uid,
            pushEnabled: next.pushEnabled,
            defaultReminderMinutes: next.defaultReminderMinutes,
            calendarProvider: next.calendarProvider,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, path);
        }
      }
    },
    [preferences, user]
  );

  const enablePushNotifications = useCallback(async () => {
    const perm = await requestBrowserNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted' || perm === 'unsupported' || perm === 'default') {
      await updatePreferences({ pushEnabled: true });
    }
    return perm;
  }, [updatePreferences]);

  const triggerTestReminder = useCallback(() => {
    const nextUpcoming = upcomingReminders[0];
    const title = nextUpcoming
      ? `Lembrete Automático: ${nextUpcoming.serviceName}`
      : 'Lembrete Automático — Estúdio Claudia Rodrigues';
    const body = nextUpcoming
      ? `${nextUpcoming.clientName} · ${nextUpcoming.startTime} (${nextUpcoming.countdownLabel}). Contato: (64) 98448-0910.`
      : 'Notificações push ativas! Você receberá alertas antes de cada atendimento agendado.';

    sendBrowserNotification(title, body);
    setActiveToastReminder({ title, body });
  }, [upcomingReminders]);

  const triggerTestOwnerNotification = useCallback(() => {
    const latest = appointments.find((a) => a.status !== 'cancelled') ?? appointments[0];
    const title = latest
      ? `Novo agendamento: ${latest.serviceName}`
      : 'Novo agendamento recebido no Painel';
    const body = latest
      ? `${latest.clientName} · CPF ${latest.clientCpf} · ${formatDateToBR(
          latest.date
        )} às ${latest.startTime} · WhatsApp ${latest.clientPhone}`
      : 'Você será notificada imediatamente a cada novo agendamento feito pelas clientes.';

    sendBrowserNotification(title, body);
    setActiveToastReminder({ title, body });
  }, [appointments]);

  const dismissToastReminder = useCallback(() => {
    setActiveToastReminder(null);
  }, []);

  return {
    user,
    authReady,
    isAdmin,
    cloudSynced: Boolean(user),
    hasCalendarAccess,
    loading,
    authError,
    appointments,
    unreadBookingsCount,
    preferences,
    notificationPermission,
    upcomingReminders,
    activeToastReminder,
    dismissToastReminder,
    signInWithGoogle,
    signOutUser,
    createAppointment,
    syncAppointmentToGoogleCalendar,
    rescheduleAppointment,
    updateAppointmentStatus,
    markCalendarSynced,
    markWhatsAppSent,
    toggleAppointmentReminder,
    deleteAppointment,
    markOwnerSeen,
    markAllOwnerSeen,
    updatePreferences,
    enablePushNotifications,
    triggerTestReminder,
    triggerTestOwnerNotification,
  };
}
