'use client';

import React, { useState } from 'react';

/**
 * Formatea un valor numérico a moneda / número en formato POS en español (VE / ES)
 * Ej: 35700.2 -> "35.700,20" (con 2 decimales) o 4 decimales según precision
 */
export function formatPosValue(
  value: number | string | undefined | null,
  decimals: number = 2
): string {
  const num = typeof value === 'number' ? value : parseFloat(String(value ?? 0));
  if (isNaN(num)) {
    return (0).toLocaleString('es-VE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return num.toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export interface PosNumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number | string;
  onChange: (value: number) => void;
  decimals?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  className?: string;
  /** Cuando es true y el valor es 0, muestra vacío en lugar de "0,00" al no tener foco. */
  allowEmptyDisplay?: boolean;
  /** Referencia opcional al elemento input nativo para enfocarlo desde atajos. */
  inputRef?: React.Ref<HTMLInputElement>;
}

function clampNumericValue(num: number, min: number, max?: number): number {
  let result = Number.isFinite(num) ? num : min;
  if (result < min) result = min;
  if (max !== undefined && result > max) result = max;
  return result;
}

/**
 * Entrada numérica decimal compatible con teclado físico y teclados móviles (Android/iOS):
 * - Usa inputMode="decimal" y onChange (evita depender de e.key === 'Unidentified' en móvil).
 * - Sincroniza cambios externos (ej. botones Quick Tender) incluso cuando el input tiene foco.
 * - Permite borrar completamente el contenido sin dejar un "0" pegajoso.
 */
export default function PosNumberInput({
  value,
  onChange,
  decimals = 2,
  min = 0,
  max,
  className = '',
  placeholder,
  disabled,
  readOnly,
  allowEmptyDisplay = false,
  inputRef,
  onBlur,
  onFocus,
  ...rest
}: PosNumberInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [editState, setEditState] = useState<{ baseValue: number; draft: string } | null>(null);

  const numericValue =
    typeof value === 'number' ? value : parseFloat(String(value || 0).replace(',', '.'));
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;

  const formattedDisplay =
    allowEmptyDisplay && safeValue === 0
      ? ''
      : safeValue.toLocaleString('es-VE', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        });

  // Si el valor externo cambió (ej. botón Quick Tender), prevalece sobre el borrador previo
  const focusedDisplay =
    editState && editState.baseValue === safeValue
      ? editState.draft
      : safeValue === 0
      ? ''
      : String(Number(safeValue.toFixed(decimals)));

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setEditState({
      baseValue: safeValue,
      draft: safeValue === 0 ? '' : String(Number(safeValue.toFixed(decimals))),
    });
    onFocus?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || readOnly) return;

    const raw = e.target.value.replace(',', '.');
    const sanitized = raw.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    const normalized =
      parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized;

    if (normalized === '' || normalized === '.') {
      const zeroVal = clampNumericValue(0, min, max);
      setEditState({ baseValue: zeroVal, draft: normalized });
      onChange(zeroVal);
      return;
    }

    const parsed = parseFloat(normalized);
    if (!isNaN(parsed)) {
      if (max !== undefined && parsed > max) {
        setEditState({ baseValue: max, draft: String(max) });
        onChange(max);
        return;
      }
      const rounded = Number(parsed.toFixed(decimals));
      setEditState({ baseValue: rounded, draft: normalized });
      onChange(rounded);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    const currentDraft = editState && editState.baseValue === safeValue ? editState.draft : '';
    setEditState(null);

    if (currentDraft === '' && allowEmptyDisplay) {
      if (safeValue !== 0) onChange(0);
      onBlur?.(e);
      return;
    }

    const parsed = parseFloat(currentDraft.replace(',', '.'));
    const clamped = clampNumericValue(isNaN(parsed) ? safeValue : parsed, min, max);
    if (clamped !== safeValue) {
      onChange(Number(clamped.toFixed(decimals)));
    }
    onBlur?.(e);
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={isFocused ? focusedDisplay : formattedDisplay}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      placeholder={placeholder || (allowEmptyDisplay ? 'Exacto' : formattedDisplay)}
      {...rest}
    />
  );
}
