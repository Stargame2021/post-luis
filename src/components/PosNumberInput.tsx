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
 * - Respeta min y max al salir de foco o al editar.
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
  onBlur,
  onFocus,
  ...rest
}: PosNumberInputProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const numericValue =
    typeof value === 'number' ? value : parseFloat(String(value || 0).replace(',', '.'));
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;

  const formattedDisplay = safeValue.toLocaleString('es-VE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    setDraft(safeValue === 0 ? '' : String(Number(safeValue.toFixed(decimals))));
    onFocus?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || readOnly) return;

    const raw = e.target.value.replace(',', '.');
    // Permitir vacío o dígitos con a lo sumo un punto decimal
    const sanitized = raw.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    const normalized =
      parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized;

    setDraft(normalized);

    if (normalized === '' || normalized === '.') {
      onChange(clampNumericValue(0, min, max));
      return;
    }

    const parsed = parseFloat(normalized);
    if (!isNaN(parsed)) {
      if (max !== undefined && parsed > max) {
        setDraft(String(max));
        onChange(max);
        return;
      }
      onChange(Number(parsed.toFixed(decimals)));
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    const parsed = parseFloat(draft.replace(',', '.'));
    const clamped = clampNumericValue(isNaN(parsed) ? safeValue : parsed, min, max);
    if (clamped !== safeValue) {
      onChange(Number(clamped.toFixed(decimals)));
    }
    onBlur?.(e);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={isFocused ? draft : formattedDisplay}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      placeholder={placeholder || formattedDisplay}
      {...rest}
    />
  );
}
