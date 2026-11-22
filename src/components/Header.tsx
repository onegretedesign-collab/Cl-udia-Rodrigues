import { useState } from 'react';
import { Lock, LogOut, Menu, X } from 'lucide-react';
import { User } from 'firebase/auth';
import { GoogleSignInButton } from './GoogleSignInButton';

export type ActiveTab = 'servicos' | 'agendar' | 'agenda' | 'painel' | 'relatorios';

interface HeaderProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  user: User | null;
  panelAuthenticated: boolean;
  unreadBookingsCount: number;
  onSignIn: () => Promise<boolean>;
  onSignOut: () => Promise<void>;
}

const NAV_ITEMS: { id: ActiveTab; label: string }[] = [
  { id: 'servicos', label: 'Serviços' },
  { id: 'agendar', label: 'Agendar' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'painel', label: 'Painel' },
  { id: 'relatorios', label: 'Relatórios' },
];

export function Header({
  activeTab,
  onSelectTab,
  user,
  panelAuthenticated,
  unreadBookingsCount,
  onSignIn,
  onSignOut,
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleNavClick = (tab: ActiveTab) => {
    onSelectTab(tab);
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#1A2015]/95 backdrop-blur-md border-b border-[#C6CF9E]/15">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
        {/* Zone 1: Single-element Brand wordmark */}
        <a
          href="#inicio"
          onClick={(e) => {
            e.preventDefault();
            handleNavClick('servicos');
          }}
          className="font-display text-2xl sm:text-[26px] font-semibold tracking-tight text-[#F8F7F3] whitespace-nowrap shrink-0"
        >
          Claudia Rodrigues
        </a>

        {/* Zone 2: 5 clean single-line text nav links */}
        <nav aria-label="Navegação principal" className="hidden md:flex items-center gap-7">
          {NAV_ITEMS.map((item) => {
            const isActive = activeTab === item.id;
            const showUnread =
              item.id === 'painel' && panelAuthenticated && unreadBookingsCount > 0;
            const showLock = item.id === 'painel' && !panelAuthenticated;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavClick(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`py-1 text-sm font-medium whitespace-nowrap shrink-0 transition-colors border-b-2 inline-flex items-center gap-1.5 ${
                  isActive
                    ? 'text-[#F8F7F3] border-[#C6CF9E]'
                    : 'text-[#C8CEC0] border-transparent hover:text-[#F8F7F3] hover:border-[#C6CF9E]/50'
                }`}
              >
                {showLock && <Lock className="w-3.5 h-3.5 text-[#C6CF9E]/80" aria-hidden="true" />}
                <span>{item.label}</span>
                {showUnread && (
                  <span
                    aria-label={`${unreadBookingsCount} novos agendamentos`}
                    className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold tabular-nums rounded-full bg-[#C6CF9E] text-[#1A2015]"
                  >
                    {unreadBookingsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Official Google Sign-In button or user sign-out + mobile drawer toggle */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => void onSignOut()}
              aria-label={`Sair da conta ${user.displayName ?? user.email ?? ''}`}
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-[#F8F7F3] bg-[#2D3822] border border-[#C6CF9E]/30 rounded-lg hover:bg-[#3B492D] transition-colors whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 text-[#C6CF9E]" aria-hidden="true" />
              <span className="max-w-[130px] truncate">{user.displayName ?? 'Conta Google'}</span>
            </button>
          ) : (
            <div className="hidden sm:block">
              <GoogleSignInButton
                onClick={() => void onSignIn()}
                label="Entrar com Google"
                size="sm"
              />
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileMenuOpen}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-lg text-[#F8F7F3] hover:bg-[#2D3822] transition-colors"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Menu className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile navigation drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[#C6CF9E]/15 bg-[#1A2015] px-4 py-4 space-y-2">
          <nav aria-label="Navegação móvel" className="flex flex-col space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              const showUnread =
                item.id === 'painel' && panelAuthenticated && unreadBookingsCount > 0;
              const showLock = item.id === 'painel' && !panelAuthenticated;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`w-full text-left px-3 py-3 text-sm font-medium rounded-lg transition-colors flex items-center justify-between ${
                    isActive
                      ? 'bg-[#4A5A38] text-[#F8F7F3] font-semibold'
                      : 'text-[#F8F7F3] hover:bg-[#2D3822]'
                  }`}
                >
                  <span className="inline-flex items-center gap-2">
                    {showLock && (
                      <Lock className="w-3.5 h-3.5 text-[#C6CF9E]/80" aria-hidden="true" />
                    )}
                    <span>{item.label}</span>
                  </span>
                  {showUnread && (
                    <span className="inline-flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-[11px] font-semibold tabular-nums rounded-full bg-[#C6CF9E] text-[#1A2015]">
                      {unreadBookingsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          <div className="pt-2 border-t border-[#C6CF9E]/15">
            {user ? (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void onSignOut();
                }}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-[#F8F7F3] bg-[#2D3822] rounded-lg"
              >
                <LogOut className="w-4 h-4 text-[#C6CF9E]" aria-hidden="true" />
                <span>Sair ({user.displayName ?? user.email})</span>
              </button>
            ) : (
              <GoogleSignInButton
                onClick={() => {
                  setMobileMenuOpen(false);
                  void onSignIn();
                }}
                label="Entrar com Google"
                size="md"
                fullWidth
              />
            )}
          </div>
        </div>
      )}
    </header>
  );
}
