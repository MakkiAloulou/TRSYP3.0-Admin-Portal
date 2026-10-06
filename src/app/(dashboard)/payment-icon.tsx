import type { PaymentState } from '@/lib/payment';

/**
 * Tick, cross, clock face and alert — four distinct shapes, so a payment
 * state never rests on colour alone. Shared by the participants and payments
 * tables so both speak the same visual language.
 */
export function PaymentIcon({ state, size }: { state: PaymentState; size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={state === 'PAID' ? 3 : 2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {state === 'PAID' && <path d="M5.5 12.5l4.2 4.2L18.5 8" />}
      {state === 'NOT_PAID' && <path d="M7 7l10 10M17 7L7 17" />}
      {state === 'PENDING' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </>
      )}
      {state === 'REJECTED' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v5.5M12 16.5v.01" />
        </>
      )}
    </svg>
  );
}
