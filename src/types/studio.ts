export type ServiceId =
  | 'brow-lamination'
  | 'maquiagem'
  | 'extensao-cilios'
  | 'lash-lifting';

export type AppointmentStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

export type ReminderLeadTime = 15 | 30 | 60 | 1440;

export type CalendarProvider = 'google' | 'apple' | 'outlook';

export interface StudioService {
  id: ServiceId;
  index: string;
  name: string;
  shortName: string;
  tagline: string;
  description: string;
  durationMinutes: number;
  price: number;
  maintenanceNote: string;
}

export interface Appointment {
  id: string;
  ownerId: string;
  clientName: string;
  clientCpf: string; // Formatted 000.000.000-00
  clientPhone: string;
  serviceId: ServiceId;
  serviceName: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  durationMinutes: number;
  price: number;
  status: AppointmentStatus;
  notes: string;
  reminderMinutesBefore: ReminderLeadTime;
  reminderEnabled: boolean;
  calendarSynced: boolean;
  googleCalendarEventId: string;
  googleCalendarHtmlLink: string;
  whatsappSent: boolean;
  ownerSeen: boolean;
  createdAt: string; // ISO string in UI state
  updatedAt: string; // ISO string in UI state
}

export interface UserPreferences {
  userId: string;
  pushEnabled: boolean;
  defaultReminderMinutes: ReminderLeadTime;
  calendarProvider: CalendarProvider;
  updatedAt: string;
}

export interface TimeSlot {
  time: string; // HH:mm
  period: 'manha' | 'tarde' | 'noite';
  available: boolean;
  reason?: string;
}

export interface BookingFormInput {
  clientName: string;
  clientCpf: string;
  clientPhone: string;
  serviceId: ServiceId;
  date: string;
  startTime: string;
  notes: string;
  reminderMinutesBefore: ReminderLeadTime;
  reminderEnabled: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof BookingFormInput, string>>;
}

export interface CalendarSyncResult {
  synced: boolean;
  eventId?: string;
  htmlLink?: string;
  error?: string;
}

export interface ServiceBreakdown {
  serviceId: ServiceId;
  serviceName: string;
  count: number;
  completedCount: number;
  revenue: number;
  projectedRevenue: number;
  hours: number;
  sharePercent: number;
}

export interface DailyBreakdown {
  date: string;
  dayLabel: string;
  appointmentsCount: number;
  completedCount: number;
  revenue: number;
  hours: number;
}

export interface MonthlyReport {
  yearMonth: string; // YYYY-MM
  monthLabel: string;
  totalScheduled: number;
  completedCount: number;
  confirmedCount: number;
  pendingCount: number;
  cancelledCount: number;
  completionRate: number;
  cancellationRate: number;
  realizedRevenue: number;
  projectedRevenue: number;
  productiveHours: number;
  occupancyRate: number;
  averageTicket: number;
  byService: ServiceBreakdown[];
  byDay: DailyBreakdown[];
}

export interface PushReminderAlert {
  id: string;
  appointmentId: string;
  clientName: string;
  serviceName: string;
  date: string;
  startTime: string;
  triggerAtIso: string;
  countdownLabel: string;
  isDueNow: boolean;
  leadMinutes: ReminderLeadTime;
}

export const STUDIO_CONTACT = {
  professionalName: 'Claudia Rodrigues',
  studioTitle: 'Claudia Rodrigues Studio',
  displayPhone: '(64) 98448-0910',
  e164Phone: '5564984480910',
  bannerImageUrl: 'https://i.postimg.cc/JhX7FdHf/Sem-titulo-1.png',
  bannerBackgroundUrl: 'https://i.postimg.cc/vDwG6Dwm/imagem-fundo.png',
  studioAboutImageUrl:
    'https://i.postimg.cc/q0Bkk2jn/Onde-Beleza-Encontra-Especialidade.webp',
  credentials: [
    'Certificado Internacional · Brasil & EUA',
    '+ de 4.000 alunas formadas',
    'Trabalho feito com amor',
  ],
} as const;

export const STUDIO_SERVICES: StudioService[] = [
  {
    id: 'brow-lamination',
    index: '01.',
    name: 'Design de Sobrancelhas / Brow Lamination',
    shortName: 'Design & Brow Lamination',
    tagline: 'Sobrancelhas mais alinhadas e volumosas',
    description:
      'Mapeamento facial estratégico combinado ao alinhamento dos fios para efeito natural, encorpado e simétrico.',
    durationMinutes: 60,
    price: 140,
    maintenanceNote: 'Durabilidade média de 4 a 6 semanas',
  },
  {
    id: 'maquiagem',
    index: '02.',
    name: 'Maquiagem',
    shortName: 'Maquiagem Social',
    tagline: 'Beleza para todas as ocasiões',
    description:
      'Preparação de pele de longa duração com acabamento sofisticado para eventos, ensaios e celebrações especiais.',
    durationMinutes: 90,
    price: 260,
    maintenanceNote: 'Inclui cílios postiços e blindagem de pele',
  },
  {
    id: 'extensao-cilios',
    index: '03.',
    name: 'Extensão de Cílios',
    shortName: 'Extensão de Cílios',
    tagline: 'Mais expressão para seu olhar',
    description:
      'Aplicação fio a fio e volume personalizado respeitando a saúde dos fios naturais para um olhar marcante.',
    durationMinutes: 120,
    price: 220,
    maintenanceNote: 'Manutenção recomendada a cada 15–21 dias',
  },
  {
    id: 'lash-lifting',
    index: '04.',
    name: 'Lash Lifting',
    shortName: 'Lash Lifting',
    tagline: 'Cílios naturais, levantados e poderosos',
    description:
      'Curvatura, hidratação e nutrição profunda dos seus próprios cílios, realçando o olhar sem extensão artificial.',
    durationMinutes: 60,
    price: 160,
    maintenanceNote: 'Efeito elevado por até 6 a 8 semanas',
  },
];

export const REMINDER_OPTIONS: { value: ReminderLeadTime; label: string }[] = [
  { value: 15, label: '15 minutos antes' },
  { value: 30, label: '30 minutos antes' },
  { value: 60, label: '1 hora antes' },
  { value: 1440, label: '24 horas antes' },
];

export function getServiceById(id: ServiceId): StudioService {
  return STUDIO_SERVICES.find((s) => s.id === id) ?? STUDIO_SERVICES[0];
}
