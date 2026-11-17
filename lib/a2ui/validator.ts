import {
  A2UIComponent,
  A2UIMessage,
  A2UISurfaceState,
  A2UIValidationResult,
  A2UI_PROTOCOL_VERSION,
  ALLOWED_CATALOG_COMPONENTS,
  ALLOWED_FUNCTIONS,
  ArticleInput,
  BASIC_CATALOG_ID,
  ChildList,
  ComponentId,
  DataBinding,
  DynamicBoolean,
  DynamicNumber,
  DynamicString,
  DynamicStringList,
  DynamicValue,
  FunctionCall,
  RESEARCH_BRIEF_CATALOG_ID,
  StepItem,
} from './spec';

export const A2UI_LIMITS = {
  MAX_MESSAGES: 32,
  MAX_COMPONENTS: 200,
  MAX_DEPTH: 24,
  MAX_TEMPLATE_ITEMS: 48,
} as const;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const UAX31_IDENT_RE = (() => {
  try {
    return new RegExp('^[\\p{ID_Start}_][\\p{ID_Continue}]*$', 'u');
  } catch {
    return /^[A-Za-z_][A-Za-z0-9_]*$/;
  }
})();

// ============================================================================
// Security & Text/URL Sanitization
// ============================================================================

/**
 * Strips raw HTML tags so untrusted text can never inject markup.
 */
export function sanitizePlainText(input: unknown): string {
  if (input === null || input === undefined) return '';
  const str = String(input);
  return str.replace(/<[^>]*>?/gm, '').replace(/\u00a0/g, ' ').trim();
}

/**
 * Strictly allowlists public http:// and https:// URLs.
 * Rejects javascript:, data:, vbscript:, loopback, link-local/metadata, and RFC1918 literal hosts.
 */
export function sanitizeExternalUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === 'metadata' ||
      host === 'metadata.google.internal' ||
      host === '::1' ||
      host === '::' ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^0\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

// ============================================================================
// RFC 6901 JSON Pointer Traversal & Mutation (Prototype-Pollution Safe)
// ============================================================================

function unescapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function parsePointerSegments(pointer: string): string[] | null {
  if (pointer === '' || pointer === '/') return [];
  const normalized = pointer.startsWith('/') ? pointer.slice(1) : pointer;
  const rawSegments = normalized.split('/');
  const segments: string[] = [];
  for (const raw of rawSegments) {
    const seg = unescapeJsonPointerSegment(raw);
    if (FORBIDDEN_KEYS.has(seg)) return null;
    segments.push(seg);
  }
  return segments;
}

/**
 * Resolves an RFC 6901 JSON Pointer against the surface data model.
 * - Paths starting with "/" resolve from rootData.
 * - Relative paths (e.g. "title", "./value") resolve from scopeData (inside List templates),
 *   falling back to rootData if no scope is active.
 */
export function resolveJsonPointer(
  rootData: Record<string, unknown>,
  pointer: string,
  scopeData?: unknown
): unknown {
  if (typeof pointer !== 'string') return undefined;
  const trimmed = pointer.trim();
  if (trimmed === '' || trimmed === '/') return rootData;

  const isAbsolute = trimmed.startsWith('/');
  const effectivePointer =
    !isAbsolute && trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
  const segments = parsePointerSegments(effectivePointer);
  if (!segments) return undefined;

  let current: unknown =
    !isAbsolute && scopeData !== undefined ? scopeData : rootData;

  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const idx = Number(seg);
      if (!Number.isInteger(idx) || idx < 0 || idx >= current.length) {
        return undefined;
      }
      current = current[idx];
    } else if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(record, seg)) {
        return undefined;
      }
      current = record[seg];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Immutably sets (or deletes when value === null) a JSON Pointer path on a data model.
 */
export function applyDataModelUpdate(
  rootData: Record<string, unknown>,
  path: string | undefined,
  value: unknown
): Record<string, unknown> {
  if (!path || path === '' || path === '/') {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return deepCloneSafe(value) as Record<string, unknown>;
    }
    return {};
  }

  const segments = parsePointerSegments(path);
  if (!segments || segments.length === 0) return rootData;

  const nextRoot = deepCloneSafe(rootData) as Record<string, unknown>;
  let cursor: Record<string, unknown> = nextRoot;

  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    const existing = cursor[seg];
    if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
      cursor[seg] = {};
    }
    cursor = cursor[seg] as Record<string, unknown>;
  }

  const leaf = segments[segments.length - 1];
  if (value === null) {
    delete cursor[leaf];
  } else {
    cursor[leaf] = deepCloneSafe(value);
  }
  return nextRoot;
}

