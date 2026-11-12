'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertCircle,
  Package,
  Layers,
  ArrowRight,
  Info,
  Loader2,
  Trash2,
  Sparkles,
  FileCheck,
  RefreshCw,
} from 'lucide-react';

interface RowImportPreview {
  producto: string;
  presentacion: string;
  factor: number;
  precio: number;
  existencia: number;
  esPresentacionSecundaria: boolean;
  isValid: boolean;
  error?: string;
}

interface GroupedProductoPreview {
  nombre: string;
  unidad_base: string;
  precio_usd: number;
  stock_actual: number;
  presentaciones: {
    nombre: string;
    factor: number;
    precio_usd: number;
  }[];
}

interface ImportExcelViewProps {
  onImportCompleted?: () => void;
  isDarkMode?: boolean;
}

export default function ImportExcelView({
  onImportCompleted,
  isDarkMode = false,
}: ImportExcelViewProps) {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [modo, setModo] = useState<'actualizar' | 'omitir'>('actualizar');

  const [rawRows, setRawRows] = useState<RowImportPreview[]>([]);
  const [groupedProducts, setGroupedProducts] = useState<GroupedProductoPreview[]>([]);
  const [resultMessage, setResultMessage] = useState<{
    type: 'success' | 'error';
    text: string;
    stats?: { total: number; creados: number; actualizados: number; omitidos: number };
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Descargar plantilla de ejemplo oficial en formato .xlsx
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        Producto: 'Lata de Cerveza Polar',
        Presentacion: 'Unidad',
        Factor: 1,
        'Precio USD': 1.0,
        Existencia: 48,
      },
      {
        Producto: 'Lata de Cerveza Polar',
        Presentacion: 'Sixpack',
        Factor: 6,
        'Precio USD': 5.5,
        Existencia: '',
      },
      {
        Producto: 'Lata de Cerveza Polar',
        Presentacion: 'Caja 24',
        Factor: 24,
        'Precio USD': 21.0,
        Existencia: '',
      },
      {
        Producto: 'Jugo de Fresa Pasteurizado 1L',
        Presentacion: 'Unidad',
        Factor: 1,
        'Precio USD': 1.5,
        Existencia: 100,
      },
      {
        Producto: 'Harina Pan 1kg',
        Presentacion: 'Paquete',
        Factor: 1,
        'Precio USD': 1.15,
        Existencia: 120,
      },
      {
        Producto: 'Harina Pan 1kg',
        Presentacion: 'Bulto 20kg',
        Factor: 20,
        'Precio USD': 21.5,
        Existencia: '',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    // Ancho de columnas para visualización clara
    worksheet['!cols'] = [
      { wch: 32 }, // Producto
      { wch: 18 }, // Presentacion
      { wch: 10 }, // Factor
      { wch: 14 }, // Precio USD
      { wch: 14 }, // Existencia
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla_Productos');
    XLSX.writeFile(workbook, 'plantilla_importacion_productos.xlsx');
  };

  // Procesar archivo Excel cargado por el usuario
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setLoadingFile(true);
    setResultMessage(null);
    setFile(uploadedFile);
    setFileName(uploadedFile.name);

    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const data = XLSX.utils.sheet_to_json<any>(worksheet, { defval: '' });

        if (data.length === 0) {
          setResultMessage({
            type: 'error',
            text: 'El archivo Excel está vacío o no contiene filas con datos válidos.',
          });
          setLoadingFile(false);
          return;
        }

        // Parsear filas y reconocer columnas con nombres flexibles
        const parsedRows: RowImportPreview[] = data
          .map((row) => {
            // Reconocimiento flexible de nombres de columna
            const prodRaw =
              row.Producto ||
              row.producto ||
              row.PRODUCTO ||
              row.Articulo ||
              row.articulo ||
              row.Nombre ||
              row.nombre ||
              '';
            const presRaw =
              row.Presentacion ||
              row.presentacion ||
              row.PRESENTACION ||
              row.Empaque ||
              row.empaque ||
              row.Unidad ||
              '';
            const factorRaw =
              row.Factor ||
              row.factor ||
              row.FACTOR ||
              row['Unidades por Empaque'] ||
              row['Cantidad Empaque'] ||
              '';
            const precioRaw =
              row['Precio USD'] ||
              row.Precio ||
              row.precio ||
              row.PRECIO ||
              row.PVP ||
              row['Precio'] ||
              0;
            const stockRaw =
              row.Existencia ||
              row.existencia ||
              row.EXISTENCIA ||
              row.Stock ||
              row.stock ||
              row.Cantidad ||
              '';

            const producto = String(prodRaw).trim();
            if (!producto) return null; // saltar filas vacías

            let presentacion = String(presRaw).trim();
            let factor = parseFloat(String(factorRaw)) || 1;
            const precio = parseFloat(String(precioRaw)) || 0;
            const existencia = parseFloat(String(stockRaw)) || 0;

            // Limpiar paréntesis si el usuario escribió "(unidad)" o "(sixpack)"
            presentacion = presentacion.replace(/^\(|\)$/g, '').trim();

            // Si no indicó presentación, por defecto es Unidad
            if (!presentacion) {
              presentacion = 'Unidad';
            }

            // Detección automática inteligente si el factor no vino en el excel
            if (factor <= 1) {
              const lowerPres = presentacion.toLowerCase();
              if (lowerPres.includes('sixpack') || lowerPres.includes('six pack')) {
                factor = 6;
              } else if (lowerPres.includes('doce') || lowerPres.includes('docena')) {
                factor = 12;
              } else {
                // Buscar si hay números en el nombre de la presentación (ej: "Caja 24" -> 24)
                const numMatch = lowerPres.match(/\d+/);
                if (numMatch && numMatch[0]) {
                  const detectedNum = parseInt(numMatch[0], 10);
                  if (detectedNum > 1 && detectedNum <= 1000) {
                    factor = detectedNum;
                  }
                }
              }
            }

            const esPresentacionSecundaria = factor > 1;

            return {
              producto,
              presentacion,
              factor,
              precio,
              existencia,
              esPresentacionSecundaria,
              isValid: precio >= 0,
            };
          })
          .filter(Boolean) as RowImportPreview[];

        setRawRows(parsedRows);

        // Agrupar filas por Producto base y coleccionar sus presentaciones
        const groupedMap = new Map<string, GroupedProductoPreview>();

        for (const r of parsedRows) {
          const key = r.producto.toLowerCase();
          const existing = groupedMap.get(key);

          if (!existing) {
            // Primer registro de este producto
            if (r.factor <= 1) {
              groupedMap.set(key, {
                nombre: r.producto,
                unidad_base: r.presentacion || 'Unidad',
                precio_usd: r.precio,
                stock_actual: r.existencia,
                presentaciones: [],
              });
            } else {
              // Si vino primero una presentación secundaria, asumimos unidad base como 'Unidad'
              groupedMap.set(key, {
                nombre: r.producto,
                unidad_base: 'Unidad',
                precio_usd: r.precio / r.factor,
                stock_actual: r.existencia,
                presentaciones: [
                  {
                    nombre: r.presentacion,
                    factor: r.factor,
                    precio_usd: r.precio,
                  },
                ],
              });
            }
          } else {
            // Ya existía el producto: si la fila es una presentación (> 1), agregarla
            if (r.factor > 1) {
              existing.presentaciones.push({
                nombre: r.presentacion,
                factor: r.factor,
                precio_usd: r.precio,
              });
            } else {
              // Si es la unidad base y no tenía precio establecido
              existing.unidad_base = r.presentacion || existing.unidad_base;
              existing.precio_usd = r.precio;
              if (r.existencia > 0) {
                existing.stock_actual = r.existencia;
              }
            }
          }
        }

        const groupedList = Array.from(groupedMap.values());
        setGroupedProducts(groupedList);
      } catch (err: any) {
        setResultMessage({
          type: 'error',
          text: `No se pudo leer el archivo Excel: ${err?.message || 'Formato no soportado'}`,
        });
      } finally {
        setLoadingFile(false);
      }
    };

    reader.readAsBinaryString(uploadedFile);
  };

  // Confirmar y procesar importación en la base de datos
  const handleConfirmImport = async () => {
    if (groupedProducts.length === 0) return;

    setImporting(true);
    setResultMessage(null);

    try {
      const res = await fetch('/api/productos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: groupedProducts,
          modo,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResultMessage({
          type: 'success',
          text: data.message,
          stats: data.stats,
        });
        // Limpiar para permitir nueva carga
        setRawRows([]);
        setGroupedProducts([]);
        setFile(null);
        setFileName('');
        if (fileInputRef.current) fileInputRef.current.value = '';

        if (onImportCompleted) {
          onImportCompleted();
        }
      } else {
        setResultMessage({
          type: 'error',
          text: data.message || 'Error durante la importación',
        });
      }
    } catch (err: any) {
      setResultMessage({
        type: 'error',
        text: `Error de conexión: ${err?.message || 'No se pudo comunicar con el servidor'}`,
      });
    } finally {
      setImporting(false);
    }
  };

  // Limpiar carga actual
  const handleReset = () => {
    setFile(null);
    setFileName('');
    setRawRows([]);
    setGroupedProducts([]);
    setResultMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div
        className={`p-6 sm:p-8 rounded-3xl border transition-all ${
          isDarkMode
            ? 'bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-slate-800 shadow-xl'
            : 'bg-gradient-to-r from-white via-indigo-50/50 to-white border-slate-200/90 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Herramienta de Carga Masiva
            </div>
            <h1
              className={`text-2xl sm:text-3xl font-black tracking-tight ${
                isDarkMode ? 'text-white' : 'text-slate-900'
              }`}
            >
              Importador de Productos & Presentaciones
            </h1>
            <p className={`text-xs sm:text-sm max-w-2xl ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Carga tu catálogo completo desde un archivo Excel (.xlsx / .xls). El sistema agrupa
              automáticamente los productos con sus presentaciones (bultos, sixpacks, cajas) y existencias.
            </p>
          </div>

          {/* Botón Descargar Plantilla */}
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className={`px-4 py-2.5 rounded-2xl border text-xs font-bold transition flex items-center gap-2 shadow-sm shrink-0 ${
              isDarkMode
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
            }`}
          >
            <Download className="w-4 h-4 text-emerald-500" />
            <span>Descargar Plantilla Excel</span>
          </button>
        </div>
      </div>

      {/* Mensaje de Resultado (Alerta) */}
      {resultMessage && (
        <div
          className={`p-4 rounded-2xl border flex items-start gap-3 text-sm animate-in fade-in duration-200 ${
            resultMessage.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-emerald-500/30'
              : 'bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-500/30'
          }`}
        >
          {resultMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-500 mt-0.5" />
          )}
          <div className="flex-1 space-y-1">
            <p className="font-bold">{resultMessage.text}</p>
            {resultMessage.stats && (
              <div className="flex flex-wrap gap-3 text-xs font-semibold pt-1">
                <span>Total procesados: {resultMessage.stats.total}</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  Creados: {resultMessage.stats.creados}
                </span>
                <span className="text-indigo-600 dark:text-indigo-400">
                  Actualizados: {resultMessage.stats.actualizados}
                </span>
                {resultMessage.stats.omitidos > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">
                    Omitidos: {resultMessage.stats.omitidos}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Zona de Carga de Archivo */}
      <div
        className={`p-6 sm:p-8 rounded-3xl border transition-all text-center ${
          isDarkMode
            ? 'bg-slate-900 border-slate-800'
            : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileUpload}
          className="hidden"
          id="excel-file-input"
        />

        {!file ? (
          <label
            htmlFor="excel-file-input"
            className="cursor-pointer flex flex-col items-center justify-center p-8 border-2 border-dashed border-indigo-400/40 hover:border-indigo-500 rounded-3xl transition group bg-indigo-50/20 dark:bg-indigo-950/10"
          >
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-4 group-hover:scale-110 transition shadow-inner">
              <Upload className="w-8 h-8" />
            </div>
            <h3
              className={`font-black text-lg mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition ${
                isDarkMode ? 'text-white' : 'text-slate-900'
              }`}
            >
              Selecciona o arrastra tu archivo Excel aquí
            </h3>
            <p className="text-xs text-slate-400 max-w-md">
              Admite formatos <strong>.xlsx</strong> y <strong>.xls</strong>. Puedes descargar la
              plantilla oficial arriba para guiarte en el orden de las columnas.
            </p>
          </label>
        ) : (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
            <div className="flex items-center gap-3 text-left">
              <div className="p-3 rounded-xl bg-emerald-500 text-white shadow-md">
                <FileCheck className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate max-w-sm">
                  {fileName}
                </h4>
                <p className="text-xs text-slate-400">
                  {rawRows.length} filas leídas · {groupedProducts.length} productos identificados
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={importing}
                className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Cambiar Archivo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Vista Previa de Datos Detectados */}
      {groupedProducts.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3
                className={`font-black text-lg flex items-center gap-2 ${
                  isDarkMode ? 'text-white' : 'text-slate-900'
                }`}
              >
                Vista Previa de Productos a Importar
                <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  {groupedProducts.length} productos
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Verifica que las presentaciones y existencias se hayan agrupado correctamente antes de guardar.
              </p>
            </div>

            {/* Opciones de conflicto y Botón de Confirmación */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <span className="text-slate-400 hidden sm:inline">Si ya existe:</span>
                <select
                  value={modo}
                  onChange={(e) => setModo(e.target.value as any)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border outline-none ${
                    isDarkMode
                      ? 'bg-slate-900 border-slate-700 text-white'
                      : 'bg-white border-slate-300 text-slate-800'
                  }`}
                >
                  <option value="actualizar">Actualizar Precio y Stock</option>
                  <option value="omitir">Omitir (No Modificar)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-md shadow-indigo-600/25 transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Guardando en BD...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Confirmar e Importar</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Tabla de Productos Agrupados */}
          <div
            className={`rounded-2xl border overflow-hidden ${
              isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr
                    className={`border-b ${
                      isDarkMode
                        ? 'bg-slate-950/60 border-slate-800 text-slate-400'
                        : 'bg-slate-50 border-slate-200 text-slate-600 font-bold'
                    }`}
                  >
                    <th className="py-3 px-4 font-black">Producto</th>
                    <th className="py-3 px-4 font-black">Unidad Base</th>
                    <th className="py-3 px-4 font-black">Precio Base USD</th>
                    <th className="py-3 px-4 font-black">Existencia Base</th>
                    <th className="py-3 px-4 font-black">Presentaciones Vinculadas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {groupedProducts.map((p, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition`}
                    >
                      <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                        {p.nombre}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 font-medium border border-slate-200 dark:border-slate-700">
                          {p.unidad_base}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                        ${p.precio_usd.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-200">
                        {p.stock_actual > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {p.stock_actual}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {p.presentaciones.length === 0 ? (
                          <span className="text-slate-400 italic">Solo unidad base</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {p.presentaciones.map((pres, presIdx) => (
                              <span
                                key={presIdx}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-semibold text-[11px] ${
                                  isDarkMode
                                    ? 'bg-slate-800 text-slate-200 border-slate-700'
                                    : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                }`}
                              >
                                <span className="font-bold">{pres.nombre}</span>
                                <span className="text-slate-400 dark:text-slate-500 font-normal">
                                  (x{pres.factor})
                                </span>
                                <span className="font-mono text-emerald-600 dark:text-emerald-400 ml-1">
                                  ${pres.precio_usd.toFixed(2)}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Guía Explicativa del Formato */}
      <div
        className={`p-6 rounded-3xl border transition-colors ${
          isDarkMode ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200 mb-2 flex items-center gap-2">
          <Info className="w-4 h-4 text-indigo-500" />
          ¿Cómo preparar tu archivo Excel de forma correcta?
        </h4>
        <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1.5 list-disc pl-5">
          <li>
            <strong>Producto:</strong> Nombre del producto (debe escribirse idéntico en las filas de
            sus diferentes presentaciones para que el sistema las una).
          </li>
          <li>
            <strong>Presentación:</strong> Ejemplos: <code>Unidad</code>, <code>Sixpack</code>,{' '}
            <code>Bulto</code>, <code>Caja 24</code>.
          </li>
          <li>
            <strong>Factor:</strong> Cantidad de unidades base que contiene esa presentación (ej.{' '}
            <code>1</code> para la unidad, <code>6</code> para el sixpack, <code>24</code> para la
            caja).
          </li>
          <li>
            <strong>Precio USD:</strong> Precio de venta al público en dólares para esa presentación.
          </li>
          <li>
            <strong>Existencia:</strong> Se indica en la fila de la unidad base (representa las
            unidades individuales totales disponibles en el almacén).
          </li>
        </ul>
      </div>
    </div>
  );
}

