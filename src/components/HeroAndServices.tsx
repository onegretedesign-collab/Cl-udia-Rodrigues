import { useState } from 'react';
import {
  ArrowRight,
  Award,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Heart,
  Leaf,
  MessageCircle,
  ShieldCheck,
  Star,
} from 'lucide-react';
import {
  STUDIO_CONTACT,
  STUDIO_SERVICES,
  ServiceId,
  TimeSlot,
} from '../types/studio';
import {
  buildDirectWhatsAppUrl,
  formatCurrencyBRL,
  formatDateToBR,
} from '../utils/scheduling';

interface HeroAndServicesProps {
  onSelectServiceToBook: (serviceId: ServiceId) => void;
  onStartBooking: () => void;
  onOpenReports: () => void;
  onOpenAgenda: () => void;
  nextBookableDate: string;
  nextDateSlots: TimeSlot[];
}

const SERVICE_VISUALS: Record<
  ServiceId,
  { src: string; imgClass: string; backdropClass: string }
> = {
  'brow-lamination': {
    src: 'https://i.postimg.cc/LR4HHjNP/Design-Brow-Lamination.webp',
    imgClass: 'w-full h-full object-cover object-center',
    backdropClass: 'bg-[#F5EFE8]',
  },
  maquiagem: {
    src: 'https://i.postimg.cc/37rKK2nX/Maquiagem-Social.webp',
    imgClass: 'w-full h-full object-cover object-center',
    backdropClass: 'bg-[#F5EFE8]',
  },
  'extensao-cilios': {
    src: 'https://i.postimg.cc/X3NVV9Qw/Extensao-de-Cilios.webp',
    imgClass: 'w-full h-full object-cover object-center',
    backdropClass: 'bg-[#F5EFE8]',
  },
  'lash-lifting': {
    src: 'https://i.postimg.cc/4Z4JJpBV/Lash-Lifting.webp',
    imgClass: 'w-full h-full object-cover object-center',
    backdropClass: 'bg-[#F5EFE8]',
  },
};

const ABOUT_HIGHLIGHTS = [
  'Horários disponíveis atualizados em tempo real por duração',
  'Lembretes automáticos via notificações push antes do horário',
  'Sincronização com Google Calendar, Outlook e Apple (.ics)',
  'Relatórios mensais de produtividade salvos na nuvem Firebase',
];

const CLIENT_TESTIMONIALS = [
  {
    id: 'dep-1',
    name: 'Beatriz Almeida',
    service: 'Extensão de Cílios',
    initials: 'BA',
    quote:
      'Amei a praticidade de escolher meu horário online e receber o lembrete automático antes do atendimento. O resultado ficou leve e impecável.',
  },
  {
    id: 'dep-2',
    name: 'Juliana Mendes',
    service: 'Maquiagem',
    initials: 'JM',
    quote:
      'Maquiagem de longa duração e atendimento extremamente pontual. Sincronizei direto no meu Google Calendar e confirmei tudo pelo WhatsApp.',
  },
  {
    id: 'dep-3',
    name: 'Camila Ferreira',
    service: 'Design & Brow Lamination',
    initials: 'CF',
    quote:
      'Ambiente acolhedor e técnica internacional que faz toda a diferença no desenho das sobrancelhas. Recomendo de olhos fechados!',
  },
];

function BotanicalLeafOrnament() {
  return (
    <div className="flex items-center justify-center gap-2 mt-2.5 text-[#7D5A46]" aria-hidden="true">
      <span className="h-px w-8 bg-[#CEBFB0]" />
      <Leaf className="w-4 h-4" />
      <span className="h-px w-8 bg-[#CEBFB0]" />
    </div>
  );
}

