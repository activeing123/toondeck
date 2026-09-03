/*
Toast — in-app notifications replacing window.alert (R26).

Why: native alerts block the main thread, cannot be styled with the deck
theme, ignore the language toggle, and arrive as sequential modal dialogs
when several operations fail. This provider queues up to 4 stacked toasts,
auto-dismisses after 4.5s, and exposes a module-level `toast` API so any
component (or fetch handler) can push one without prop drilling.
*/

import { createContext, ReactNode, useCallback, useContext, useRef, useState } from "react";

export type ToastKind = "error" | "ok";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

interface ToastCtx {
  items: ToastItem[];
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

const MAX_STACK = 4;
const AUTO_DISMISS_MS = 4500;

let nextId = 1;
type Listener = (t: ToastItem) => void;
const listeners = new Set<Listener>();

/** Module-level imperative API: toast.error("…"), toast.ok("…"). */
export const toast = {
  error(text: string) {
    push({ id: nextId++, kind: "error", text });
  },
  ok(text: string) {
    push({ id: nextId++, kind: "ok", text });
  },
};

function push(t: ToastItem) {
  for (const l of listeners) l(t);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setItems((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const onToast = useCallback(
    (t: ToastItem) => {
      setItems((cur) => [...cur.slice(-(MAX_STACK - 1)), t]);
      timers.current.set(
        t.id,
        setTimeout(() => dismiss(t.id), AUTO_DISMISS_MS),
      );
    },
    [dismiss],
  );

  const listen = useCallback(
    (l: Listener) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    [],
  );

  const subscribe = useRef(false);
  if (!subscribe.current) {
    // one listener per provider instance (mount-time, not render-time)
    subscribe.current = true;
    void listen;
  }

  const [hooked] = useState(() => {
    // bridge the imperative API into this provider's state
    listeners.add(onToast);
    return true;
  });
  void hooked;

  return (
    <Ctx.Provider value={{ items, dismiss }}>
      {children}
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto max-w-sm z-50 flex flex-col gap-2">
        {items.map((t) => (
          <button
            key={t.id}
            data-kind={t.kind}
            onClick={() => dismiss(t.id)}
            className={`animate-toast-in text-left rounded-deck border px-4 py-3 text-sm shadow-lg ${
              t.kind === "error"
                ? "border-led-err/50 bg-deck-panel text-led-err"
                : "border-led-ok/50 bg-deck-panel text-led-ok"
            }`}
          >
            {t.kind === "error" ? "⚠ " : "✓ "}
            {t.text}
          </button>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToasts(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToasts outside ToastProvider");
  return ctx;
}