function deepCloneSafe(value: unknown, depth = 0): unknown {
  if (depth > 20 || value === null || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepCloneSafe(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    // Unescape A2UI v1.0 literal "@" keys ("@@foo" -> "@foo") in plain data objects
    const key = k.startsWith('@@') ? k.slice(1) : k;
    out[key] = deepCloneSafe(v, depth + 1);
  }
  return out;
}

// ============================================================================
// Dynamic Value & Function Evaluation (A2UI v1.0 @path / @call / @index)
// ============================================================================

export interface EvalContext {
  rootData: Record<string, unknown>;
  scopeData?: unknown;
  templateIndex?: number;
}

export function isDataBinding(value: unknown): value is DataBinding {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    '@path' in value &&
    typeof (value as Record<string, unknown>)['@path'] === 'string' &&
    Object.keys(value).length === 1
  );
}

export function isFunctionCall(value: unknown): value is FunctionCall {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    '@call' in value &&
    typeof (value as Record<string, unknown>)['@call'] === 'string'
  );
}

function evaluateFunctionCall(
  fn: FunctionCall,
  ctx: EvalContext,
  depth: number
): unknown {
  if (depth > 8) return undefined;
  const name = fn['@call'];
  if (!ALLOWED_FUNCTIONS.has(name)) return undefined;
  const args = fn.args ?? {};

  switch (name) {
    case '@index': {
      // Strictly scoped to template iteration per A2UI v1.0 §2.7
      if (ctx.templateIndex === undefined) return undefined;
      const offsetRaw =
        args.offset !== undefined
          ? resolveDynamicNumber(args.offset as DynamicNumber, ctx, depth + 1)
          : 0;
      return ctx.templateIndex + (Number.isFinite(offsetRaw) ? offsetRaw : 0);
    }

    case 'formatString': {
      const template = resolveDynamicString(
        (args.value ?? '') as DynamicString,
        ctx,
        depth + 1
      );
      return interpolateFormatString(template, ctx);
    }

    case 'formatNumber': {
      const num = resolveDynamicNumber(args.value as DynamicNumber, ctx, depth + 1);
      if (!Number.isFinite(num)) return '';
      const decimals =
        args.decimals !== undefined
          ? resolveDynamicNumber(args.decimals as DynamicNumber, ctx, depth + 1)
          : undefined;
      const grouping =
        args.grouping !== undefined
          ? resolveDynamicBoolean(args.grouping as DynamicBoolean, ctx, depth + 1)
          : true;
      return new Intl.NumberFormat('en-US', {
        useGrouping: grouping,
        minimumFractionDigits:
          decimals !== undefined && Number.isFinite(decimals) ? Math.max(0, Math.min(6, decimals)) : undefined,
        maximumFractionDigits:
          decimals !== undefined && Number.isFinite(decimals) ? Math.max(0, Math.min(6, decimals)) : 2,
      }).format(num);
    }

    case 'formatDate': {
      const raw = resolveDynamicValue(args.value as DynamicValue, ctx, depth + 1);
      if (!raw) return '';
      const d = new Date(String(raw));
      if (Number.isNaN(d.getTime())) return String(raw);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }

    case 'pluralize': {
      const count = resolveDynamicNumber(args.value as DynamicNumber, ctx, depth + 1);
      const other = resolveDynamicString((args.other ?? '') as DynamicString, ctx, depth + 1);
      if (count === 0 && args.zero !== undefined) {
        return resolveDynamicString(args.zero as DynamicString, ctx, depth + 1);
      }
      if (count === 1 && args.one !== undefined) {
        return resolveDynamicString(args.one as DynamicString, ctx, depth + 1);
      }
      return other;
    }

    case 'and': {
      const vals = Array.isArray(args.values) ? args.values : [];
      return vals.every((v) => resolveDynamicBoolean(v as DynamicBoolean, ctx, depth + 1));
    }

    case 'or': {
      const vals = Array.isArray(args.values) ? args.values : [];
      return vals.some((v) => resolveDynamicBoolean(v as DynamicBoolean, ctx, depth + 1));
    }

    case 'not': {
      return !resolveDynamicBoolean(args.value as DynamicBoolean, ctx, depth + 1);
    }

    default:
      return undefined;
  }
}

function interpolateFormatString(template: string, ctx: EvalContext): string {
  // Handle escaped \${ first using sentinel
  const SENTINEL = '\u0000ESC_INTERP\u0000';
  const unescaped = template.replace(/\\\$\{/g, SENTINEL);
  const replaced = unescaped.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
    const trimmed = expr.trim();
    const resolved = resolveJsonPointer(ctx.rootData, trimmed, ctx.scopeData);
    return resolved === undefined || resolved === null ? '' : String(resolved);
  });
  return replaced.split(SENTINEL).join('${');
}

export function resolveDynamicValue<T = unknown>(
  value: DynamicValue<T> | undefined,
  ctx: EvalContext,
  depth = 0
): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (depth > 8) return undefined;
  if (isDataBinding(value)) {
    return resolveJsonPointer(ctx.rootData, value['@path'], ctx.scopeData) as T | undefined;
  }
  if (isFunctionCall(value)) {
    return evaluateFunctionCall(value, ctx, depth) as T | undefined;
  }
  return value as T;
}

