/*
 * Calculadora de gasto diario (korly.com.mx/calculadora/). Todo ocurre en el navegador: lo que se escribe no se envía ni se
 * guarda. Misma cuenta que usa Korly (backend/src/modulos/disponible/motor-flujo-caja.ts):
 *
 *   gasto diario = piso( (dinero − pagos fijos) ÷ días que faltan )     con los días contando hoy
 *
 * Los montos se manejan en centavos enteros (nunca decimales de punto flotante), como en la app, y el redondeo es hacia abajo.
 * El archivo exporta sus funciones puras en `window.KorlyCalculadora` solo para poder probarlas.
 */
(() => {
  /** "1,200.50" → 120050 centavos. Vacío o inválido → null. */
  function aCentavos(texto) {
    const limpio = String(texto ?? '')
      .replace(/[$\s]/g, '')
      .replace(/,/g, '');
    if (limpio === '' || !/^\d*\.?\d{0,2}$/.test(limpio) || limpio === '.') return null;
    return Math.round(Number(limpio) * 100);
  }

  /** "15" → 15. Solo enteros de 1 a 31. Vacío o inválido → null. */
  function aDias(texto) {
    const limpio = String(texto ?? '').trim();
    if (!/^\d{1,2}$/.test(limpio)) return null;
    const dias = Number(limpio);
    return dias >= 1 && dias <= 31 ? dias : null;
  }

  /** Piso de la división entera (también para negativos: el piso de -142.857 es -143, no -142). */
  function pisoDivision(dividendo, divisor) {
    return Math.floor(dividendo / divisor);
  }

  /** Lo que se muestra para unos números dados; `null` mientras falten datos. */
  function calcular({ dineroCentavos, fijosCentavos, dias }) {
    if (dineroCentavos === null || dias === null) return null;
    const libre = dineroCentavos - (fijosCentavos ?? 0);
    return { libreCentavos: libre, dias, porDiaCentavos: pisoDivision(libre, dias), alcanza: libre >= 0 };
  }

  /** La quincena de calendario de una fecha: del 1 al 15 o del 16 al último día; los días que faltan cuentan hoy. */
  function quincenaDe(fecha) {
    const anio = fecha.getFullYear();
    const mes = fecha.getMonth();
    const dia = fecha.getDate();
    const ultimoDia = new Date(anio, mes + 1, 0).getDate();
    const inicio = dia <= 15 ? 1 : 16;
    const fin = dia <= 15 ? 15 : ultimoDia;
    return { inicio, fin, diasRestantes: fin - dia + 1, dia, nombreMes: fecha.toLocaleDateString('es-MX', { month: 'long' }) };
  }

  window.KorlyCalculadora = { aCentavos, aDias, calcular, quincenaDe };

  const formulario = document.getElementById('calc');
  if (!formulario) return;

  const campoDinero = document.getElementById('dinero');
  const campoFijos = document.getElementById('fijos');
  const campoDias = document.getElementById('dias');
  const cuadro = document.getElementById('resultado');
  const cifra = document.getElementById('cifra');
  const detalle = document.getElementById('detalle');
  const textoQuincena = document.getElementById('quincena-texto');
  const botonDias = document.getElementById('usar-dias');
  const pesos = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  const enPesos = (centavos) => pesos.format(centavos / 100);

  const hoy = quincenaDe(new Date());
  textoQuincena.textContent = `Hoy es ${hoy.dia} de ${hoy.nombreMes}: estás en la quincena del ${hoy.inicio} al ${hoy.fin} de ${hoy.nombreMes} y faltan ${hoy.diasRestantes} ${
    hoy.diasRestantes === 1 ? 'día' : 'días'
  } contando hoy.`;
  campoDias.value = String(hoy.diasRestantes);
  botonDias.hidden = false;

  function mostrar() {
    const dineroCentavos = aCentavos(campoDinero.value);
    const fijosCentavos = campoFijos.value.trim() === '' ? 0 : aCentavos(campoFijos.value);
    const dias = aDias(campoDias.value);
    cuadro.classList.remove('negativo');

    if (campoFijos.value.trim() !== '' && fijosCentavos === null) {
      cifra.textContent = '—';
      detalle.textContent = 'Revisa los pagos fijos: escribe solo números, por ejemplo 1200 o 1,200.50.';
      return;
    }
    if (campoDinero.value.trim() !== '' && dineroCentavos === null) {
      cifra.textContent = '—';
      detalle.textContent = 'Revisa el dinero que tienes: escribe solo números, por ejemplo 3600 o 3,600.50.';
      return;
    }
    if (campoDias.value.trim() !== '' && dias === null) {
      cifra.textContent = '—';
      detalle.textContent = 'Los días deben ser un número entero de 1 a 31.';
      return;
    }

    const resultado = calcular({ dineroCentavos, fijosCentavos, dias });
    if (!resultado) {
      cifra.textContent = '—';
      detalle.textContent = 'Escribe cuánto dinero tienes y los días que faltan.';
      return;
    }
    if (!resultado.alcanza) {
      cuadro.classList.add('negativo');
      cifra.textContent = enPesos(resultado.porDiaCentavos);
      detalle.textContent = `Tus pagos fijos (${enPesos(fijosCentavos)}) superan el dinero que tienes (${enPesos(dineroCentavos)}) por ${enPesos(-resultado.libreCentavos)}. Revisa tus números.`;
      return;
    }
    cifra.textContent = enPesos(resultado.porDiaCentavos);
    const base = fijosCentavos > 0 ? `${enPesos(resultado.libreCentavos)} (después de ${enPesos(fijosCentavos)} de pagos fijos)` : enPesos(resultado.libreCentavos);
    detalle.textContent = `${base} entre ${resultado.dias} ${resultado.dias === 1 ? 'día' : 'días'}, redondeado hacia abajo.`;
  }

  formulario.addEventListener('input', mostrar);
  formulario.addEventListener('submit', (evento) => evento.preventDefault());
  botonDias.addEventListener('click', () => {
    campoDias.value = String(hoy.diasRestantes);
    mostrar();
  });
  mostrar();
})();
