import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, FileJson, Printer } from 'lucide-react';
import { Appointment } from '../types/studio';
import {
  calculateMonthlyReport,
  exportReportToCSV,
  exportReportToJSON,
  getAvailableMonths,
} from '../utils/reports';
import { formatCurrencyBRL, formatDateToBR } from '../utils/scheduling';
import { triggerFileDownload } from '../utils/calendarSync';

interface ProductivityReportsProps {
  appointments: Appointment[];
}

export function ProductivityReports({ appointments }: ProductivityReportsProps) {
  const availableMonths = useMemo(() => getAvailableMonths(appointments), [appointments]);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    () => availableMonths[0]?.value ?? new Date().toISOString().slice(0, 7)
  );
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const report = useMemo(
    () => calculateMonthlyReport(appointments, selectedMonth),
    [appointments, selectedMonth]
  );

  const handleExportCSV = () => {
    const csv = exportReportToCSV(report, appointments);
    triggerFileDownload(
      `relatorio-produtividade-claudia-rodrigues-${report.yearMonth}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
    setExportStatus(`CSV de ${report.monthLabel} exportado com sucesso.`);
    window.setTimeout(() => setExportStatus(null), 3500);
  };

  const handleExportJSON = () => {
    const json = exportReportToJSON(report, appointments);
    triggerFileDownload(
      `relatorio-produtividade-claudia-rodrigues-${report.yearMonth}.json`,
      json,
      'application/json;charset=utf-8'
    );
    setExportStatus(`JSON de ${report.monthLabel} exportado com sucesso.`);
    window.setTimeout(() => setExportStatus(null), 3500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <section aria-labelledby="relatorios-heading" className="py-8 sm:py-10 space-y-8">
      {/* Header & Export Toolbar */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 border-b border-[#E6DDD3] pb-6">
        <div className="max-w-xl">
          <h1
            id="relatorios-heading"
            className="font-display text-3xl sm:text-4xl font-semibold text-[#261C17] tracking-tight"
          >
            Relatório Mensal de Produtividade
          </h1>
          <p className="text-sm sm:text-base text-[#6B5B51] mt-2">
            Acompanhe volume de atendimentos, receita, horas produtivas e desempenho por serviço
            com exportação imediata.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0 no-print">
          <label htmlFor="report-month-select" className="sr-only">
            Selecionar mês do relatório
          </label>
          <select
            id="report-month-select"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="h-10 px-3.5 text-sm font-medium bg-white border border-[#D8CCC0] rounded-lg text-[#261C17] shrink-0"
          >
            {availableMonths.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 h-10 px-4 text-xs font-medium text-[#FAF7F3] bg-[#5A3D2E] rounded-lg hover:bg-[#6F4C3A] transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Exportar CSV</span>
          </button>

          <button
            type="button"
            onClick={handleExportJSON}
            className="inline-flex items-center gap-1.5 h-10 px-4 text-xs font-medium text-[#261C17] bg-white border border-[#D8CCC0] rounded-lg hover:bg-[#F1EAE2] transition-colors whitespace-nowrap shrink-0"
          >
            <FileJson className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Exportar JSON</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 h-10 px-4 text-xs font-medium text-[#261C17] bg-white border border-[#D8CCC0] rounded-lg hover:bg-[#F1EAE2] transition-colors whitespace-nowrap shrink-0"
          >
            <Printer className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Imprimir / PDF</span>
          </button>
        </div>
      </div>

      {exportStatus && (
        <p
          role="status"
          className="text-xs font-medium text-[#15803D] bg-[#F0FDF4] border border-[#BBF7D0] rounded-lg px-4 py-2.5"
        >
          {exportStatus}
        </p>
      )}

      {/* 4-Column Tabular KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white border border-[#E6DDD3] rounded-xl p-5">
          <p className="text-xs text-[#6B5B51]">Atendimentos em {report.monthLabel}</p>
          <p className="font-mono text-3xl font-medium text-[#261C17] mt-2 tabular-nums">
            {report.totalScheduled}
          </p>
          <p className="text-xs text-[#6B5B51] mt-2 tabular-nums">
            {report.completedCount} concluídos · {report.confirmedCount + report.pendingCount}{' '}
            ativos · {report.cancelledCount} cancelados
          </p>
        </div>

        <div className="bg-white border border-[#E6DDD3] rounded-xl p-5">
          <p className="text-xs text-[#6B5B51]">Receita Prevista no Mês</p>
          <p className="font-mono text-3xl font-medium text-[#261C17] mt-2 tabular-nums">
            {formatCurrencyBRL(report.projectedRevenue)}
          </p>
          <p className="text-xs text-[#6B5B51] mt-2 tabular-nums">
            Realizada: {formatCurrencyBRL(report.realizedRevenue)}
          </p>
        </div>

        <div className="bg-white border border-[#E6DDD3] rounded-xl p-5">
          <p className="text-xs text-[#6B5B51]">Horas Produtivas</p>
          <p className="font-mono text-3xl font-medium text-[#261C17] mt-2 tabular-nums">
            {report.productiveHours.toFixed(1)}h
          </p>
          <p className="text-xs text-[#6B5B51] mt-2 tabular-nums">
            Taxa de ocupação mensal: {report.occupancyRate.toFixed(1)}%
          </p>
        </div>

        <div className="bg-white border border-[#E6DDD3] rounded-xl p-5">
          <p className="text-xs text-[#6B5B51]">Ticket Médio</p>
          <p className="font-mono text-3xl font-medium text-[#261C17] mt-2 tabular-nums">
            {formatCurrencyBRL(report.averageTicket)}
          </p>
          <p className="text-xs text-[#6B5B51] mt-2 tabular-nums">
            Conclusão: {report.completionRate.toFixed(1)}% · Cancelamento:{' '}
            {report.cancellationRate.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-[#E6DDD3] rounded-xl p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
            <h2 className="font-display text-2xl font-semibold text-[#261C17]">
              Receita por Serviço
            </h2>
            <div className="flex items-center gap-4 text-xs text-[#6B5B51]">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#5A3D2E]" aria-hidden="true" />
                Realizada
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#C7AA92]" aria-hidden="true" />
                Prevista
              </span>
            </div>
          </div>
          <p className="text-xs text-[#6B5B51] mb-5">
            Comparativo entre receita realizada e prevista por procedimento (BRL)
          </p>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={report.byService}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 16, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#ECE4DB" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: '#6B5B51', fontSize: 11 }}
                  axisLine={{ stroke: '#E6DDD3' }}
                />
                <YAxis
                  type="category"
                  dataKey="serviceName"
                  width={130}
                  tick={{ fill: '#261C17', fontSize: 11 }}
                  axisLine={{ stroke: '#E6DDD3' }}
                />
                <Tooltip
                  formatter={(value: unknown) => formatCurrencyBRL(Number(value ?? 0))}
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#E6DDD3',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="projectedRevenue" name="Prevista" fill="#C7AA92" radius={[0, 4, 4, 0]} />
                <Bar dataKey="revenue" name="Realizada" fill="#5A3D2E" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-[#E6DDD3] rounded-xl p-6">
          <h2 className="font-display text-2xl font-semibold text-[#261C17] mb-1">
            Produtividade Diária
          </h2>
          <p className="text-xs text-[#6B5B51] mb-5">
            Horas produtivas registradas por data ativa no mês
          </p>
          {report.byDay.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-[#6B5B51]">
              Nenhum atendimento registrado em {report.monthLabel}.
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={report.byDay} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ECE4DB" vertical={false} />
                  <XAxis
                    dataKey="dayLabel"
                    tick={{ fill: '#6B5B51', fontSize: 11 }}
                    axisLine={{ stroke: '#E6DDD3' }}
                  />
                  <YAxis
                    tick={{ fill: '#6B5B51', fontSize: 11 }}
                    axisLine={{ stroke: '#E6DDD3' }}
                    unit="h"
                  />
                  <Tooltip
                    formatter={(value: unknown) => `${Number(value ?? 0).toFixed(1)} horas`}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E6DDD3',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="hours" name="Horas produtivas" fill="#7D5A46" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Tabular Breakdown Table */}
      <div className="bg-white border border-[#E6DDD3] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#ECE4DB]">
          <h2 className="font-display text-2xl font-semibold text-[#261C17]">
            Detalhamento por Procedimento
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-[#ECE4DB] text-xs font-medium text-[#6B5B51] bg-[#FAF7F3]">
                <th className="py-3 px-6">Serviço</th>
                <th className="py-3 px-4 text-right">Agendamentos</th>
                <th className="py-3 px-4 text-right">Concluídos</th>
                <th className="py-3 px-4 text-right">Horas</th>
                <th className="py-3 px-4 text-right">Participação</th>
                <th className="py-3 px-4 text-right">Realizada</th>
                <th className="py-3 px-6 text-right">Prevista</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECE4DB] tabular-nums">
              {report.byService.map((row) => (
                <tr key={row.serviceId} className="hover:bg-[#FCF9F6]">
                  <td className="py-3.5 px-6 font-medium text-[#261C17]">{row.serviceName}</td>
                  <td className="py-3.5 px-4 text-right font-mono">{row.count}</td>
                  <td className="py-3.5 px-4 text-right font-mono">{row.completedCount}</td>
                  <td className="py-3.5 px-4 text-right font-mono">{row.hours.toFixed(1)}h</td>
                  <td className="py-3.5 px-4 text-right font-mono">{row.sharePercent.toFixed(1)}%</td>
                  <td className="py-3.5 px-4 text-right font-mono">
                    {formatCurrencyBRL(row.revenue)}
                  </td>
                  <td className="py-3.5 px-6 text-right font-mono font-medium text-[#261C17]">
                    {formatCurrencyBRL(row.projectedRevenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Daily Ledger Table */}
      {report.byDay.length > 0 && (
        <div className="bg-white border border-[#E6DDD3] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#ECE4DB]">
            <h2 className="font-display text-2xl font-semibold text-[#261C17]">
              Histórico Diário — {report.monthLabel}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-[#ECE4DB] text-xs font-medium text-[#6B5B51] bg-[#FAF7F3]">
                  <th className="py-3 px-6">Data</th>
                  <th className="py-3 px-4 text-right">Atendimentos</th>
                  <th className="py-3 px-4 text-right">Concluídos</th>
                  <th className="py-3 px-4 text-right">Horas Trabalhadas</th>
                  <th className="py-3 px-6 text-right">Faturamento do Dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECE4DB] tabular-nums">
                {report.byDay.map((day) => (
                  <tr key={day.date} className="hover:bg-[#FCF9F6]">
                    <td className="py-3 px-6 font-mono text-[#261C17]">
                      {formatDateToBR(day.date)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">{day.appointmentsCount}</td>
                    <td className="py-3 px-4 text-right font-mono">{day.completedCount}</td>
                    <td className="py-3 px-4 text-right font-mono">{day.hours.toFixed(1)}h</td>
                    <td className="py-3 px-6 text-right font-mono font-medium text-[#261C17]">
                      {formatCurrencyBRL(day.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