export function resolveDynamicString(
  value: DynamicString | DynamicNumber | undefined,
  ctx: EvalContext,
  depth = 0
): string {
  const resolved = resolveDynamicValue(value as DynamicValue, ctx, depth);
  if (resolved === undefined || resolved === null) return '';
  return sanitizePlainText(resolved);
}

export function resolveDynamicNumber(
  value: DynamicNumber | undefined,
  ctx: EvalContext,
  depth = 0
): number {
  const resolved = resolveDynamicValue(value as DynamicValue, ctx, depth);
  if (typeof resolved === 'number') return resolved;
  if (typeof resolved === 'string' && resolved.trim() !== '') {
    const parsed = Number(resolved);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

export function resolveDynamicBoolean(
  value: DynamicBoolean | undefined,
  ctx: EvalContext,
  depth = 0
): boolean {
  const resolved = resolveDynamicValue(value as DynamicValue, ctx, depth);
  if (typeof resolved === 'boolean') return resolved;
  if (resolved && typeof resolved === 'object' && 'valid' in resolved) {
    return Boolean((resolved as { valid: unknown }).valid);
  }
  return Boolean(resolved);
}

export function resolveDynamicStringList(
  value: DynamicStringList | undefined,
  ctx: EvalContext,
  depth = 0
): string[] {
  const resolved = resolveDynamicValue(value as DynamicValue, ctx, depth);
  if (!Array.isArray(resolved)) return [];
  return resolved.map((item) => sanitizePlainText(item)).filter(Boolean);
}

// ============================================================================
// Strict A2UI v1.0 Message Processor & Graph Validator
// ============================================================================

function collectChildRefs(comp: A2UIComponent): ComponentId[] {
  const refs: ComponentId[] = [];
  const pushChildList = (list: ChildList | undefined) => {
    if (!list) return;
    if (Array.isArray(list)) {
      for (const id of list) {
        if (typeof id === 'string') refs.push(id);
      }
    } else if (typeof list === 'object' && typeof list.componentId === 'string') {
      refs.push(list.componentId);
    }
  };

  switch (comp.component) {
    case 'Column':
    case 'Row':
    case 'List':
      pushChildList(comp.children);
      break;
    case 'Card':
    case 'Button':
    case 'Collapsible':
      if (typeof comp.child === 'string') refs.push(comp.child);
      break;
    case 'Tabs':
      if (Array.isArray(comp.tabs)) {
        for (const tab of comp.tabs) {
          if (tab && typeof tab.child === 'string') refs.push(tab.child);
        }
      }
      break;
    case 'Modal':
      if (typeof comp.trigger === 'string') refs.push(comp.trigger);
      if (typeof comp.content === 'string') refs.push(comp.content);
      break;
    default:
      break;
  }
  return refs;
}

function validateComponentNode(
  raw: unknown,
  surfaceDefaultCatalog: string | undefined,
  errors: string[],
  warnings: string[]
): A2UIComponent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('Component entry must be a JSON object.');
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const id = obj.id;
  const type = obj.component;

  if (typeof id !== 'string' || !id.trim()) {
    errors.push('Component missing non-empty string "id".');
    return null;
  }
  if (typeof type !== 'string' || !type.trim()) {
    errors.push(`Component "${id}" missing "component" type.`);
    return null;
  }
  if (type === 'Surface') {
    errors.push(`Component "${id}" uses reserved type "Surface" (forbidden in v1.0).`);
    return null;
  }
  if (!UAX31_IDENT_RE.test(type)) {
    errors.push(`Component "${id}" type "${type}" violates UAX #31 identifier syntax.`);
    return null;
  }

  // Normalize legacy draft "@catalogId" if emitted by an LLM, preferring canonical v1.0 "catalogId"
  if (typeof obj['@catalogId'] === 'string' && !obj.catalogId) {
    obj.catalogId = obj['@catalogId'];
    delete obj['@catalogId'];
    warnings.push(`Component "${id}" normalized "@catalogId" -> canonical "catalogId".`);
  }

  // A2UI v1.0 §2.7 catalog resolution order: component.catalogId -> surface.catalogId -> error
  const resolvedCatalog =
    typeof obj.catalogId === 'string' && obj.catalogId.trim()
      ? obj.catalogId.trim()
      : surfaceDefaultCatalog;

  if (!resolvedCatalog) {
    errors.push(`Component "${id}" has no explicit or surface-default catalogId.`);
    return null;
  }

  const allowedSet = ALLOWED_CATALOG_COMPONENTS[resolvedCatalog];
  if (!allowedSet) {
    errors.push(`Component "${id}" references unallowlisted catalogId "${resolvedCatalog}".`);
    return null;
  }

  if (!allowedSet.has(type)) {
    // Check if the model forgot to set explicit catalogId for a known Research Brief component
    const fallbackCatalog =
      resolvedCatalog === BASIC_CATALOG_ID &&
      ALLOWED_CATALOG_COMPONENTS[RESEARCH_BRIEF_CATALOG_ID].has(type)
        ? RESEARCH_BRIEF_CATALOG_ID
        : resolvedCatalog === RESEARCH_BRIEF_CATALOG_ID &&
          ALLOWED_CATALOG_COMPONENTS[BASIC_CATALOG_ID].has(type)
        ? BASIC_CATALOG_ID
        : null;

    if (fallbackCatalog) {
      warnings.push(
        `Component "${id}" (${type}) auto-bound to catalog "${fallbackCatalog}" (missing explicit catalogId).`
      );
      obj.catalogId = fallbackCatalog;
    } else {
      errors.push(
        `Component "${id}" type "${type}" is not allowlisted in catalog "${resolvedCatalog}".`
      );
      return null;
    }
  }

  // Structural checks for required properties
  switch (type) {
    case 'Column':
    case 'Row':
    case 'List': {
      const children = obj.children;
      const isStatic = Array.isArray(children);
      const isTemplate =
        typeof children === 'object' &&
        children !== null &&
        typeof (children as Record<string, unknown>).componentId === 'string' &&
        typeof (children as Record<string, unknown>).path === 'string';
      if (!isStatic && !isTemplate) {
        errors.push(`Component "${id}" (${type}) requires valid ChildList "children".`);
        return null;
      }
      break;
    }
    case 'Card':
    case 'Collapsible': {
      if (typeof obj.child !== 'string' || !obj.child.trim()) {
        errors.push(`Component "${id}" (${type}) requires string "child" ComponentId.`);
        return null;
      }
      break;
    }
    case 'Tabs': {
      if (!Array.isArray(obj.tabs) || obj.tabs.length === 0) {
        errors.push(`Component "${id}" (Tabs) requires non-empty "tabs" array.`);
        return null;
      }
      break;
    }
    case 'Button': {
      if (typeof obj.child !== 'string' || !obj.action || typeof obj.action !== 'object') {
        errors.push(`Component "${id}" (Button) requires "child" and "action".`);
        return null;
      }
      break;
    }
    case 'Text': {
      if (obj.text === undefined) {
        errors.push(`Component "${id}" (Text) requires "text".`);
        return null;
      }
      break;
    }
    case 'Heading': {
      if (obj.text === undefined) {
        errors.push(`Component "${id}" (Heading) requires "text".`);
        return null;
      }
      break;
    }
    case 'HeroBanner': {
      if (obj.title === undefined || obj.source === undefined) {
        errors.push(`Component "${id}" (HeroBanner) requires "title" and "source".`);
        return null;
      }
      break;
    }
    case 'MetricCard': {
      if (obj.label === undefined || obj.value === undefined) {
        errors.push(`Component "${id}" (MetricCard) requires "label" and "value".`);
        return null;
      }
      break;
    }
    case 'Callout': {
      if (obj.title === undefined || obj.body === undefined) {
        errors.push(`Component "${id}" (Callout) requires "title" and "body".`);
        return null;
      }
      break;
    }
    case 'StepFlow': {
      if (obj.steps === undefined) {
        errors.push(`Component "${id}" (StepFlow) requires "steps".`);
        return null;
      }
      break;
    }
    case 'DataTable': {
      if (obj.columns === undefined || obj.rows === undefined) {
        errors.push(`Component "${id}" (DataTable) requires "columns" and "rows".`);
        return null;
      }
      break;
    }
    case 'Badge': {
      if (obj.label === undefined) {
        errors.push(`Component "${id}" (Badge) requires "label".`);
        return null;
      }
      break;
    }
    case 'Modal': {
      if (typeof obj.trigger !== 'string' || typeof obj.content !== 'string') {
        errors.push(`Component "${id}" (Modal) requires "trigger" and "content".`);
        return null;
      }
      break;
    }
    default:
      break;
  }

  return obj as unknown as A2UIComponent;
}

/**
 * Processes and validates a sequence of A2UI v1.0 messages into a resolved surface state.
 * Enforces version === "1.0", surface lifecycle integrity, allowlisted catalogs,
 * cycle-free adjacency graph, and max depth/component limits.
 */
export function validateA2UIPayload(messages: unknown): A2UIValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!Array.isArray(messages) || messages.length === 0) {
    return { valid: false, errors: ['A2UI payload must be a non-empty array of messages.'], warnings };
  }

  if (messages.length > A2UI_LIMITS.MAX_MESSAGES) {
    return {
      valid: false,
      errors: [`Payload exceeds max message limit (${A2UI_LIMITS.MAX_MESSAGES}).`],
      warnings,
    };
  }

  const surfaces = new Map<string, A2UISurfaceState>();
  let activeSurfaceId: string | null = null;

  for (let i = 0; i < messages.length; i++) {
    const rawMsg = messages[i];
    if (!rawMsg || typeof rawMsg !== 'object' || Array.isArray(rawMsg)) {
      errors.push(`Message[${i}] must be a JSON object.`);
      continue;
    }
    const msg = rawMsg as Record<string, unknown>;
    if (msg.version !== A2UI_PROTOCOL_VERSION) {
      errors.push(
        `Message[${i}] has invalid version "${String(msg.version)}" (expected "${A2UI_PROTOCOL_VERSION}").`
      );
      continue;
    }

    const envelopeKeys = Object.keys(msg).filter((k) => k !== 'version');
    if (envelopeKeys.length !== 1) {
      errors.push(
        `Message[${i}] must contain exactly one envelope key besides "version" (found: ${envelopeKeys.join(', ') || 'none'}).`
      );
      continue;
    }

    const kind = envelopeKeys[0];

    if (kind === 'createSurface') {
      const payload = msg.createSurface as Record<string, unknown>;
      if (!payload || typeof payload !== 'object') {
        errors.push(`Message[${i}].createSurface must be an object.`);
        continue;
      }
      if ('theme' in payload) {
        errors.push(`Message[${i}].createSurface includes forbidden v0.9 "theme" property.`);
        continue;
      }
      const surfaceId = payload.surfaceId;
      if (typeof surfaceId !== 'string' || !surfaceId.trim()) {
        errors.push(`Message[${i}].createSurface requires non-empty "surfaceId".`);
        continue;
      }
      if (surfaces.has(surfaceId)) {
        errors.push(
          `Message[${i}].createSurface violates surfaceId uniqueness ("${surfaceId}" already active).`
        );
        continue;
      }

      const catalogId =
        typeof payload.catalogId === 'string' ? payload.catalogId : undefined;
      if (catalogId && !ALLOWED_CATALOG_COMPONENTS[catalogId]) {
        errors.push(
          `Message[${i}].createSurface uses unallowlisted catalogId "${catalogId}".`
        );
        continue;
      }

      const surface: A2UISurfaceState = {
        surfaceId,
        catalogId,
        sendDataModel: Boolean(payload.sendDataModel),
        components: new Map(),
        dataModel: {},
      };

      // A2UI v1.0 spec: apply inline dataModel BEFORE components
      if (payload.dataModel !== undefined) {
        if (
          payload.dataModel &&
          typeof payload.dataModel === 'object' &&
          !Array.isArray(payload.dataModel)
        ) {
          surface.dataModel = deepCloneSafe(payload.dataModel) as Record<string, unknown>;
        } else {
          errors.push(`Message[${i}].createSurface.dataModel must be a plain JSON object.`);
        }
      }

      if (payload.components !== undefined) {
        if (!Array.isArray(payload.components)) {
          errors.push(`Message[${i}].createSurface.components must be an array.`);
        } else {
          for (const comp of payload.components) {
            if (surface.components.size >= A2UI_LIMITS.MAX_COMPONENTS) {
              errors.push(`Surface "${surfaceId}" exceeds max component limit (${A2UI_LIMITS.MAX_COMPONENTS}).`);
              break;
            }
            const validated = validateComponentNode(comp, surface.catalogId, errors, warnings);
            if (validated) surface.components.set(validated.id, validated);
          }
        }
      }

      surfaces.set(surfaceId, surface);
      activeSurfaceId = surfaceId;
    } else if (kind === 'updateComponents') {
      const payload = msg.updateComponents as Record<string, unknown>;
      const surfaceId = typeof payload?.surfaceId === 'string' ? payload.surfaceId : '';
      const surface = surfaces.get(surfaceId);
      if (!surface) {
        errors.push(`Message[${i}].updateComponents targets unknown surfaceId "${surfaceId}".`);
        continue;
      }
      if (!Array.isArray(payload.components) || payload.components.length === 0) {
        errors.push(`Message[${i}].updateComponents requires non-empty "components" array.`);
        continue;
      }
      for (const comp of payload.components) {
        if (surface.components.size >= A2UI_LIMITS.MAX_COMPONENTS) {
          errors.push(`Surface "${surfaceId}" exceeds max component limit (${A2UI_LIMITS.MAX_COMPONENTS}).`);
          break;
        }
        const validated = validateComponentNode(comp, surface.catalogId, errors, warnings);
        if (validated) surface.components.set(validated.id, validated);
      }
      activeSurfaceId = surfaceId;
    } else if (kind === 'updateDataModel') {
      const payload = msg.updateDataModel as Record<string, unknown>;
      const surfaceId = typeof payload?.surfaceId === 'string' ? payload.surfaceId : '';
      const surface = surfaces.get(surfaceId);
      if (!surface) {
        errors.push(`Message[${i}].updateDataModel targets unknown surfaceId "${surfaceId}".`);
        continue;
      }
      if (!('value' in payload)) {
        errors.push(`Message[${i}].updateDataModel requires "value" field (v1.0).`);
        continue;
      }
      const path = typeof payload.path === 'string' ? payload.path : '/';
      surface.dataModel = applyDataModelUpdate(surface.dataModel, path, payload.value);
    } else if (kind === 'deleteSurface') {
      const payload = msg.deleteSurface as Record<string, unknown>;
      const surfaceId = typeof payload?.surfaceId === 'string' ? payload.surfaceId : '';
      if (!surfaces.has(surfaceId)) {
        warnings.push(`Message[${i}].deleteSurface targets non-existent surfaceId "${surfaceId}".`);
      } else {
        surfaces.delete(surfaceId);
        if (activeSurfaceId === surfaceId) activeSurfaceId = null;
      }
    } else if (kind === 'callRendererFunction' || kind === 'agentFunctionResponse') {
      // Valid v1.0 envelope types (no-op for static visual brief rendering)
    } else {
      errors.push(`Message[${i}] contains unsupported envelope key "${kind}".`);
    }
  }

  if (!activeSurfaceId || !surfaces.has(activeSurfaceId)) {
    errors.push('No active surface remains after processing messages.');
    return { valid: false, errors, warnings };
  }

  const surface = surfaces.get(activeSurfaceId)!;

  if (!surface.components.has('root')) {
    errors.push(`Surface "${surface.surfaceId}" is missing required component with id "root".`);
    return { valid: false, errors, warnings };
  }

  // DFS cycle detection, dangling child check, and depth guard from "root"
  const visiting = new Set<string>();
  const dfs = (id: string, depth: number) => {
    if (depth > A2UI_LIMITS.MAX_DEPTH) {
      errors.push(`Component tree exceeds max depth (${A2UI_LIMITS.MAX_DEPTH}) at "${id}".`);
      return;
    }
    if (visiting.has(id)) {
      errors.push(`Cycle detected in component adjacency graph at "${id}".`);
      return;
    }
    const node = surface.components.get(id);
    if (!node) {
      warnings.push(`Dangling child reference "${id}" not found in surface components.`);
      return;
    }
    visiting.add(id);
    const children = collectChildRefs(node);
    for (const childId of children) {
      dfs(childId, depth + 1);
    }
    visiting.delete(id);
  };

  dfs('root', 0);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    surface: errors.length === 0 ? surface : undefined,
  };
}

