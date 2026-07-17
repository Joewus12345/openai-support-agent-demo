"use client";

import { useEffect } from "react";
import { CheckCircle, Info, TriangleAlert, X } from "lucide-react";

import { useToastStore } from "@/stores/useToastStore";

function toastColor(variant: string | undefined) {
  if (variant === "success") return "text-green-700";
  if (variant === "error") return "text-red-700";
  return "text-blue-700";
}

function iconForVariant(variant: string | undefined) {
  if (variant === "success") return <CheckCircle aria-hidden="true" className="h-5 w-5" />;
  if (variant === "error") return <TriangleAlert aria-hidden="true" className="h-5 w-5" />;
  return <Info aria-hidden="true" className="h-5 w-5" />;
}

export default function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);

  useEffect(() => {
    const timers = toasts.map((toast) =>
      setTimeout(() => {
        dismissToast(toast.id);
      }, 4200)
    );

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-3 sm:items-end sm:px-6">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto w-full max-w-sm rounded-lg border border-gray-200 bg-white p-4 shadow-lg"
        >
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 ${toastColor(toast.variant)}`}>{iconForVariant(toast.variant)}</div>
            <div className="flex-1 text-sm text-gray-800">
              <p className="font-semibold text-gray-900">{toast.title}</p>
              {toast.description && <p className="text-gray-700">{toast.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="flex size-11 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Dismiss notification"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
