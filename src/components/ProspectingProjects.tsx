import { useEffect, useState } from 'react';
import { deleteField, doc, FieldPath, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { EntityType } from '../types';

export interface ProspectingSetup {
  product: string;
  location: string;
  mode: 'b2c' | 'evidence' | 'potential';
  segment: string;
  sectors: string;
  audience: EntityType;
  count: number;
  objective: string;
  objectiveCustom: boolean;
  sourceLinks: string;
  marketplaces: boolean;
}
interface Project { id: string; name: string; setup: ProspectingSetup }
const modeLabel = { b2c: 'Intenção de compra B2C', potential: 'Empresas por segmento', evidence: 'Fontes públicas' };

export function ProspectingProjects({ userId, setup, busy, onLoad }: {
  userId: string;
  setup: ProspectingSetup;
  busy: boolean;
  onLoad: (setup: ProspectingSetup) => void;
}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setProjects([]);
    setMessage('');
    return onSnapshot(doc(db, 'users', userId), snapshot => {
      const entries = snapshot.data()?.prospectingProjects || {};
      setProjects(Object.values(entries) as Project[]);
    }, () => setMessage('Não foi possível carregar os projetos. Confira sua conexão e sessão.'));
  }, [userId]);

  async function save() {
    if (!name.trim() || !setup.product.trim()) {
      setMessage('Informe o nome do projeto e o produto ou nicho na busca.');
      return;
    }
    setSaving(true);
    try {
      const id = crypto.randomUUID();
      await setDoc(doc(db, 'users', userId), {
        prospectingProjects: { [id]: { id, name: name.trim(), setup } },
      }, { merge: true });
      setName('');
      setMessage('Projeto salvo. Use Carregar filtros e depois Buscar para executar.');
    } catch {
      setMessage('Falha ao salvar. O projeto ainda não foi confirmado.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', userId), new FieldPath('prospectingProjects', id), deleteField());
      setMessage('Projeto removido.');
    } catch {
      setMessage('Não foi possível remover o projeto.');
    } finally {
      setSaving(false);
    }
  }

  return <details className="rounded-xl border border-zinc-700 bg-zinc-950 p-4">
    <summary className="cursor-pointer font-semibold text-white">Projetos de prospecção</summary>
    <p className="my-3 text-xs text-zinc-400">Salve produto, região, segmento, quantidade e fontes na sua conta. Carregue um projeto para repetir a pesquisa.</p>
    <div className="flex flex-wrap gap-2">
      <input aria-label="Nome do projeto" maxLength={100} value={name} onChange={event => setName(event.target.value)}
        placeholder="Ex.: Tinta para telhado · Brasil" disabled={busy || saving}
        className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm text-white" />
      <button type="button" disabled={busy || saving} onClick={() => void save()}
        className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:opacity-50">Salvar filtros atuais</button>
    </div>
    <p role="status" className="my-2 text-xs text-zinc-300">{message}</p>
    <ul className="space-y-3">
      {projects.map(project => <li key={project.id} className="border-t border-zinc-800 pt-3 text-sm text-zinc-300">
        <strong className="text-white">{project.name}</strong>
        <p>{project.setup.product} · {project.setup.location || 'Brasil'} · {project.setup.count} contatos</p>
        <p className="text-xs">{modeLabel[project.setup.mode]}</p>
        <div className="mt-2 flex gap-4">
          <button type="button" disabled={busy || saving} onClick={() => {
            onLoad(project.setup);
            setMessage(`Filtros de "${project.name}" carregados. Clique em Buscar.`);
          }} className="text-indigo-300 disabled:opacity-50">Carregar filtros</button>
          <button type="button" disabled={busy || saving} onClick={() => void remove(project.id)}
            className="text-zinc-400 disabled:opacity-50">Remover projeto</button>
        </div>
      </li>)}
    </ul>
    {!projects.length && <p className="mt-2 text-xs text-zinc-500">Seus projetos salvos aparecerão aqui.</p>}
  </details>;
}
