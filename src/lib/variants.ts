import type { Build, Origin, Pattern, Prompt } from './schema';
import type { DiagramSpec } from './diagram/types';

/** The id the pattern's own diagram, build and prompts go by as a variant (`#variant-standard`). Reserved. */
export const DEFAULT_VARIANT_ID = 'standard';
export const DEFAULT_VARIANT_NAME = 'Standard';

/** One tab of a pattern page, with every fallback to the parent already applied. */
export interface ResolvedVariant {
  id: string;
  name: string;
  /** Undefined for the default variant: the pattern summary already describes it. */
  summary?: string;
  isDefault: boolean;
  diagram: DiagramSpec;
  build: Build;
  prompts: Prompt[];
  origin: Origin;
}

/** The default variant first, then each declared variant with the parent's build, prompts and origin filled in. */
export function resolveVariants(p: Pattern): ResolvedVariant[] {
  const base: ResolvedVariant = {
    id: DEFAULT_VARIANT_ID, name: p.defaultVariantName ?? DEFAULT_VARIANT_NAME, isDefault: true,
    diagram: p.diagram as DiagramSpec, build: p.build, prompts: p.prompts, origin: p.origin,
  };
  return [base, ...(p.variants ?? []).map(v => ({
    id: v.id, name: v.name, summary: v.summary, isDefault: false,
    diagram: v.diagram as DiagramSpec, build: v.build ?? p.build, prompts: v.prompts ?? p.prompts, origin: v.origin ?? p.origin,
  }))];
}
