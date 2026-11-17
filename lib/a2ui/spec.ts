/**
 * A2UI v1.0 Specification Types & Multi-Catalog Contract
 *
 * Conforms strictly to the official A2UI v1.0 wire specification:
 * - Envelope: https://a2ui.org/specification/v1_0/agent_to_renderer.json
 * - Common types: https://a2ui.org/specification/v1_0/common_types.json
 * - Basic Catalog v1.0: https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json
 * - Extension Catalog: https://research-pulse.ai-tech.google/a2ui/v1_0/research_brief_catalog.json
 */

export const A2UI_PROTOCOL_VERSION = '1.0' as const;
export const A2UI_MIME_TYPE = 'application/a2ui+json' as const;

export const BASIC_CATALOG_ID =
  'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json' as const;
export const RESEARCH_BRIEF_CATALOG_ID =
  'https://research-pulse.ai-tech.google/a2ui/v1_0/research_brief_catalog.json' as const;

export const SUPPORTED_CATALOG_IDS = [
  BASIC_CATALOG_ID,
  RESEARCH_BRIEF_CATALOG_ID,
] as const;

export type SupportedCatalogId = (typeof SUPPORTED_CATALOG_IDS)[number];

export const BASIC_CATALOG_COMPONENTS = [
  'Column',
  'Row',
  'Card',
  'List',
  'Tabs',
  'Divider',
  'Text',
  'Button',
  'Icon',
  'Modal',
] as const;

export const RESEARCH_BRIEF_COMPONENTS = [
  'HeroBanner',
  'Heading',
  'MetricCard',
  'Callout',
  'StepFlow',
  'DataTable',
  'Collapsible',
  'Badge',
] as const;

export type BasicComponentType = (typeof BASIC_CATALOG_COMPONENTS)[number];
export type ResearchBriefComponentType = (typeof RESEARCH_BRIEF_COMPONENTS)[number];
export type AllowedComponentType = BasicComponentType | ResearchBriefComponentType;

export const ALLOWED_CATALOG_COMPONENTS: Record<string, ReadonlySet<string>> = {
  [BASIC_CATALOG_ID]: new Set<string>(BASIC_CATALOG_COMPONENTS),
  [RESEARCH_BRIEF_CATALOG_ID]: new Set<string>(RESEARCH_BRIEF_COMPONENTS),
};

export const ALLOWED_FUNCTIONS = new Set<string>([
  'formatString',
  'formatNumber',
  'formatDate',
  'pluralize',
  'openUrl',
  'and',
  'or',
  'not',
  '@index',
]);

// ============================================================================
// Common Types (common_types.json)
// ============================================================================

export type ComponentId = string;
export type CallId = string;

export interface DataBinding {
  '@path': string;
}

export interface FunctionCall {
  '@call': string;
  catalogId?: string;
  args?: Record<string, unknown>;
}

export type DynamicValue<T = unknown> = T | DataBinding | FunctionCall;
export type DynamicString = string | DataBinding | FunctionCall;
export type DynamicNumber = number | DataBinding | FunctionCall;
export type DynamicBoolean = boolean | DataBinding | FunctionCall;
export type DynamicStringList = string[] | DataBinding | FunctionCall;

export interface ChildListTemplate {
  componentId: ComponentId;
  /** Unprefixed JSON Pointer path per A2UI v1.0 ChildList specification */
  path: string;
}

export type ChildList = ComponentId[] | ChildListTemplate;

export interface AccessibilityAttributes {
  label?: DynamicString;
  description?: DynamicString;
  live?: 'off' | 'polite' | 'assertive';
  hidden?: DynamicBoolean;
}

export interface ComponentMetadata {
  extensions?: Record<string, unknown>;
}

export interface ComponentCommon {
  id: ComponentId;
  /** Explicit catalog override for A2UI 1.0 multi-catalog mixing */
  catalogId?: string;
  accessibility?: AccessibilityAttributes;
  metadata?: ComponentMetadata;
  weight?: number;
}

