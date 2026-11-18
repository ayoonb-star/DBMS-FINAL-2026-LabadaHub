import { createContext, useContext, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

export type LaundryService = {
  id: string;
  name: string;
  rate: number;
  unit: 'kg' | 'item';
};

export type LaundryBooking = {
  reference: string;
  service: LaundryService;
  quantity: number;
  addons: string[];
  addonTotal: number;
  discountRate: number;
  date: string;
  slot: string;
  notes: string;
  status: string;
  verifiedQuantity: number | null;
};

type LaundryContextValue = {
  booking: LaundryBooking | null;
  createBooking: (booking: Omit<LaundryBooking, 'reference' | 'status' | 'verifiedQuantity'>) => void;
  updateBooking: (updates: Partial<Pick<LaundryBooking, 'status' | 'verifiedQuantity'>>) => void;
};

const LaundryContext = createContext<LaundryContextValue | null>(null);
let currentBooking: LaundryBooking | null = null;

export function LaundryProvider({ children }: PropsWithChildren) {
  const [booking, setBooking] = useState<LaundryBooking | null>(currentBooking);

  const value = useMemo(
    () => ({
      booking,
      createBooking: (details: Omit<LaundryBooking, 'reference' | 'status' | 'verifiedQuantity'>) => {
        const nextBooking = {
          ...details,
          reference: `FS-${String(Date.now()).slice(-6)}`,
          status: 'Booked',
          verifiedQuantity: null,
        };
        currentBooking = nextBooking;
        setBooking(nextBooking);
      },
      updateBooking: (updates: Partial<Pick<LaundryBooking, 'status' | 'verifiedQuantity'>>) => {
        if (currentBooking) {
          currentBooking = { ...currentBooking, ...updates };
          setBooking(currentBooking);
        }
      },
    }),
    [booking],
  );

  return <LaundryContext.Provider value={value}>{children}</LaundryContext.Provider>;
}

export function useLaundry() {
  const context = useContext(LaundryContext);
  if (!context) {
    throw new Error('useLaundry must be used within LaundryProvider');
  }
  return context;
}
