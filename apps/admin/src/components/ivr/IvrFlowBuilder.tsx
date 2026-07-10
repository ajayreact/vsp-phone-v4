'use client';

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export const NODE_TYPES = [
  { type: 'start', label: 'Start', category: 'Flow' },
  { type: 'greeting', label: 'Greeting', category: 'Audio' },
  { type: 'play_audio', label: 'Play Audio', category: 'Audio' },
  { type: 'tts', label: 'Text To Speech', category: 'Audio' },
  { type: 'collect_digits', label: 'Collect Digits', category: 'Input' },
  { type: 'menu', label: 'Menu', category: 'Input' },
  { type: 'route_extension', label: 'Route To Extension', category: 'Route' },
  { type: 'route_ring_group', label: 'Route To Ring Group', category: 'Route' },
  { type: 'route_queue', label: 'Route To Queue', category: 'Route' },
  { type: 'route_ivr', label: 'Route To IVR', category: 'Route' },
  { type: 'route_conference', label: 'Route To Conference', category: 'Route' },
  { type: 'route_voicemail', label: 'Route To Voicemail', category: 'Route' },
  { type: 'route_external', label: 'Route To External', category: 'Route' },
  { type: 'route_sip_uri', label: 'Route To SIP URI', category: 'Route' },
  { type: 'webhook', label: 'Webhook', category: 'Integration' },
  { type: 'rest_api', label: 'REST API', category: 'Integration' },
  { type: 'condition', label: 'Condition', category: 'Logic' },
  { type: 'time_condition', label: 'Time Condition', category: 'Logic' },
  { type: 'holiday_condition', label: 'Holiday Condition', category: 'Logic' },
  { type: 'business_hours', label: 'Business Hours', category: 'Logic' },
  { type: 'closed_hours', label: 'Closed Hours', category: 'Logic' },
  { type: 'announcement', label: 'Announcement', category: 'Audio' },
  { type: 'wait', label: 'Wait', category: 'Flow' },
  { type: 'loop', label: 'Loop', category: 'Flow' },
  { type: 'set_variable', label: 'Set Variable', category: 'Variables' },
  { type: 'goto', label: 'Goto', category: 'Flow' },
  { type: 'disconnect', label: 'Disconnect', category: 'Flow' },
  { type: 'error', label: 'Error', category: 'Flow' },
] as const;

type FlowGraph = {
  nodes: Node[];
  edges: Edge[];
  variables?: Record<string, unknown>;
};

type Props = {
  initialFlow?: FlowGraph | null;
  canWrite: boolean;
  onSave: (flow: FlowGraph) => Promise<void>;
  onPublish: () => Promise<void>;
  onSimulate: (digits: string) => Promise<Record<string, unknown>>;
  isSaving?: boolean;
  isPublishing?: boolean;
};

function parseFlow(raw: unknown): FlowGraph {
  const flow = raw as { nodes?: Node[]; edges?: Edge[]; variables?: Record<string, unknown> } | null;
  return {
    nodes: (flow?.nodes ?? []).map((n) => ({ ...n, data: { label: (n.data as { label?: string })?.label ?? n.type, ...(n.data as object) } })),
    edges: flow?.edges ?? [],
    variables: flow?.variables ?? {},
  };
}

