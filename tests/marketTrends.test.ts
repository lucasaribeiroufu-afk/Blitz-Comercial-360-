import test from 'node:test';
import assert from 'node:assert/strict';
import { trendsExploreUrl, parseTrendsCsv } from '../src/utils/marketTrends';

test('Trends preserves exact terms, region and time window in official URL', () => {
  const url = new URL(trendsExploreUrl('resina para telha, resina acrílica', 'BR-MG', 'today 12-m'));
  assert.equal(url.origin, 'https://trends.google.com');
  assert.equal(url.searchParams.get('q'), 'resina para telha,resina acrílica');
  assert.equal(url.searchParams.get('geo'), 'BR-MG');
  assert.equal(url.searchParams.get('date'), 'today 12-m');
  assert.throws(() => trendsExploreUrl('', 'BR', 'today 12-m'));
  assert.throws(() => trendsExploreUrl('a,b,c,d,e,f', 'BR', 'today 12-m'));
});

test('CSV keeps export metadata, accented regions, zero, low values and quoted queries', () => {
  const rows = parseTrendsCsv('\uFEFFCategoria: Todas as categorias\r\n\r\nRegião,"resina: (Brasil)"\r\nSão Paulo,0\r\nMinas Gerais,<1\r\n"resina, colorida",Breakout\r\n"termo ""citado""",100');
  assert.deepEqual(rows, [['Categoria: Todas as categorias'], ['Região', 'resina: (Brasil)'], ['São Paulo','0'], ['Minas Gerais','<1'], ['resina, colorida','Breakout'], ['termo "citado"','100']]);
  assert.throws(() => parseTrendsCsv('sem tabela'));
  assert.throws(() => parseTrendsCsv('dia,"incompleto'));
  assert.throws(() => parseTrendsCsv('x'.repeat(1_000_001)));
});
