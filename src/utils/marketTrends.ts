export type TrendsPeriod = 'today 3-m' | 'today 12-m' | 'today 5-y';

export function trendsExploreUrl(terms: string, geo: string, period: TrendsPeriod): string {
  const queries = [...new Set(terms.split(/[,\n]/).map(t => t.trim()).filter(Boolean))];
  if (!queries.length || queries.length > 5) throw new Error('Informe de um a cinco termos, separados por vírgula.');
  if (queries.some(q => q.length > 100)) throw new Error('Cada termo deve ter até 100 caracteres.');
  if (!/^BR(?:-[A-Z]{2})?$/.test(geo)) throw new Error('Selecione Brasil ou uma UF.');
  const params = new URLSearchParams({ geo, date: period, q: queries.join(','), hl: 'pt-BR' });
  return `https://trends.google.com/trends/explore?${params}`;
}

// CSVs exported by Trends include metadata before the actual table. Keep the
// original headers and cells: regional scores, timeline indexes and rising
// percentages have different meanings and must never be combined as lead scores.
export function parseTrendsCsv(text: string): string[][] {
  if (text.length > 1_000_000) throw new Error('O CSV deve ter no máximo 1 MB.');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(cell.trim()); cell = '';
      if (c !== ',') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (c === '\r' && input[i + 1] === '\n') i++;
      }
    } else cell += c;
  }
  if (quoted) throw new Error('CSV incompleto: aspas não fechadas.');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.some(r => r.length >= 2)) throw new Error('Não foi encontrada uma tabela CSV. Exporte o arquivo pelo Google Trends.');
  if (rows.length > 10_000 || rows.some(r => r.length > 30)) throw new Error('Tabela muito grande para esta visualização.');
  return rows;
}
