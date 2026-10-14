export const NODE_KINDS = ['io','llm','tool','router','evaluator','aggregator','memory','human','guard','agent'] as const;
export type NodeKind = typeof NODE_KINDS[number];
export type NodeSize = 'sm' | 'md' | 'lg';
export const LABEL_MAX: Record<NodeSize, number> = { sm: 10, md: 16, lg: 22 };
export const SUBLABEL_MAX = 24;
export const DEFAULT_SIZE: Record<NodeKind, NodeSize> = { io: 'sm', llm: 'md', tool: 'md', router: 'md', evaluator: 'md', aggregator: 'md', memory: 'md', human: 'md', guard: 'md', agent: 'md' };
export interface DiagramNode { id: string; kind: NodeKind; label: string; sublabel?: string; description?: string; size?: NodeSize; pos?: { x: number; y: number }; hidden?: boolean; model?: boolean }
export type EdgeStyle = 'solid' | 'dashed' | 'loop';
export interface DiagramEdge { id: string; from: string; to: string; label?: string; style?: EdgeStyle; description?: string; example?: string }
export interface DiagramGroup { id: string; label: string; children: string[] }
export type TokenKind = 'prompt' | 'tool-call' | 'result' | 'feedback' | 'tokens';
export type ActivateStatus = 'thinking' | 'calling' | 'waiting' | 'done' | 'error';
export type At = [number, number];
export type DiagramEvent =
  | { type: 'send'; edge: string; token: { kind: TokenKind; label?: string }; at?: At }
  | { type: 'activate'; node: string; status: ActivateStatus; at?: At }
  | { type: 'branch'; node: string; taken: string; notTaken?: string[]; at?: At }
  | { type: 'appear'; node: string; at?: At }
  | { type: 'read'; node: string; at?: At }
  | { type: 'write'; node: string; at?: At };
export interface CodeRef { block: string; lines: string }
export interface Step { id: string; caption: string; duration?: number; events: DiagramEvent[]; codeRef?: CodeRef; repeat?: number }
export interface Scenario { id: string; label: string; steps: Step[] }
export interface DiagramSpec { direction?: 'RIGHT' | 'DOWN'; groups?: DiagramGroup[]; nodes: DiagramNode[]; edges: DiagramEdge[]; scenarios: Scenario[] }
export interface CodeBlock { id: string; title: string; lang: 'python' | 'markdown' | 'text'; source: string }
