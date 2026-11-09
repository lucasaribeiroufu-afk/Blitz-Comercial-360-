import { useEffect, useState, type FormEvent } from 'react';
import type { User } from '../lib/firebase';

type Offer = { id: string; product: string; seller: string; stock: number; prefixes: string[]; active: boolean };

async function quoteApi<T>(body: object, user?: User): Promise<T> {
  const response = await fetch('/api/quote-requests', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { Authorization: `Bearer ${await user.getIdToken()}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'A captação está indisponível.');
  return result;
}

const input = 'block w-full mt-1 rounded border border-zinc-600 bg-zinc-950 px-3 py-2 text-white';
const button = 'rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50';
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Falha na comunicação.';

export function QuoteCatalog({ user }: { user: User }) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [editing, setEditing] = useState<Offer>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = () => quoteApi<{ offers: Offer[] }>({ action: 'list' }, user).then(result => setOffers(result.offers));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    setBusy(true);
    try {
      await quoteApi({ ...fields, action: 'save', id: editing?.id }, user);
      form.reset();
      setEditing(undefined);
      await refresh();
      setMessage('Oferta publicada. Use o link em seus anúncios ou divulgue diretamente.');
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  async function disable(id: string) {
    setBusy(true);
    try {
      await quoteApi({ action: 'disable', id }, user);
      await refresh();
      setMessage('Oferta pausada.');
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return <details className="rounded-xl border border-zinc-700 bg-zinc-900 p-5" onToggle={event => {
    if (event.currentTarget.open) void refresh().catch(error => setMessage(errorText(error)));
  }}>
    <summary className="cursor-pointer font-semibold">Captação de pedidos de orçamento</summary>
    <p className="my-3 text-sm text-zinc-300">Crie um link por produto. Pedidos elegíveis chegam ao Banco de Contatos enquanto o painel está aberto.</p>
    <form key={editing?.id || 'new'} className="grid gap-3 sm:grid-cols-2" onSubmit={save}>
      <label>Produto<input className={input} name="product" required maxLength={120} defaultValue={editing?.product} /></label>
      <label>Fornecedor exibido ao comprador<input className={input} name="seller" required maxLength={100} defaultValue={editing?.seller} /></label>
      <label>Estoque disponível em unidades<input className={input} name="stock" required type="number" min="0" step="1" defaultValue={editing?.stock} /></label>
      <label>Prefixos de CEP separados por vírgula<input className={input} name="prefixes" maxLength={500} placeholder="Em branco para atender todo o Brasil" defaultValue={editing?.prefixes.join(', ')} /></label>
      <button className={button} disabled={busy}>{editing ? 'Salvar e ativar oferta' : 'Criar link de orçamento'}</button>
      {editing && <button type="button" disabled={busy} onClick={() => setEditing(undefined)}>Cancelar edição</button>}
    </form>
    <p className="my-3 text-sm" role="status">{message}</p>
    <ul className="space-y-3">
      {offers.map(offer => {
        const url = new URL('/orcamento', window.location.origin);
        url.searchParams.set('oferta', offer.id);
        return <li key={offer.id} className="flex flex-wrap items-center gap-3 border-t border-zinc-700 pt-3 text-sm">
          <strong>{offer.product}</strong>
          <span>{offer.active && offer.stock > 0 ? `${offer.stock} disponíveis` : 'Indisponível'}</span>
          <a className="underline" href={url.href} target="_blank" rel="noreferrer">Abrir link</a>
          <button type="button" disabled={busy} onClick={() => void navigator.clipboard.writeText(url.href)
            .then(() => setMessage('Link copiado.'), error => setMessage(errorText(error)))}>Copiar link</button>
          <button type="button" disabled={busy} onClick={() => setEditing(offer)}>Editar</button>
          {offer.active && <button type="button" disabled={busy} onClick={() => void disable(offer.id)}>Pausar</button>}
        </li>;
      })}
    </ul>
  </details>;
}

export function PublicQuote() {
  const id = new URLSearchParams(window.location.search).get('oferta');
  const [offer, setOffer] = useState<Pick<Offer, 'product' | 'seller'>>();
  const [channel, setChannel] = useState('whatsapp');
  const [message, setMessage] = useState('Carregando oferta…');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    let live = true;
    void quoteApi<Pick<Offer, 'product' | 'seller'>>({ action: 'read', id }).then(result => {
      if (live) { setOffer(result); setMessage(''); }
    }, error => { if (live) setMessage(errorText(error)); });
    return () => { live = false; };
  }, [id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setMessage('');
    try {
      await quoteApi({ ...fields, action: 'request', id, consent: fields.consent === 'on' });
      setSent(true);
      setMessage('Pedido recebido. O fornecedor poderá responder pelo canal informado.');
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
    <section className="mx-auto max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 p-6">
      <h1 className="text-2xl font-bold">Solicitar orçamento</h1>
      {offer && <p className="my-3">{offer.product} · {offer.seller}</p>}
      {offer && !sent && <form className="space-y-3" onSubmit={submit}>
        <label className="block">Nome<input className={input} name="name" required maxLength={100} autoComplete="name" /></label>
        <label className="block">Cidade e UF<input className={input} name="city" required maxLength={100} placeholder="Uberlândia/MG" /></label>
        <label className="block">CEP de entrega<input className={input} name="cep" required inputMode="numeric" pattern="[0-9]{5}-?[0-9]{3}" maxLength={9} autoComplete="postal-code" /></label>
        <label className="block">Quantidade<input className={input} name="quantity" required type="number" min="1" step="1" /></label>
        <label className="block">Canal de retorno<select className={input} name="channel" value={channel} onChange={event => setChannel(event.target.value)}>
          <option value="whatsapp">WhatsApp</option><option value="phone">Telefone</option><option value="email">E-mail</option>
        </select></label>
        <label className="block">{channel === 'email' ? 'E-mail' : 'Número com DDD'}
          <input key={channel} className={input} name="contact" required maxLength={254} type={channel === 'email' ? 'email' : 'tel'} />
        </label>
        <label className="flex gap-2 text-sm"><input type="checkbox" name="consent" required />
          Autorizo o envio dos dados a {offer.seller} para responder a este pedido pelo canal informado.
        </label>
        <button className={button} disabled={busy}>{busy ? 'Enviando…' : 'Enviar pedido'}</button>
      </form>}
      <p className="mt-3 text-sm" role="status">{message}</p>
    </section>
  </main>;
}
