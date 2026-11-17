import { z } from 'zod';

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const idSchema = z.string().refine(
  (id) => id.trim().length > 0 && id === id.trim(),
  'ID 不能为空或包含首尾空格'
);

export const CategorySchema = z.object({
  id: idSchema,
  name: z.string().min(1, '星域名称不能为空'),
  en: z.string().optional().default(''),
  color: z.string().regex(HEX_COLOR_RE, '星域颜色必须是有效的十六进制色值 (如 #38bdf8)'),
});

export const StarNodeSchema = z.object({
  id: idSchema,
  name: z.string().min(1, '节点名称 name 不能为空'),
  en: z.string().optional().default(''),
  category: idSchema,
  formula: z.string().optional().default(''),
  summary: z.string().min(1, '节点简介 summary 不能为空'),
  points: z.array(z.string()).optional().default([]),
});

export const DirectedLinkSchema = z.object({
  source: idSchema,
  target: idSchema,
  relation: z.string().min(1, '关系标签 relation 不能为空'),
  description: z.string().min(1, '关系描述 description 不能为空'),
});

export const WormholeSchema = z.object({
  id: idSchema.optional(),
  anchorNodeId: idSchema,
  targetUniverseId: idSchema,
  targetNodeId: idSchema,
  color: z.string().regex(HEX_COLOR_RE, '虫洞颜色必须是十六进制色值').optional().default('#818cf8'),
  description: z.string().min(1, '虫洞描述 description 不能为空'),
});

export const TourStepSchema = z.object({
  nodeId: idSchema,
  narration: z.string().min(1, '导览解说 narration 不能为空'),
});

export const UniverseSchema = z.object({
  id: idSchema,
  name: z.string().min(1, '宇宙全称 name 不能为空'),
  shortName: z.string().min(1).optional(),
  icon: z.string().optional().default('✦'),
  subtitle: z.string().optional().default(''),
  categories: z.record(z.string(), CategorySchema).refine(
    (cats) => Object.keys(cats).length > 0,
    '至少需要定义一个星域分类 (categories)'
  ),
  anchors: z.record(z.string(), z.tuple([z.number(), z.number(), z.number()])).optional().default({}),
  nodes: z.array(StarNodeSchema).min(1, '平行宇宙至少需要包含 1 颗知识点星星'),
  links: z.array(DirectedLinkSchema).optional().default([]),
  wormholes: z.array(WormholeSchema).optional().default([]),
  tour: z.array(TourStepSchema).optional().default([]),
});

export const PatchSchema = z.object({
  mode: z.literal('patch').optional(),
  universeId: idSchema.optional(),
  nodes: z.array(StarNodeSchema).optional().default([]),
  links: z.array(DirectedLinkSchema).optional().default([]),
  wormholes: z.array(WormholeSchema).optional().default([]),
});

export type StarNode = z.infer<typeof StarNodeSchema>;
export type DirectedLink = z.infer<typeof DirectedLinkSchema>;
export type Wormhole = z.infer<typeof WormholeSchema>;
export type Universe = z.infer<typeof UniverseSchema>;
export type PatchPayload = z.infer<typeof PatchSchema>;

export const GraphSchema = PatchSchema.pick({ nodes: true, links: true, wormholes: true });

export type Graph = z.infer<typeof GraphSchema>;
type TargetedPatch = PatchPayload & { universeId: string };

interface ImportContext {
  activeUniverseId: string;
  categories: Universe['categories'];
  graph: Graph;
  hasUniverse: (id: string) => boolean;
  getUniverseNodes: (id: string) => ReadonlySet<string> | undefined;
}

type ValidationResult =
  | { ok: false; errors: string[] }
  | { ok: true; mode: 'patch'; data: TargetedPatch }
  | { ok: true; mode: 'universe'; data: Universe };

function formatZodIssues(issues: z.ZodIssue[]): string[] {
  return issues.map((issue) => {
    const path = issue.path.map(String).join('.');
    return path ? `[${path}] ${issue.message}` : issue.message;
  });
}

