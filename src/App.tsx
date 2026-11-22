import { useMemo, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ActiveTab, Header } from './components/Header';
import { HeroAndServices } from './components/HeroAndServices';
import { BookingWorkspace } from './components/BookingWorkspace';
import { AgendaAndReminders } from './components/AgendaAndReminders';
import { AdminPanel } from './components/AdminPanel';
import { AdminPanelLoginGate } from './components/AdminPanelLoginGate';
import { ProductivityReports } from './components/ProductivityReports';
import { ReminderToast } from './components/ReminderToast';
import { useStudioCloud } from './hooks/useStudioCloud';
import { useAdminPanelAuth } from './hooks/useAdminPanelAuth';
import { STUDIO_CONTACT, ServiceId } from './types/studio';
import {
  buildDirectWhatsAppUrl,
  getAvailableTimeSlots,
  getNextBookableDateISO,
} from './utils/scheduling';

function StudioApp() {
  const cloud = useStudioCloud();
  const panelAuth = useAdminPanelAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>('servicos');
  const [selectedServiceForBooking, setSelectedServiceForBooking] =
    useState<ServiceId>('brow-lamination');

  const nextBookableDate = useMemo(() => getNextBookableDateISO(), []);
  const nextDateSlots = useMemo(
    () => getAvailableTimeSlots(nextBookableDate, 60, cloud.appointments),
    [nextBookableDate, cloud.appointments]
  );

  const handleSelectServiceToBook = (serviceId: ServiceId) => {
    setSelectedServiceForBooking(serviceId);
    setActiveTab('agendar');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  const handleSelectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7F3] text-[#22261E]">
      <Header
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        user={cloud.user}
        panelAuthenticated={panelAuth.authenticated}
        unreadBookingsCount={cloud.unreadBookingsCount}
        onSignIn={cloud.signInWithGoogle}
        onSignOut={cloud.signOutUser}
      />

      {cloud.authError && (
        <div
          role="alert"
          className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4"
        >
          <p className="text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-4 py-2.5">
            {cloud.authError}
          </p>
        </div>
      )}

      <main className="flex-1 w-full">
        {activeTab === 'servicos' && (
          <HeroAndServices
            onSelectServiceToBook={handleSelectServiceToBook}
            onStartBooking={() => handleSelectTab('agendar')}
            onOpenAgenda={() => handleSelectTab('agenda')}
            onOpenReports={() => handleSelectTab('relatorios')}
            nextBookableDate={nextBookableDate}
            nextDateSlots={nextDateSlots}
          />
        )}

        {activeTab === 'agendar' && (
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
            <BookingWorkspace
              appointments={cloud.appointments}
              initialServiceId={selectedServiceForBooking}
              defaultReminderMinutes={cloud.preferences.defaultReminderMinutes}
              pushEnabled={cloud.preferences.pushEnabled}
              hasCalendarAccess={cloud.hasCalendarAccess}
              userEmail={cloud.user?.email ?? null}
              onSignIn={cloud.signInWithGoogle}
              onCreateAppointment={cloud.createAppointment}
              onSyncAppointmentToGoogleCalendar={cloud.syncAppointmentToGoogleCalendar}
              onMarkCalendarSynced={cloud.markCalendarSynced}
              onMarkWhatsAppSent={cloud.markWhatsAppSent}
              onNavigateToAgenda={() => handleSelectTab('agenda')}
            />
          </div>
        )}

        {activeTab === 'agenda' && (
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
            <AgendaAndReminders
              appointments={cloud.appointments}
              preferences={cloud.preferences}
              notificationPermission={cloud.notificationPermission}
              upcomingReminders={cloud.upcomingReminders}
              cloudSynced={cloud.cloudSynced}
              hasCalendarAccess={cloud.hasCalendarAccess}
              onUpdateStatus={cloud.updateAppointmentStatus}
              onSyncAppointmentToGoogleCalendar={cloud.syncAppointmentToGoogleCalendar}
              onMarkCalendarSynced={cloud.markCalendarSynced}
              onMarkWhatsAppSent={cloud.markWhatsAppSent}
              onToggleAppointmentReminder={cloud.toggleAppointmentReminder}
              onUpdatePreferences={cloud.updatePreferences}
              onEnablePushNotifications={cloud.enablePushNotifications}
              onTriggerTestReminder={cloud.triggerTestReminder}
              onGoToBooking={() => handleSelectTab('agendar')}
            />
          </div>
        )}

        {activeTab === 'painel' && (
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
            {panelAuth.authenticated ? (
              <AdminPanel
                user={cloud.user}
                isAdmin={cloud.isAdmin}
                cloudSynced={cloud.cloudSynced}
                hasCalendarAccess={cloud.hasCalendarAccess}
                appointments={cloud.appointments}
                unreadBookingsCount={cloud.unreadBookingsCount}
                notificationPermission={cloud.notificationPermission}
                pushEnabled={cloud.preferences.pushEnabled}
                onSignIn={cloud.signInWithGoogle}
                onRescheduleAppointment={cloud.rescheduleAppointment}
                onUpdateStatus={cloud.updateAppointmentStatus}
                onDeleteAppointment={cloud.deleteAppointment}
                onMarkOwnerSeen={cloud.markOwnerSeen}
                onMarkAllOwnerSeen={cloud.markAllOwnerSeen}
                onEnablePushNotifications={cloud.enablePushNotifications}
                onTriggerTestOwnerNotification={cloud.triggerTestOwnerNotification}
                adminUsername={panelAuth.adminUsername}
                onLogoutPanel={panelAuth.logoutAdmin}
              />
            ) : (
              <AdminPanelLoginGate auth={panelAuth} />
            )}
          </div>
        )}

        {activeTab === 'relatorios' && (
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8">
            <ProductivityReports appointments={cloud.appointments} />
          </div>
        )}
      </main>

      <footer className="border-t border-[#C6CF9E]/15 bg-[#242E1B] text-[#D2D8C8]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-9 grid grid-cols-1 md:grid-cols-3 items-start md:items-center gap-6 text-xs">
          <div className="space-y-1">
            <p className="font-display text-2xl font-medium text-[#F8F7F3] leading-tight">
              Pronta para Realçar seu Olhar
            </p>
            <p className="text-[#B8C2AA]">
              {STUDIO_CONTACT.professionalName} · Certificado Internacional · + de 4.000 alunas
            </p>
          </div>

          <div className="md:border-l md:border-[#C6CF9E]/15 md:pl-6 space-y-1">
            <p className="text-[#B8C2AA]">Atendimento e agendamentos oficiais</p>
            <a
              href={buildDirectWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block font-medium text-sm text-[#F8F7F3] hover:text-[#C6CF9E] transition-colors tabular-nums"
            >
              WhatsApp: {STUDIO_CONTACT.displayPhone}
            </a>
          </div>

          <div className="md:text-right space-y-1">
            <p className="text-[#F8F7F3] font-medium">Trabalho feito com amor</p>
            <p className="text-[#B8C2AA]">
              {cloud.cloudSynced
                ? 'Sincronizado na nuvem e Google Agenda'
                : 'Sincronização em nuvem e Google Agenda disponível'}
            </p>
          </div>
        </div>
      </footer>

      <ReminderToast
        reminder={cloud.activeToastReminder}
        onDismiss={cloud.dismissToastReminder}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <StudioApp />
    </ErrorBoundary>
  );
}