export function HeroAndServices({
  onSelectServiceToBook,
  onStartBooking,
  onOpenReports,
  onOpenAgenda,
  nextBookableDate,
  nextDateSlots,
}: HeroAndServicesProps) {
  const [heroImgError, setHeroImgError] = useState(false);

  const availableSlots = nextDateSlots.filter((slot) => slot.available);

  const scrollToServices = () => {
    const target = document.getElementById('servicos-estudio');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div id="inicio" className="w-full bg-[#FAF7F3] text-[#261C17]">
      {/* SECTION 1: Deep Espresso Editorial Hero Banner */}
      <section className="botanical-hero-bg relative overflow-hidden text-[#FAF7F3]">
        {/* Translucent background motif alongside texts & behind Claudia portrait */}
        <div
          aria-hidden="true"
          className="pointer-events-none select-none absolute inset-0 z-0 overflow-hidden"
        >
          <img
            src={STUDIO_CONTACT.bannerBackgroundUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="absolute inset-y-0 left-1/2 -translate-x-1/2 lg:left-[38%] lg:translate-x-0 h-full w-auto max-w-none object-contain object-center opacity-30 sm:opacity-35 lg:opacity-40 [mask-image:linear-gradient(to_right,transparent_0%,black_18%,black_84%,transparent_100%)]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#1A120E]/92 via-[#281B15]/58 to-[#1A120E]/35" />
          <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#1A120E]/85 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 lg:pt-16 pb-16 sm:pb-20 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-end">
            {/* Left Typography & Dual Action Buttons (Exact Reference Layout) */}
            <div className="lg:col-span-7 pb-4 lg:pb-8">
              <p className="font-display italic text-lg sm:text-xl text-[#DEC4A6] mb-3">
                Beleza Natural, Cuidado Autoral
              </p>

              <h1 className="font-display text-5xl sm:text-6xl lg:text-[68px] font-semibold leading-[1.02] tracking-tight text-[#FAF7F3] mb-5 max-w-xl">
                Beleza que Reflete{' '}
                <span className="italic font-normal text-[#DEC4A6]">o Seu Olhar</span>
              </h1>

              <p className="text-sm sm:text-base text-[#E5D7C8] leading-relaxed max-w-lg mb-8">
                Agende Design de Sobrancelhas, Brow Lamination, Maquiagem, Extensão de Cílios e
                Lash Lifting com horários livres em tempo real, lembretes push automáticos e
                confirmação direta em{' '}
                <span className="font-medium text-[#FAF7F3] tabular-nums whitespace-nowrap">
                  {STUDIO_CONTACT.displayPhone}
                </span>
                .
              </p>

              <div className="flex flex-wrap items-center gap-3.5">
                <button
                  type="button"
                  onClick={onStartBooking}
                  className="inline-flex items-center justify-center gap-2.5 px-6 py-3 text-sm font-medium text-[#FAF7F3] bg-[#6F4C3A] rounded-lg hover:bg-[#825A45] transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Agendar Horário</span>
                  <Calendar className="w-4 h-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={scrollToServices}
                  className="inline-flex items-center justify-center gap-2.5 px-6 py-3 text-sm font-medium text-[#FAF7F3] border border-[#FAF7F3]/40 bg-black/25 rounded-lg hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
                >
                  <span>Explorar Serviços</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Right Portrait of Claudia Rodrigues */}
            <div className="lg:col-span-5 flex justify-center lg:justify-end items-end -mb-16 sm:-mb-20 lg:-mb-24">
              {heroImgError ? (
                <div className="w-full max-w-[380px] h-[420px] rounded-t-2xl bg-[#2A1D17] border border-[#DEC4A6]/20 flex flex-col items-center justify-center p-8 text-center">
                  <p className="font-display text-3xl font-semibold text-[#FAF7F3]">
                    Claudia Rodrigues
                  </p>
                  <p className="text-xs text-[#DEC4A6] mt-2">{STUDIO_CONTACT.displayPhone}</p>
                </div>
              ) : (
                <img
                  src={STUDIO_CONTACT.bannerImageUrl}
                  alt="Claudia Rodrigues — Especialista em Design de Sobrancelhas, Brow Lamination, Maquiagem, Extensão de Cílios e Lash Lifting"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgError(true)}
                  className="w-full max-w-[380px] sm:max-w-[420px] lg:max-w-[445px] h-auto object-contain object-bottom drop-shadow-[0_18px_36px_rgba(0,0,0,0.55)] select-none"
                />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* OVERLAPPING COCOA-BROWN 4-COLUMN TRUST BAR */}
      <div className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10">
        <div className="bg-[#634433] text-[#FAF7F3] rounded-2xl px-6 py-5 sm:px-8 sm:py-6 shadow-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 border border-[#7B5744]">
          <div className="flex items-center gap-3.5">
            <Award className="w-6 h-6 text-[#EFE0CE] shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold leading-snug">Certificado Internacional</p>
              <p className="text-xs text-[#F1E6DA]">Brasil &amp; EUA · +4.000 alunas</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <Bell className="w-6 h-6 text-[#EFE0CE] shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold leading-snug">Lembretes Automáticos</p>
              <p className="text-xs text-[#F1E6DA]">Notificações push programadas</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <ShieldCheck className="w-6 h-6 text-[#EFE0CE] shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold leading-snug">Calendário Sincronizado</p>
              <p className="text-xs text-[#F1E6DA]">Google, Outlook, Apple (.ics)</p>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            <Heart className="w-6 h-6 text-[#EFE0CE] shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold leading-snug">Trabalho Feito com Amor</p>
              <p className="text-xs text-[#F1E6DA] tabular-nums">{STUDIO_CONTACT.displayPhone}</p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: OUR SERVICES — "Beleza e Cuidado em Um Só Lugar" */}
      <section
        id="servicos-estudio"
        aria-labelledby="servicos-heading"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20 pb-16"
      >
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-medium tracking-widest text-[#7D5A46]">
            Nossos Serviços
          </p>
          <h2
            id="servicos-heading"
            className="font-display text-3xl sm:text-4xl lg:text-[44px] font-semibold text-[#261C17] mt-1.5 leading-tight"
          >
            Beleza &amp; Cuidado, Tudo em Um Só Lugar
          </h2>
          <BotanicalLeafOrnament />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STUDIO_SERVICES.map((service) => {
            const visual = SERVICE_VISUALS[service.id];
            return (
              <article
                key={service.id}
                className="bg-white border border-[#E6DDD3] rounded-2xl overflow-hidden flex flex-col justify-between shadow-xs hover:shadow-md hover:border-[#CEBFB0] transition-all"
              >
                <div>
                  {/* Square Editorial Visual Top (preserves full artwork without clipping) */}
                  <div className={`relative aspect-square overflow-hidden ${visual.backdropClass}`}>
                    <img
                      src={visual.src}
                      alt={service.name}
                      referrerPolicy="no-referrer"
                      className={visual.imgClass}
                    />
                  </div>

                  {/* Signature Center Leaf Medallion on image/content boundary */}
                  <div className="relative -mt-4 flex justify-center">
                    <div
                      aria-hidden="true"
                      className="w-8 h-8 rounded-full bg-white border border-[#E6DDD3] flex items-center justify-center text-[#7D5A46] shadow-xs"
                    >
                      <Leaf className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* Clean Centered Editorial Metadata */}
                  <div className="px-5 pt-3 pb-4 text-center space-y-2">
                    <h3 className="font-display text-2xl font-semibold text-[#261C17] leading-snug">
                      {service.shortName}
                    </h3>
                    <p className="text-xs font-mono text-[#7D5A46] tabular-nums">
                      {service.durationMinutes} min · {formatCurrencyBRL(service.price)}
                    </p>
                    <p className="text-xs text-[#6B5B51] leading-relaxed">
                      {service.tagline}. {service.maintenanceNote}.
                    </p>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-2">
                  <button
                    type="button"
                    aria-label={`Agendar ${service.name}`}
                    onClick={() => onSelectServiceToBook(service.id)}
                    className="w-full py-2.5 px-4 text-xs font-medium text-[#5A3D2E] bg-[#F5EFE8] border border-[#E6DDD3] rounded-lg hover:bg-[#5A3D2E] hover:text-[#FAF7F3] hover:border-[#5A3D2E] transition-colors inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <span>Agendar este serviço</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="text-center mt-10">
          <button
            type="button"
            onClick={onStartBooking}
            className="inline-flex items-center justify-center gap-2 px-7 py-3 text-sm font-medium text-[#FAF7F3] bg-[#5A3D2E] rounded-lg hover:bg-[#6F4C3A] transition-colors whitespace-nowrap"
          >
            <span>Ver Todos os Horários</span>
            <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* SECTION 3: ABOUT US — "Onde Beleza Encontra Especialidade" + Live Schedule Preview */}
      <section className="relative overflow-hidden py-14 sm:py-20 border-t border-[#ECE4DB]">
        {/* Delicate Botanical Branch Silhouette on Right Margin */}
        <svg
          aria-hidden="true"
          viewBox="0 0 220 340"
          fill="none"
          className="pointer-events-none hidden lg:block absolute right-0 top-10 w-52 h-auto text-[#E4D8CC] opacity-70"
        >
          <path
            d="M210 330C165 250 155 155 190 20"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d="M174 125C130 112 96 86 78 52C120 56 154 80 174 125Z"
            fill="currentColor"
          />
          <path
            d="M168 195C118 188 76 164 52 128C98 128 142 152 168 195Z"
            fill="currentColor"
          />
          <path
            d="M180 265C138 262 102 246 82 216C122 215 158 232 180 265Z"
            fill="currentColor"
          />
        </svg>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Rounded Studio Visual + Interactive Live Slots Card */}
            <div className="lg:col-span-6">
              <div className="rounded-2xl overflow-hidden bg-[#2A1D17] border border-[#4E372B] shadow-md">
                <div className="relative aspect-[4/3] overflow-hidden bg-[#F5EFE8]">
                  <img
                    src={STUDIO_CONTACT.studioAboutImageUrl}
                    alt="Onde Beleza Encontra Especialidade — Estúdio Claudia Rodrigues"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover object-center"
                  />
                </div>

                {/* Live Available Time Slots Strip */}
                <div className="p-5 sm:p-6 bg-[#1E1511] text-[#FAF7F3] space-y-3.5 border-t border-[#DEC4A6]/15">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-[#E5D7C8] font-medium">
                      <Clock className="w-3.5 h-3.5 text-[#DEC4A6]" aria-hidden="true" />
                      Horários livres · {formatDateToBR(nextBookableDate)}
                    </span>
                    <span className="font-mono text-[#DEC4A6] tabular-nums">
                      {availableSlots.length} vagas
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2">
                    {availableSlots.slice(0, 8).map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={onStartBooking}
                        aria-label={`Reservar horário das ${slot.time} em ${formatDateToBR(nextBookableDate)}`}
                        className="py-2 text-xs font-mono tabular-nums text-[#FAF7F3] bg-[#37261E] border border-[#5A3D2E] rounded-lg hover:bg-[#DEC4A6] hover:text-[#1E1511] hover:border-[#DEC4A6] transition-colors"
                      >
                        {slot.time}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Editorial Bio & 4 Checkmark Highlights */}
            <div className="lg:col-span-6 space-y-5">
              <p className="text-xs font-medium tracking-widest text-[#7D5A46]">
                Sobre o Estúdio
              </p>
              <h2 className="font-display text-3xl sm:text-4xl lg:text-[44px] font-semibold text-[#261C17] leading-tight">
                Onde Beleza Encontra Especialidade
              </h2>
              <p className="text-sm sm:text-base text-[#6B5B51] leading-relaxed">
                No estúdio de <strong>Claudia Rodrigues</strong>, acreditamos que cada detalhe
                importa. Com certificação internacional (Brasil &amp; EUA) e mais de 4.000 alunas
                formadas, unimos técnicas autorais a um aplicativo de agendamento moderno e
                sincronizado na nuvem.
              </p>

              <ul className="space-y-3 pt-1">
                {ABOUT_HIGHLIGHTS.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-sm text-[#3A2B23]"
                  >
                    <CheckCircle2
                      className="w-4 h-4 text-[#7D5A46] mt-0.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-3 flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={onOpenAgenda}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium text-[#FAF7F3] bg-[#5A3D2E] rounded-lg hover:bg-[#6F4C3A] transition-colors whitespace-nowrap"
                >
                  <span>Agenda e Lembretes Push</span>
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={onOpenReports}
                  className="text-sm font-medium text-[#5A3D2E] hover:text-[#261C17] underline underline-offset-4 transition-colors whitespace-nowrap"
                >
                  Ver Relatórios Mensais
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: FULL-WIDTH SOFT LINEN ACTION BANNER */}
      <section className="botanical-linen-bg relative overflow-hidden border-y border-[#E6DDD3]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
          <p className="text-xs font-medium tracking-widest text-[#7D5A46]">
            Agendamento Direto
          </p>
          <h2 className="font-display text-4xl sm:text-5xl font-semibold text-[#261C17] mt-1.5 leading-tight">
            Reserve Seu Horário Hoje
          </h2>
          <p className="text-sm sm:text-base text-[#6B5B51] mt-2.5 max-w-xl mx-auto">
            Escolha seu procedimento, selecione o melhor horário e envie sua solicitação
            diretamente para o contato oficial do estúdio.
          </p>

          <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              type="button"
              onClick={onStartBooking}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-9 py-4 text-base font-semibold text-[#FAF7F3] bg-[#5A3D2E] rounded-xl hover:bg-[#6F4C3A] transition-colors shadow-xs whitespace-nowrap"
            >
              <span>Agendar Agora</span>
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </button>

            <a
              href={buildDirectWhatsAppUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-4 text-base font-semibold text-[#3A2B23] bg-white/85 border border-[#CEBFB0] rounded-xl hover:bg-white hover:border-[#5A3D2E] transition-colors whitespace-nowrap tabular-nums"
            >
              <MessageCircle className="w-5 h-5 text-[#5A3D2E]" aria-hidden="true" />
              <span>WhatsApp {STUDIO_CONTACT.displayPhone}</span>
            </a>
          </div>
        </div>
      </section>

      {/* SECTION 5: CLIENT LOVE — "O Que Nossas Clientes Dizem" */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs font-medium tracking-widest text-[#7D5A46]">
            Carinho das Clientes
          </p>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-[42px] font-semibold text-[#261C17] mt-1.5">
            O Que Nossas Clientes Dizem
          </h2>
          <BotanicalLeafOrnament />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {CLIENT_TESTIMONIALS.map((item) => (
            <article
              key={item.id}
              className="bg-white border border-[#E6DDD3] rounded-2xl p-6 flex flex-col justify-between shadow-xs"
            >
              <div>
                <div
                  className="flex items-center gap-0.5 text-[#D9A338] mb-3.5"
                  aria-label="Avaliação 5 de 5 estrelas"
                >
                  {[0, 1, 2, 3, 4].map((star) => (
                    <Star
                      key={star}
                      className="w-3.5 h-3.5 fill-current"
                      aria-hidden="true"
                    />
                  ))}
                </div>
                <p className="text-sm text-[#54443B] leading-relaxed mb-5">
                  &ldquo;{item.quote}&rdquo;
                </p>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-[#F2EBE3]">
                <div
                  aria-hidden="true"
                  className="w-9 h-9 rounded-full bg-[#F1EAE2] border border-[#D8CCC0] text-[#5A3D2E] text-xs font-semibold flex items-center justify-center shrink-0"
                >
                  {item.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#261C17] leading-tight">
                    {item.name}
                  </p>
                  <p className="text-xs text-[#6B5B51]">{item.service}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
