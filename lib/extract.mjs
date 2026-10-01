/**
 * Texto dos ficheiros. Só PDF por agora — o formato que este produto suporta.
 * ponytail: se aparecerem .docx/.pptx em quantidade, acrescentar aqui.
 */

import { extractText, getDocumentProxy } from 'unpdf';

/** @returns {Promise<{status:'ok'|'vazio'|'ignorado'|'falhou', texto:string, paginas?:string[], erro?:string}>} */
export async function extrairTexto(bytes, mimetype, filename = '') {
  const ehPdf = mimetype === 'application/pdf' || /\.pdf$/i.test(filename);
  if (!ehPdf) return { status: 'ignorado', texto: '' };
  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf);
    const paginas = Array.isArray(text) ? text.map((page) => String(page || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()) : [String(text || '')];
    const limpo = paginas.map((page, index) => `[Página ${index + 1}]\n${page}`).join('\n\n');
    // Slides digitalizados extraem quase nada: e sinal de que so OCR
    // resolveria, e vale a pena distinguir isso de uma falha real.
    return limpo.replace(/\[Página \d+\]/g, '').trim().length < 20
      ? { status: 'vazio', texto: limpo, paginas }
      : { status: 'ok', texto: limpo, paginas };
  } catch (e) {
    return { status: 'falhou', texto: '', erro: e.message };
  }
}
