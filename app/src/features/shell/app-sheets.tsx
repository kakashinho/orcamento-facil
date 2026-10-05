import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Transaction, Wallet } from "@/data/api/types";
import { TransactionDetailsSheet } from "../transactions/transaction-details-sheet";
import { TransactionFormSheet } from "../transactions/transaction-form-sheet";
import { TransferSheet } from "../wallets/transfer-sheet";
import { WalletFormSheet } from "../wallets/wallet-form-sheet";

/** Abre as folhas (formulários e detalhes) de qualquer tela, como o Shell do protótipo. */
interface AppSheetsApi {
  openTransactionForm: (editing?: Transaction) => void;
  /** Abre o formulário de nova transação já ouvindo (R65), direto da tela inicial. */
  openVoiceTransaction: () => void;
  openTransactionDetails: (transaction: Transaction) => void;
  openTransfer: (fromWalletId?: string) => void;
  openWalletForm: (editing?: Wallet) => void;
}

const AppSheetsContext = createContext<AppSheetsApi | null>(null);

type FormState = { open: boolean; editing: Transaction | null; key: number; voice: boolean };

export function AppSheetsProvider({ children }: { children: ReactNode }) {
  // Cada abertura ganha uma `key` nova: o formulário é remontado e o estado nasce limpo.
  const [form, setForm] = useState<FormState>({ open: false, editing: null, key: 0, voice: false });
  const [details, setDetails] = useState<Transaction | null>(null);
  const [transfer, setTransfer] = useState<{ open: boolean; from?: string; key: number }>({ open: false, key: 0 });
  const [walletForm, setWalletForm] = useState<{ open: boolean; editing: Wallet | null; key: number }>({
    open: false,
    editing: null,
    key: 0,
  });

  const openTransactionForm = useCallback((editing?: Transaction) => {
    setDetails(null);
    setForm((f) => ({ open: true, editing: editing ?? null, key: f.key + 1, voice: false }));
  }, []);
  const openVoiceTransaction = useCallback(() => {
    setDetails(null);
    setForm((f) => ({ open: true, editing: null, key: f.key + 1, voice: true }));
  }, []);
  const openTransactionDetails = useCallback((transaction: Transaction) => setDetails(transaction), []);
  const openTransfer = useCallback((from?: string) => setTransfer((t) => ({ open: true, from, key: t.key + 1 })), []);
  const openWalletForm = useCallback(
    (editing?: Wallet) => setWalletForm((w) => ({ open: true, editing: editing ?? null, key: w.key + 1 })),
    [],
  );

  const value = useMemo(
    () => ({ openTransactionForm, openVoiceTransaction, openTransactionDetails, openTransfer, openWalletForm }),
    [openTransactionForm, openVoiceTransaction, openTransactionDetails, openTransfer, openWalletForm],
  );

  return (
    <AppSheetsContext.Provider value={value}>
      {children}
      <TransactionFormSheet
        key={`form-${form.key}`}
        open={form.open}
        editing={form.editing}
        startWithVoice={form.voice}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
      />
      <TransactionDetailsSheet
        transaction={details}
        onClose={() => setDetails(null)}
        onEdit={(transaction) => openTransactionForm(transaction)}
      />
      <TransferSheet
        key={`transfer-${transfer.key}`}
        open={transfer.open}
        fromWalletId={transfer.from}
        onClose={() => setTransfer((t) => ({ ...t, open: false }))}
      />
      <WalletFormSheet
        key={`wallet-${walletForm.key}`}
        open={walletForm.open}
        editing={walletForm.editing}
        onClose={() => setWalletForm((w) => ({ ...w, open: false }))}
      />
    </AppSheetsContext.Provider>
  );
}

export function useAppSheets(): AppSheetsApi {
  const context = useContext(AppSheetsContext);
  if (!context) throw new Error("useAppSheets precisa estar dentro de <AppSheetsProvider>.");
  return context;
}
