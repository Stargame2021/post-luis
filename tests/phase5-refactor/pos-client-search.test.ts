import { describe, expect, it } from 'vitest';
import {
  filterPosClients,
  normalizeSearchText,
  resolveDefaultClient,
} from '@/components/pos/PosTopBar';
import type { Tercero } from '@/types';

const SAMPLE_CLIENTS: Tercero[] = [
  {
    id: 42,
    tipo: 'CLIENTE',
    identificacion: 'V-14567890',
    razon_social_nombre: 'José Pérez',
    activo: true,
  },
  {
    id: 88,
    tipo: 'CLIENTE',
    identificacion: 'V-00000000',
    razon_social_nombre: 'Cliente Genérico / Venta Mostrador',
    activo: true,
  },
  {
    id: 95,
    tipo: 'CLIENTE',
    identificacion: 'J-40123456-7',
    razon_social_nombre: 'Distribuidora Águila C.A.',
    activo: true,
  },
];

describe('Task 3 · Búsqueda de clientes y resolución de cliente por defecto (PosTopBar)', () => {
  it('normalizeSearchText elimina acentos, mayúsculas y espacios laterales', () => {
    expect(normalizeSearchText('  José Águila  ')).toBe('jose aguila');
  });

  it('filterPosClients busca por RIF/Cédula parcial o nombre sin acentos', () => {
    expect(filterPosClients(SAMPLE_CLIENTS, 'jose perez').map((c) => c.id)).toEqual([42]);
    expect(filterPosClients(SAMPLE_CLIENTS, '401234').map((c) => c.id)).toEqual([95]);
    expect(filterPosClients(SAMPLE_CLIENTS, 'aguila').map((c) => c.id)).toEqual([95]);
    expect(filterPosClients(SAMPLE_CLIENTS, '')).toHaveLength(3);
  });

  it('resolveDefaultClient encuentra el cliente mostrador aunque su id no sea 1', () => {
    expect(resolveDefaultClient(SAMPLE_CLIENTS)?.id).toBe(88);
    expect(resolveDefaultClient([SAMPLE_CLIENTS[0], SAMPLE_CLIENTS[2]])?.id).toBe(42);
    expect(resolveDefaultClient([])).toBeNull();
  });
});