export function IvrFlowBuilder({
  initialFlow,
  canWrite,
  onSave,
  onPublish,
  onSimulate,
  isSaving,
  isPublishing,
}: Props) {
  const parsed = useMemo(() => parseFlow(initialFlow), [initialFlow]);
  const [nodes, setNodes, onNodesChange] = useNodesState(parsed.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(parsed.edges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [history, setHistory] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const [simulateDigits, setSimulateDigits] = useState('');
  const [simulateResult, setSimulateResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setNodes(parsed.nodes);
    setEdges(parsed.edges);
  }, [parsed.nodes, parsed.edges, setNodes, setEdges]);

  const pushHistory = useCallback(() => {
    setHistory((h) => [...h.slice(-19), { nodes: [...nodes], edges: [...edges] }]);
    setRedoStack([]);
  }, [nodes, edges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      pushHistory();
      setEdges((eds) => addEdge(connection, eds));
    },
    [pushHistory, setEdges],
  );

  const addNode = (type: string, label: string) => {
    pushHistory();
    const id = `${type}-${Date.now()}`;
    setNodes((nds) => [
      ...nds,
      {
        id,
        type: 'default',
        position: { x: 100 + nds.length * 30, y: 100 + nds.length * 20 },
        data: { label, nodeType: type },
      },
    ]);
  };

  const flowPayload = (): FlowGraph => ({
    nodes: nodes.map((n) => ({
      ...n,
      type: String((n.data as { nodeType?: string }).nodeType ?? n.type ?? 'default'),
    })),
    edges,
    variables: parsed.variables,
  });

  const handleSave = async () => {
    setError(null);
    try {
      await onSave(flowPayload());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const handleAutoSave = useCallback(() => {
    if (!canWrite) return;
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    autoSaveRef.current = setTimeout(() => {
      void onSave(flowPayload());
    }, 3000);
  }, [canWrite, onSave, nodes, edges, parsed.variables]);

  useEffect(() => {
    handleAutoSave();
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    };
  }, [nodes, edges, handleAutoSave]);

  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setRedoStack((r) => [...r, { nodes, edges }]);
    setNodes(prev.nodes);
    setEdges(prev.edges);
    setHistory((h) => h.slice(0, -1));
  };

  const redo = () => {
    const next = redoStack.at(-1);
    if (!next) return;
    setHistory((h) => [...h, { nodes, edges }]);
    setNodes(next.nodes);
    setEdges(next.edges);
    setRedoStack((r) => r.slice(0, -1));
  };

  const updateSelectedLabel = (label: string) => {
    if (!selectedNode) return;
    pushHistory();
    setNodes((nds) =>
      nds.map((n) => (n.id === selectedNode.id ? { ...n, data: { ...n.data, label } } : n)),
    );
    setSelectedNode((s) => (s ? { ...s, data: { ...s.data, label } } : s));
  };

  const groupedNodes = useMemo(() => {
    const groups: Record<string, typeof NODE_TYPES[number][]> = {};
    for (const n of NODE_TYPES) {
      groups[n.category] = groups[n.category] ?? [];
      groups[n.category].push(n);
    }
    return groups;
  }, []);

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[500px] flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {canWrite ? (
          <>
            <Button size="sm" onClick={() => void handleSave()} disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save Draft'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void onPublish()} disabled={isPublishing}>
              {isPublishing ? 'Publishing…' : 'Publish'}
            </Button>
          </>
        ) : null}
        <Button size="sm" variant="ghost" onClick={undo} disabled={!history.length}>Undo</Button>
        <Button size="sm" variant="ghost" onClick={redo} disabled={!redoStack.length}>Redo</Button>
        <div className="ml-auto flex items-center gap-2">
          <Input
            placeholder="Simulate digits (e.g. 1,2)"
            value={simulateDigits}
            onChange={(e) => setSimulateDigits(e.target.value)}
            className="w-40"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const digits = simulateDigits.split(/[,\s]+/).filter(Boolean);
              const result = await onSimulate(digits.join(''));
              setSimulateResult(result);
            }}
          >
            Simulate
          </Button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex min-h-0 flex-1 gap-3">
        <aside className="w-52 shrink-0 overflow-y-auto rounded-lg border bg-card p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Node Library</p>
          {Object.entries(groupedNodes).map(([category, items]) => (
            <div key={category} className="mb-3">
              <p className="mb-1 text-xs text-muted-foreground">{category}</p>
              <div className="flex flex-col gap-1">
                {items.map((n) => (
                  <button
                    key={n.type}
                    type="button"
                    disabled={!canWrite}
                    onClick={() => addNode(n.type, n.label)}
                    className="rounded border px-2 py-1 text-left text-xs hover:bg-muted disabled:opacity-50"
                  >
                    {n.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </aside>

        <div className="min-w-0 flex-1 rounded-lg border">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={canWrite ? onNodesChange : undefined}
            onEdgesChange={canWrite ? onEdgesChange : undefined}
            onConnect={canWrite ? onConnect : undefined}
            onNodeClick={(_, node) => setSelectedNode(node)}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>

        <aside className="w-64 shrink-0 overflow-y-auto rounded-lg border bg-card p-3">
          <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Properties</p>
          {selectedNode ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{String((selectedNode.data as { label?: string }).label ?? '')}</p>
              <p className="text-xs text-muted-foreground">Type: {String((selectedNode.data as { nodeType?: string }).nodeType ?? selectedNode.type)}</p>
              {canWrite ? (
                <Input
                  value={String((selectedNode.data as { label?: string }).label ?? '')}
                  onChange={(e) => updateSelectedLabel(e.target.value)}
                  placeholder="Node label"
                />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select a node to edit properties.</p>
          )}

          {simulateResult ? (
            <div className="mt-4">
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Simulation</p>
              <pre className="max-h-48 overflow-auto rounded bg-muted p-2 text-xs">
                {JSON.stringify(simulateResult, null, 2)}
              </pre>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
