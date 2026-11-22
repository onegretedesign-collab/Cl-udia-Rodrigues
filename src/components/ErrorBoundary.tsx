import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'Ocorreu um erro inesperado na aplicação.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string; path?: string };
      if (parsed && parsed.error) {
        readable = `Erro de sincronização na nuvem (${parsed.operationType ?? 'operação'} em ${parsed.path ?? 'dados'}): ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, info);
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8F7F3] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#E5E2D9] rounded-xl p-8">
            <h1 className="font-display text-3xl font-semibold text-[#22261E] mb-3">
              Não foi possível concluir esta ação
            </h1>
            <p className="text-sm text-[#64695E] leading-relaxed mb-6">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.reload();
              }}
              className="px-5 py-2.5 text-sm font-medium bg-[#3B492D] text-[#F8F7F3] rounded-lg hover:bg-[#4A5A38] transition-colors"
            >
              Recarregar aplicativo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
