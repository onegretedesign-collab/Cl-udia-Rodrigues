import React, { useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { AdminPanelAuthState } from '../hooks/useAdminPanelAuth';
import { STUDIO_CONTACT } from '../types/studio';

interface AdminPanelLoginGateProps {
  auth: AdminPanelAuthState;
}

export function AdminPanelLoginGate({ auth }: AdminPanelLoginGateProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const isFirstRunSetup = !auth.statusLoading && !auth.configured;
  const displayedError = localError ?? auth.error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    auth.clearError();

    const trimmedUser = username.trim();
    if (trimmedUser.length < 2) {
      setLocalError('Informe seu login (mínimo 2 caracteres).');
      return;
    }

    if (password.length < 6) {
      setLocalError('Informe uma senha com pelo menos 6 caracteres.');
      return;
    }

    if (isFirstRunSetup) {
      if (password !== confirmPassword) {
        setLocalError('A confirmação de senha não confere.');
        return;
      }
      const ok = await auth.setupAdmin(trimmedUser, password);
      if (ok) {
        setPassword('');
        setConfirmPassword('');
      }
      return;
    }

    const ok = await auth.loginAdmin(trimmedUser, password);
    if (ok) {
      setPassword('');
    }
  };

  return (
    <section
      aria-labelledby="admin-login-heading"
      className="py-12 sm:py-16 flex items-center justify-center"
    >
      <div className="w-full max-w-md bg-white border border-[#E5E2D9] rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
        <div className="space-y-2 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#EFECE4] text-[#3B492D] inline-flex items-center justify-center mx-auto">
            {isFirstRunSetup ? (
              <ShieldCheck className="w-6 h-6" aria-hidden="true" />
            ) : (
              <Lock className="w-5 h-5" aria-hidden="true" />
            )}
          </div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#596649]">
            Área Exclusiva · {STUDIO_CONTACT.professionalName}
          </p>
          <h1
            id="admin-login-heading"
            className="font-display text-3xl font-semibold text-[#22261E] tracking-tight"
          >
            {isFirstRunSetup ? 'Configurar Acesso do Painel' : 'Acesso ao Painel'}
          </h1>
          <p className="text-sm text-[#64695E] leading-relaxed">
            {isFirstRunSetup
              ? 'Defina abaixo seu login e senha exclusivos para proteger os dados das clientes no painel do estúdio.'
              : 'Entre com seu login e senha administrativos para visualizar agendamentos, reagendar, desmarcar ou excluir horários.'}
          </p>
        </div>

        {auth.statusLoading ? (
          <div className="py-8 text-center text-sm text-[#64695E]">
            Verificando proteção do painel...
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-4">
            <div>
              <label
                htmlFor="admin-login-username"
                className="block text-xs font-medium text-[#22261E] mb-1.5"
              >
                Login
              </label>
              <input
                id="admin-login-username"
                name="username"
                type="text"
                autoComplete="username"
                required
                maxLength={64}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setLocalError(null);
                  auth.clearError();
                }}
                placeholder="Digite seu login"
                className="w-full h-11 px-3.5 text-sm bg-[#F8F7F3] border border-[#D8D5CA] rounded-lg text-[#22261E] placeholder:text-[#8C9184] focus:bg-white focus:border-[#3B492D]"
              />
            </div>

            <div>
              <label
                htmlFor="admin-login-password"
                className="block text-xs font-medium text-[#22261E] mb-1.5"
              >
                Senha
              </label>
              <div className="relative">
                <input
                  id="admin-login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isFirstRunSetup ? 'new-password' : 'current-password'}
                  required
                  maxLength={128}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setLocalError(null);
                    auth.clearError();
                  }}
                  placeholder="Digite sua senha"
                  className="w-full h-11 pl-3.5 pr-11 text-sm bg-[#F8F7F3] border border-[#D8D5CA] rounded-lg text-[#22261E] placeholder:text-[#8C9184] focus:bg-white focus:border-[#3B492D]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center text-[#64695E] hover:text-[#22261E] rounded-md"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            {isFirstRunSetup && (
              <div>
                <label
                  htmlFor="admin-login-confirm-password"
                  className="block text-xs font-medium text-[#22261E] mb-1.5"
                >
                  Confirmar senha
                </label>
                <input
                  id="admin-login-confirm-password"
                  name="confirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  maxLength={128}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setLocalError(null);
                    auth.clearError();
                  }}
                  placeholder="Repita a senha"
                  className="w-full h-11 px-3.5 text-sm bg-[#F8F7F3] border border-[#D8D5CA] rounded-lg text-[#22261E] placeholder:text-[#8C9184] focus:bg-white focus:border-[#3B492D]"
                />
              </div>
            )}

            {displayedError && (
              <p
                role="alert"
                className="text-xs font-medium text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg px-3.5 py-2.5"
              >
                {displayedError}
              </p>
            )}

            <button
              type="submit"
              disabled={auth.submitting}
              className="w-full h-11 inline-flex items-center justify-center gap-2 px-5 text-sm font-medium text-[#F8F7F3] bg-[#3B492D] rounded-lg hover:bg-[#4A5A38] disabled:opacity-60 transition-colors"
            >
              <Lock className="w-4 h-4" aria-hidden="true" />
              <span>
                {auth.submitting
                  ? 'Verificando...'
                  : isFirstRunSetup
                  ? 'Salvar Acesso e Entrar no Painel'
                  : 'Entrar no Painel'}
              </span>
            </button>

            <p className="text-[11px] text-[#73786C] text-center leading-relaxed pt-1">
              {isFirstRunSetup
                ? 'A senha é protegida com criptografia no servidor e não fica salva no navegador.'
                : 'Acesso exclusivo da administradora. As credenciais são validadas somente no servidor.'}
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