export interface ActionEvent {
  event: {
    name: string;
    userMessage?: DynamicString;
    context?: Record<string, DynamicValue>;
  };
}

export interface ActionFunctionCall {
  functionCall: FunctionCall;
}

export type A2UIAction = ActionEvent | ActionFunctionCall;

// ============================================================================
// Basic Catalog v1.0 Components
// ============================================================================

export interface ColumnComponent extends ComponentCommon {
  component: 'Column';
  children: ChildList;
  justify?:
    | 'start'
    | 'center'
    | 'end'
    | 'spaceBetween'
    | 'spaceAround'
    | 'spaceEvenly'
    | 'stretch';
  align?: 'start' | 'center' | 'end' | 'stretch';
}

export interface RowComponent extends ComponentCommon {
  component: 'Row';
  children: ChildList;
  justify?:
    | 'start'
    | 'center'
    | 'end'
    | 'spaceBetween'
    | 'spaceAround'
    | 'spaceEvenly'
    | 'stretch';
  align?: 'start' | 'center' | 'end' | 'stretch';
}

export interface CardComponent extends ComponentCommon {
  component: 'Card';
  child: ComponentId;
}

export interface ListComponent extends ComponentCommon {
  component: 'List';
  children: ChildList;
  direction?: 'vertical' | 'horizontal';
  align?: 'start' | 'center' | 'end' | 'stretch';
}

export interface TabItem {
  title: DynamicString;
  child: ComponentId;
}

export interface TabsComponent extends ComponentCommon {
  component: 'Tabs';
  tabs: TabItem[];
}

export interface DividerComponent extends ComponentCommon {
  component: 'Divider';
  axis?: 'horizontal' | 'vertical';
}

export interface TextComponent extends ComponentCommon {
  component: 'Text';
  text: DynamicString;
  variant?: 'body' | 'caption';
}

export interface ButtonComponent extends ComponentCommon {
  component: 'Button';
  child: ComponentId;
  variant?: 'default' | 'primary' | 'borderless';
  action: A2UIAction;
}

export interface IconComponent extends ComponentCommon {
  component: 'Icon';
  name: string | DataBinding;
}

export interface ModalComponent extends ComponentCommon {
  component: 'Modal';
  trigger: ComponentId;
  content: ComponentId;
}

// ============================================================================
// Research Brief Extension Catalog v1.0 Components (FDE Corporate System)
// ============================================================================

export type SemanticAccent = 'blue' | 'green' | 'yellow' | 'red' | 'dark';
export type CalloutTone = 'info' | 'innovation' | 'warning' | 'success';
export type BadgeTone = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'dark';

export interface HeroBannerComponent extends ComponentCommon {
  component: 'HeroBanner';
  title: DynamicString;
  source: DynamicString;
  date?: DynamicString;
  significance?: DynamicString;
  subtitle?: DynamicString;
  tags?: DynamicStringList;
}

export interface HeadingComponent extends ComponentCommon {
  component: 'Heading';
  text: DynamicString;
  level?: 1 | 2 | 3 | 4;
  eyebrow?: DynamicString;
}

export interface MetricCardComponent extends ComponentCommon {
  component: 'MetricCard';
  label: DynamicString;
  value: DynamicString | DynamicNumber;
  delta?: DynamicString;
  context?: DynamicString;
  accent?: SemanticAccent | DataBinding;
}

export interface CalloutComponent extends ComponentCommon {
  component: 'Callout';
  title: DynamicString;
  body: DynamicString;
  tone?: CalloutTone | DataBinding;
}

export interface StepItem {
  step?: string | number;
  title: string;
  detail: string;
  tag?: string;
}

export interface StepFlowComponent extends ComponentCommon {
  component: 'StepFlow';
  title?: DynamicString;
  steps: DynamicValue<StepItem[]>;
}