// ============================================================================
// Deterministic Fallback A2UI 1.0 Visual Brief Builder
// ============================================================================

export function buildSurfaceId(link: string, title: string): string {
  const seed = `${link}|${title}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `brief_${(hash >>> 0).toString(36)}`;
}

function splitCleanSentences(text: string): string[] {
  return sanitizePlainText(text)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 28 && !/cookie|privacy policy|sign in|subscribe/i.test(s));
}

function formatIsoDateLabel(rawDate: string): string {
  try {
    const d = new Date(rawDate);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    }
  } catch {}
  return sanitizePlainText(rawDate) || 'Recent';
}

/**
 * Generates a guaranteed-valid, corporate-styled A2UI v1.0 3-message payload
 * (createSurface -> updateDataModel -> updateComponents) when LLM generation
 * is unavailable or fails strict validation.
 */
export function buildFallbackA2UIBrief(
  article: ArticleInput,
  extractedText?: string
): { surfaceId: string; messages: A2UIMessage[] } {
  const surfaceId = buildSurfaceId(article.link || article.title, article.title);
  const cleanTitle = sanitizePlainText(article.title) || 'Untitled Research Publication';
  const cleanSource = sanitizePlainText(article.source) || 'Frontier AI Lab';
  const formattedDate = formatIsoDateLabel(article.date);
  const safeUrl = sanitizeExternalUrl(article.link) || 'https://research.google/';
  const tags =
    article.tags && article.tags.length > 0
      ? article.tags.slice(0, 5).map(sanitizePlainText).filter(Boolean)
      : ['Frontier AI', 'Research'];

  const bodyText = sanitizePlainText(
    extractedText || article.summary || article.snippet || cleanTitle
  );
  const sentences = splitCleanSentences(bodyText);

  const executiveSummary =
    sanitizePlainText(article.summary) ||
    sentences.slice(0, 3).join(' ') ||
    `${cleanSource} presents "${cleanTitle}", detailing technical methodology, empirical findings, and production implications for modern AI systems.`;

  const coreInnovation =
    sanitizePlainText(article.keyInnovation) ||
    sentences[0] ||
    `Introduces a structured approach to ${cleanTitle.toLowerCase()}, targeting higher capability and engineering efficiency.`;

  const significanceLabel =
    sanitizePlainText(article.significance) ||
    (/introducing|system card|frontier|release|model/i.test(cleanTitle)
      ? 'Breakthrough'
      : 'Technical Research');

  const steps: StepItem[] = [
    {
      step: '01',
      title: 'Problem Formulation',
      detail:
        sentences[0] ||
        `Defines core technical bottlenecks addressed by ${cleanSource} in ${tags[0] || 'AI systems'}.`,
      tag: 'Scope',
    },
    {
      step: '02',
      title: 'Core Architecture & Method',
      detail:
        sentences[1] ||
        coreInnovation,
      tag: 'Method',
    },
    {
      step: '03',
      title: 'Empirical Evaluation',
      detail:
        sentences[2] ||
        'Evaluates performance, generalization, and resource trade-offs against frontier baselines.',
      tag: 'Benchmarks',
    },
    {
      step: '04',
      title: 'Production Readiness',
      detail:
        sentences[3] ||
        'Assesses deployment considerations, latency/cost envelopes, and enterprise adoption paths.',
      tag: 'Deployment',
    },
  ];

  const excerpt =
    bodyText.length > 120
      ? bodyText.slice(0, 1200) + (bodyText.length > 1200 ? '…' : '')
      : executiveSummary;

  const dataModel: Record<string, unknown> = {
    article: {
      title: cleanTitle,
      source: cleanSource,
      date: formattedDate,
      link: safeUrl,
      significance: significanceLabel,
      subtitle: `${cleanSource} · Published ${formattedDate}`,
      tags,
    },
    synthesis: {
      innovationTitle: 'Core Technical Contribution',
      innovationBody: coreInnovation,
      summary: executiveSummary,
    },
    metrics: [
      {
        label: 'Research Lab',
        value: cleanSource,
        delta: significanceLabel,
        context: 'Primary publishing institution',
        accent: 'blue',
      },
      {
        label: 'Publication Date',
        value: formattedDate,
        delta: `${tags.length} taxonomy tags`,
        context: 'Indexed in Research Pulse corpus',
        accent: 'green',
      },
      {
        label: 'Primary Focus',
        value: tags[0] || 'Frontier AI',
        delta: tags[1] || 'Applied ML',
        context: 'Core research domain classification',
        accent: 'yellow',
      },
    ],
    pipeline: steps,
    comparison: {
      columns: ['Dimension', 'Publication Signal', 'FDE Engineering Lens'],
      rows: [
        ['Publishing Lab', cleanSource, 'Monitor cross-lab convergence & API parity'],
        ['Research Domain', tags.slice(0, 3).join(', '), 'Map to enterprise workload patterns'],
        ['Maturity Signal', significanceLabel, 'Assess benchmark reproducibility & latency'],
        ['Source Verification', 'Primary publication linked', 'Review full paper & ablations before rollout'],
      ],
    },
    takeaways: {
      title: 'Key Engineering Takeaways',
      body:
        sentences.slice(0, 2).join(' ') ||
        'Review the primary methodology and evaluate applicability to current enterprise inference, retrieval, or agentic workloads.',
    },
    caveats: {
      title: 'Caveats & Verification Notes',
      body:
        'This structured visual brief was synthesized deterministically from indexed article metadata and extracted text. Inspect the full source publication for complete hyperparameter tables, benchmark confidence intervals, and safety evaluations.',
    },
    deepDive: {
      excerpt,
    },
  };

  const components: A2UIComponent[] = [
    {
      id: 'root',
      component: 'Column',
      children: [
        'hero_banner',
        'exec_section',
        'metrics_section',
        'main_tabs',
        'divider_footer',
        'citation_footer',
      ],
    },
    {
      id: 'hero_banner',
      catalogId: RESEARCH_BRIEF_CATALOG_ID,
      component: 'HeroBanner',
      title: { '@path': '/article/title' },
      source: { '@path': '/article/source' },
      date: { '@path': '/article/date' },
      significance: { '@path': '/article/significance' },
      subtitle: { '@path': '/article/subtitle' },
      tags: { '@path': '/article/tags' },
    },
    {
      id: 'exec_section',
      component: 'Column',
      children: ['exec_heading', 'innovation_callout', 'exec_summary_card'],
    },
    {
      id: 'exec_heading',
      catalogId: RESEARCH_BRIEF_CATALOG_ID,
      component: 'Heading',
      level: 2,
      eyebrow: 'Executive Synthesis',
      text: 'Technical Overview & Core Contribution',
    },
    {
      id: 'innovation_callout',
      catalogId: RESEARCH_BRIEF_CATALOG_ID,
      component: 'Callout',
      tone: 'innovation',
      title: { '@path': '/synthesis/innovationTitle' },
      body: { '@path': '/synthesis/innovationBody' },
    },
    {
      id: 'exec_summary_card',
      component: 'Card',
      child: 'exec_summary_text',
    },
    {
      id: 'exec_summary_text',
      component: 'Text',
      variant: 'body',
      text: { '@path': '/synthesis/summary' },
    },
    {
      id: 'metrics_section',
      component: 'Column',
      children: ['metrics_heading', 'metrics_list'],
    },
    {
      id: 'metrics_heading',
      catalogId: RESEARCH_BRIEF_CATALOG_ID,
      component: 'Heading',
      level: 3,
      eyebrow: 'Key Signals',
      text: 'At-a-Glance Metadata & Benchmarks',
    },
    {
      id: 'metrics_list',
      component: 'List',
      direction: 'horizontal',
      children: {
        componentId: 'metric_card_tpl',
        path: '/metrics',
      },
    },
    {
      id: 'metric_card_tpl',
      catalogId: RESEARCH_BRIEF_CATALOG_ID,
      component: 'MetricCard',
      label: { '@path': 'label' },
      value: { '@path': 'value' },
      delta: { '@path': 'delta' },
      context: { '@path': 'context' },
      accent: { '@path': 'accent' },
    },
    {
      id: 'main_tabs',
      component: 'Tabs',
      tabs: [
        { title: 'Methodology & Flow', child: 'tab_methodology' },
        { title: 'Comparative Matrix', child: 'tab_comparison' },
        { title: 'Takeaways & Deep Dive', child: 'tab_takeaways' },
      ],
    },
    {
      id: 'tab_methodology',
      component: 'Column',
      children: ['step_flow'],
    },
    {
      id: 'step_flow',
      catalogId: RESEARCH_BRIEF_CATALOG_ID,
      component: 'StepFlow',
      title: 'Architecture & Methodology Pipeline',
      steps: { '@path': '/pipeline' },
    },
    {
      id: 'tab_comparison',
      component: 'Column',
      children: ['comparison_table'],
    },
    {
      id: 'comparison_table',
      catalogId: RESEARCH_BRIEF_CATALOG_ID,
      component: 'DataTable',
      caption: 'Structured Dimension & Engineering Impact Breakdown',
      columns: { '@path': '/comparison/columns' },
      rows: { '@path': '/comparison/rows' },
    },
    {
      id: 'tab_takeaways',
      component: 'Column',
      children: ['takeaways_callout', 'caveats_callout', 'deep_dive_collapsible'],
    },
    {
      id: 'takeaways_callout',
      catalogId: RESEARCH_BRIEF_CATALOG_ID,
      component: 'Callout',
      tone: 'success',
      title: { '@path': '/takeaways/title' },
      body: { '@path': '/takeaways/body' },
    },
    {
      id: 'caveats_callout',
      catalogId: RESEARCH_BRIEF_CATALOG_ID,
      component: 'Callout',
      tone: 'warning',
      title: { '@path': '/caveats/title' },
      body: { '@path': '/caveats/body' },
    },
    {
      id: 'deep_dive_collapsible',
      catalogId: RESEARCH_BRIEF_CATALOG_ID,
      component: 'Collapsible',
      title: 'Source Excerpt & Grounding Context',
      badge: 'Primary Text',
      defaultOpen: false,
      child: 'deep_dive_text',
    },
    {
      id: 'deep_dive_text',
      component: 'Text',
      variant: 'body',
      text: { '@path': '/deepDive/excerpt' },
    },
    {
      id: 'divider_footer',
      component: 'Divider',
      axis: 'horizontal',
    },
    {
      id: 'citation_footer',
      component: 'Row',
      justify: 'spaceBetween',
      align: 'center',
      children: ['citation_caption', 'source_button'],
    },
    {
      id: 'citation_caption',
      component: 'Text',
      variant: 'caption',
      text: {
        '@call': 'formatString',
        args: { value: 'Primary source: ${/article/source} · ${/article/date}' },
      },
    },
    {
      id: 'source_button',
      component: 'Button',
      variant: 'primary',
      child: 'source_button_label',
      action: {
        functionCall: {
          '@call': 'openUrl',
          args: { url: { '@path': '/article/link' } },
        },
      },
    },
    {
      id: 'source_button_label',
      component: 'Text',
      variant: 'body',
      text: 'Open Original Publication',
    },
  ];

  const messages: A2UIMessage[] = [
    {
      version: A2UI_PROTOCOL_VERSION,
      createSurface: {
        surfaceId,
        catalogId: BASIC_CATALOG_ID,
        sendDataModel: false,
      },
    },
    {
      version: A2UI_PROTOCOL_VERSION,
      updateDataModel: {
        surfaceId,
        path: '/',
        value: dataModel,
      },
    },
    {
      version: A2UI_PROTOCOL_VERSION,
      updateComponents: {
        surfaceId,
        components,
      },
    },
  ];

  return { surfaceId, messages };
}
