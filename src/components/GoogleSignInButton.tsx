interface GoogleSignInButtonProps {
  onClick: () => void;
  label?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
}

export function GoogleSignInButton({
  onClick,
  label = 'Entrar com Google',
  disabled = false,
  size = 'sm',
  fullWidth = false,
}: GoogleSignInButtonProps) {
  const sizeClasses =
    size === 'md'
      ? 'h-11 px-4 text-sm gap-3'
      : 'h-9 px-3.5 text-xs gap-2.5';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center font-medium text-[#1F1F1F] bg-white border border-[#747775]/45 rounded-lg hover:bg-[#F8F9FA] active:bg-[#F1F3F4] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 shadow-2xs ${sizeClasses} ${
        fullWidth ? 'w-full' : ''
      }`}
    >
      <svg
        version="1.1"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 48 48"
        aria-hidden="true"
        className={size === 'md' ? 'w-5 h-5 shrink-0' : 'w-4 h-4 shrink-0'}
      >
        <path
          fill="#EA4335"
          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        />
        <path
          fill="#FBBC05"
          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        />
        <path fill="none" d="M0 0h48v48H0z" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