function checkGraphReferences(
  graph: Graph,
  categories: Universe['categories'],
  universeId: string,
  context: ImportContext,
  existing?: Graph
): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(existing?.nodes.map((node) => node.id));
  const wormholeIds = new Set(existing?.wormholes.flatMap((wh) => wh.id ? [wh.id] : []));
  const linkKeys = new Set(existing?.links.map(linkKey));
  const wormholeKeys = new Set(existing?.wormholes.map(wormholeKey));
  const targetNodes = new Map<string, ReadonlySet<string> | undefined>([[universeId, nodeIds]]);

  function linkKey(link: DirectedLink): string {
    return JSON.stringify([link.source, link.target, link.relation, link.description]);
  }

  function wormholeKey(wh: Wormhole): string {
    return JSON.stringify([wh.anchorNodeId, wh.targetUniverseId, wh.targetNodeId]);
  }

  graph.nodes.forEach((node, index) => {
    if (nodeIds.has(node.id)) errors.push(`[nodes.${index}.id] 节点 ID 已存在：${node.id}`);
    nodeIds.add(node.id);
    if (!Object.hasOwn(categories, node.category)) {
      errors.push(`[nodes.${index}.category] 星域不存在：${node.category}`);
    }
  });
  graph.links.forEach((link, index) => {
    for (const endpoint of ['source', 'target'] as const) {
      if (!nodeIds.has(link[endpoint])) {
        errors.push(`[links.${index}.${endpoint}] 节点不存在：${link[endpoint]}`);
      }
    }
    if (link.source === link.target) errors.push(`[links.${index}.target] 起点与终点必须不同`);
    const key = linkKey(link);
    if (linkKeys.has(key)) errors.push(`[links.${index}] 有向边已存在`);
    linkKeys.add(key);
  });
  graph.wormholes.forEach((wh, index) => {
    if (wh.id && wormholeIds.has(wh.id)) errors.push(`[wormholes.${index}.id] 虫洞 ID 已存在：${wh.id}`);
    if (wh.id) wormholeIds.add(wh.id);
    const key = wormholeKey(wh);
    if (wormholeKeys.has(key)) errors.push(`[wormholes.${index}] 该起点和目标之间已存在虫洞`);
    wormholeKeys.add(key);
    if (!nodeIds.has(wh.anchorNodeId)) {
      errors.push(`[wormholes.${index}.anchorNodeId] 锚点不存在：${wh.anchorNodeId}`);
    }
    if (!targetNodes.has(wh.targetUniverseId)) {
      targetNodes.set(wh.targetUniverseId, context.getUniverseNodes(wh.targetUniverseId));
    }
    const targets = targetNodes.get(wh.targetUniverseId);
    if (!targets) {
      errors.push(`[wormholes.${index}.targetUniverseId] 目标宇宙不存在：${wh.targetUniverseId}`);
    } else if (!targets.has(wh.targetNodeId)) {
      errors.push(`[wormholes.${index}.targetNodeId] 目标节点不存在：${wh.targetNodeId}`);
    }
  });
  return errors;
}

const UniverseImportSchema = z.object({ mode: z.literal('universe'), universe: UniverseSchema });

export function validateImportPayload(rawPayload: unknown, context: ImportContext): ValidationResult {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) {
    return { ok: false, errors: ['输入内容必须是一个 JSON 对象'] };
  }

  if ('mode' in rawPayload && rawPayload.mode === 'universe') {
    const parsed = UniverseImportSchema.safeParse(rawPayload);
    if (!parsed.success) return { ok: false, errors: formatZodIssues(parsed.error.issues) };

    const u = parsed.data.universe;
    const errors = checkGraphReferences(u, u.categories, u.id, context).map((error) =>
      error.replace('[', '[universe.')
    );
    if (context.hasUniverse(u.id)) errors.push(`[universe.id] 宇宙 ID 已存在：${u.id}`);
    for (const [key, cat] of Object.entries(u.categories)) {
      if (key !== cat.id || key === 'all') {
        errors.push(`[universe.categories.${key}.id] 星域 ID 必须与键名一致且不能使用 all`);
      }
    }
    for (const key of Object.keys(u.anchors)) {
      if (!Object.hasOwn(u.categories, key)) errors.push(`[universe.anchors.${key}] 星域不存在`);
    }
    const nodeIds = new Set(u.nodes.map((node) => node.id));
    u.tour.forEach((step, index) => {
      if (!nodeIds.has(step.nodeId)) {
        errors.push(`[universe.tour.${index}.nodeId] 导览节点不存在：${step.nodeId}`);
      }
    });
    return errors.length ? { ok: false, errors } : { ok: true, mode: 'universe', data: u };
  }

  const parsed = PatchSchema.safeParse(rawPayload);
  if (!parsed.success) return { ok: false, errors: formatZodIssues(parsed.error.issues) };

  const p = parsed.data;
  if (p.universeId && p.universeId !== context.activeUniverseId) {
    return {
      ok: false,
      errors: [`[universeId] 补丁目标为 ${p.universeId}，请先切换到该宇宙再导入`],
    };
  }
  if (p.nodes.length + p.links.length + p.wormholes.length === 0) {
    return { ok: false, errors: ['请选择至少一项要合入的节点、有向边或虫洞'] };
  }
  const errors = checkGraphReferences(p, context.categories, context.activeUniverseId, context, context.graph);
  return errors.length ? { ok: false, errors } : {
    ok: true, mode: 'patch', data: { ...p, universeId: context.activeUniverseId }
  };
}