export interface DataTableComponent extends ComponentCommon {
  component: 'DataTable';
  caption?: DynamicString;
  columns: DynamicStringList;
  rows: DynamicValue<Array<Array<string | number>>>;
}

export interface CollapsibleComponent extends ComponentCommon {
  component: 'Collapsible';
  title: DynamicString;
  badge?: DynamicString;
  defaultOpen?: DynamicBoolean;
  child: ComponentId;
}

export interface BadgeComponent extends ComponentCommon {
  component: 'Badge';
  label: DynamicString;
  tone?: BadgeTone | DataBinding;
}

export type A2UIComponent =
  | ColumnComponent
  | RowComponent
  | CardComponent
  | ListComponent
  | TabsComponent
  | DividerComponent
  | TextComponent
  | ButtonComponent
  | IconComponent
  | ModalComponent
  | HeroBannerComponent
  | HeadingComponent
  | MetricCardComponent
  | CalloutComponent
  | StepFlowComponent
  | DataTableComponent
  | CollapsibleComponent
  | BadgeComponent;

// ============================================================================
// Wire Message Envelopes (agent_to_renderer.json v1.0)
// ============================================================================

export interface CreateSurfacePayload {
  surfaceId: string;
  catalogId?: string;
  sendDataModel?: boolean;
  components?: A2UIComponent[];
  dataModel?: Record<string, unknown>;
  metadata?: ComponentMetadata;
}

export interface CreateSurfaceMessage {
  version: typeof A2UI_PROTOCOL_VERSION;
  createSurface: CreateSurfacePayload;
}

export interface UpdateComponentsMessage {
  version: typeof A2UI_PROTOCOL_VERSION;
  updateComponents: {
    surfaceId: string;
    components: A2UIComponent[];
  };
}

export interface UpdateDataModelMessage {
  version: typeof A2UI_PROTOCOL_VERSION;
  updateDataModel: {
    surfaceId: string;
    /** Unprefixed JSON Pointer; omit or "/" targets the root data model */
    path?: string;
    /** Required in A2UI v1.0; explicit null deletes the key at path */
    value: unknown;
  };
}

export interface DeleteSurfaceMessage {
  version: typeof A2UI_PROTOCOL_VERSION;
  deleteSurface: {
    surfaceId: string;
  };
}

export interface CallRendererFunctionMessage {
  version: typeof A2UI_PROTOCOL_VERSION;
  callRendererFunction: {
    surfaceId?: string;
    functionCallId: CallId;
    callFunction: FunctionCall & { catalogId: string };
  };
}

export interface AgentFunctionResponseMessage {
  version: typeof A2UI_PROTOCOL_VERSION;
  agentFunctionResponse: {
    functionCallId: CallId;
    value?: unknown;
    error?: { code: string; message: string };
  };
}

export type A2UIMessage =
  | CreateSurfaceMessage
  | UpdateComponentsMessage
  | UpdateDataModelMessage
  | DeleteSurfaceMessage
  | CallRendererFunctionMessage
  | AgentFunctionResponseMessage;

// ============================================================================
// Application API & Surface State Types
// ============================================================================

export interface ArticleInput {
  title: string;
  link: string;
  source: string;
  date: string;
  snippet?: string;
  summary?: string;
  keyInnovation?: string;
  significance?: string;
  tags?: string[];
}

export interface A2UISurfaceState {
  surfaceId: string;
  catalogId?: string;
  sendDataModel: boolean;
  components: Map<ComponentId, A2UIComponent>;
  dataModel: Record<string, unknown>;
}

export interface A2UIValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  surface?: A2UISurfaceState;
}

export interface A2UIApiResponse {
  version: typeof A2UI_PROTOCOL_VERSION;
  surfaceId: string;
  messages: A2UIMessage[];
  modelUsed: string;
  cached: boolean;
  fallback: boolean;
  generatedAt: string;
  validationWarnings?: string[];
}
