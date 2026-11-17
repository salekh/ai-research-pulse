'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Cpu,
  ExternalLink,
  Info,
  Layers,
  Sparkles,
  Tag,
  X,
} from 'lucide-react';
import { CompanyLogo } from '@/components/company-logo';
import {
  A2UIAction,
  A2UIComponent,
  BadgeComponent,
  ButtonComponent,
  CalloutComponent,
  CardComponent,
  CollapsibleComponent,
  ColumnComponent,
  DataTableComponent,
  DividerComponent,
  HeadingComponent,
  HeroBannerComponent,
  IconComponent,
  ListComponent,
  MetricCardComponent,
  ModalComponent,
  RowComponent,
  StepFlowComponent,
  StepItem,
  TabsComponent,
  TextComponent,
} from '@/lib/a2ui/spec';
import {
  EvalContext,
  resolveDynamicBoolean,
  resolveDynamicString,
  resolveDynamicStringList,
  resolveDynamicValue,
  sanitizeExternalUrl,
  sanitizePlainText,
} from '@/lib/a2ui/validator';

export interface RenderHelpers {
  renderNode: (
    id: string,
    ctxOverride?: EvalContext,
    options?: { inline?: boolean }
  ) => React.ReactNode;
  renderChildList: (
    children: ColumnComponent['children'],
    ctx: EvalContext
  ) => React.ReactNode[];
  onAction: (action: A2UIAction, ctx: EvalContext) => void;
}

const JUSTIFY_CLASS: Record<string, string> = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  spaceBetween: 'justify-between',
  spaceAround: 'justify-around',
  spaceEvenly: 'justify-evenly',
  stretch: 'justify-stretch',
};

const ALIGN_CLASS: Record<string, string> = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
};

const KNOWN_COMPANIES = new Set([
  'Google Research',
  'Google DeepMind',
  'Google Cloud AI',
  'OpenAI',
  'Anthropic',
  'Microsoft Research',
  'Meta AI',
  'x.AI',
  'Chinese Frontier',
]);

const LAB_ACCENTS: Record<string, { from: string; to: string }> = {
  'Google Research': { from: '#4285F4', to: '#34A853' },
  'Google DeepMind': { from: '#4471ED', to: '#4285F4' },
  'Google Cloud AI': { from: '#4285F4', to: '#FBBC05' },
  OpenAI: { from: '#10A37F', to: '#0764FF' },
  Anthropic: { from: '#EC4032', to: '#FF9302' },
  'Microsoft Research': { from: '#0764FF', to: '#42AB42' },
  'Meta AI': { from: '#0668E1', to: '#4471ED' },
  'x.AI': { from: '#202124', to: '#5F6368' },
  'Chinese Frontier': { from: '#DE2910', to: '#FFDE00' },
};

function getA11yProps(comp: A2UIComponent, ctx: EvalContext) {
  const a11y = comp.accessibility;
  if (!a11y) return {};
  const label = a11y.label ? resolveDynamicString(a11y.label, ctx) : undefined;
  const description = a11y.description
    ? resolveDynamicString(a11y.description, ctx)
    : undefined;
  const hidden =
    a11y.hidden !== undefined
      ? resolveDynamicBoolean(a11y.hidden, ctx)
      : undefined;
  return {
    ...(label ? { 'aria-label': label } : {}),
    ...(description ? { 'aria-description': description } : {}),
    ...(a11y.live && a11y.live !== 'off' ? { 'aria-live': a11y.live } : {}),
    ...(hidden ? { 'aria-hidden': true } : {}),
  };
}

// ============================================================================
// Basic Catalog v1.0 Component Renderers
// ============================================================================

export function renderColumn(
  comp: ColumnComponent,
  ctx: EvalContext,
  helpers: RenderHelpers
) {
  const justify = JUSTIFY_CLASS[comp.justify || 'start'] || 'justify-start';
  const align = ALIGN_CLASS[comp.align || 'stretch'] || 'items-stretch';
  return (
    <div
      key={comp.id}
      className={`flex flex-col gap-5 ${justify} ${align} min-w-0`}
      {...getA11yProps(comp, ctx)}
    >
      {helpers.renderChildList(comp.children, ctx)}
    </div>
  );
}

export function renderRow(
  comp: RowComponent,
  ctx: EvalContext,
  helpers: RenderHelpers
) {
  const justify = JUSTIFY_CLASS[comp.justify || 'start'] || 'justify-start';
  const align = ALIGN_CLASS[comp.align || 'center'] || 'items-center';
  return (
    <div
      key={comp.id}
      className={`flex flex-wrap gap-3 ${justify} ${align} min-w-0`}
      {...getA11yProps(comp, ctx)}
    >
      {helpers.renderChildList(comp.children, ctx)}
    </div>
  );
}

export function renderCard(
  comp: CardComponent,
  ctx: EvalContext,
  helpers: RenderHelpers
) {
  return (
    <div
      key={comp.id}
      className="rounded-xl border border-[#DADCE0] bg-white p-5 shadow-xs min-w-0"
      {...getA11yProps(comp, ctx)}
    >
      {helpers.renderNode(comp.child, ctx)}
    </div>
  );
}

export function renderList(
  comp: ListComponent,
  ctx: EvalContext,
  helpers: RenderHelpers
) {
  const items = helpers.renderChildList(comp.children, ctx);
  if (comp.direction === 'horizontal') {
    const colClass =
      items.length === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : items.length >= 4
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
        : 'grid-cols-1 sm:grid-cols-3';
    return (
      <div
        key={comp.id}
        className={`grid ${colClass} gap-3.5 min-w-0`}
        {...getA11yProps(comp, ctx)}
      >
        {items}
      </div>
    );
  }
  return (
    <div
      key={comp.id}
      className="flex flex-col gap-3 min-w-0"
      {...getA11yProps(comp, ctx)}
    >
      {items}
    </div>
  );
}

export function A2UITabsView({
  comp,
  ctx,
  helpers,
}: {
  comp: TabsComponent;
  ctx: EvalContext;
  helpers: RenderHelpers;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const safeIdx = Math.min(activeIndex, Math.max(0, comp.tabs.length - 1));
  const currentTab = comp.tabs[safeIdx];

  return (
    <div className="space-y-4 min-w-0" {...getA11yProps(comp, ctx)}>
      <div
        role="tablist"
        aria-label="Visual brief sections"
        className="flex flex-wrap gap-1 p-1 rounded-xl bg-white border border-[#DADCE0] shadow-xs"
      >
        {comp.tabs.map((tab, idx) => {
          const title = resolveDynamicString(tab.title, ctx) || `Section ${idx + 1}`;
          const isActive = idx === safeIdx;
          return (
            <button
              key={`${comp.id}-tab-${idx}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`${comp.id}-panel-${idx}`}
              id={`${comp.id}-tab-${idx}`}
              onClick={() => setActiveIndex(idx)}
              className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold font-display transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#202124] text-white shadow-xs'
                  : 'text-[#5F6368] hover:text-[#202124] hover:bg-[#F8F9FA]'
              }`}
            >
              {title}
            </button>
          );
        })}
      </div>

      {currentTab && (
        <div
          role="tabpanel"
          id={`${comp.id}-panel-${safeIdx}`}
          aria-labelledby={`${comp.id}-tab-${safeIdx}`}
          className="min-w-0"
        >
          {helpers.renderNode(currentTab.child, ctx)}
        </div>
      )}
    </div>
  );
}

export function renderDivider(comp: DividerComponent, ctx: EvalContext) {
  if (comp.axis === 'vertical') {
    return (
      <div
        key={comp.id}
        role="separator"
        aria-orientation="vertical"
        className="w-px self-stretch bg-[#DADCE0]"
        {...getA11yProps(comp, ctx)}
      />
    );
  }
  return (
    <hr
      key={comp.id}
      className="border-0 border-t border-[#DADCE0] my-1"
      {...getA11yProps(comp, ctx)}
    />
  );
}

export function renderText(
  comp: TextComponent,
  ctx: EvalContext,
  options?: { inline?: boolean }
) {
  const text = resolveDynamicString(comp.text, ctx);
  if (!text) return null;
  if (options?.inline) {
    return (
      <span key={comp.id} className="inline leading-none" {...getA11yProps(comp, ctx)}>
        {text}
      </span>
    );
  }
  if (comp.variant === 'caption') {
    return (
      <p
        key={comp.id}
        className="text-xs text-[#5F6368] font-mono leading-relaxed"
        {...getA11yProps(comp, ctx)}
      >
        {text}
      </p>
    );
  }
  return (
    <p
      key={comp.id}
      className="text-sm text-[#3C4043] font-sans leading-[1.65] max-w-[70ch]"
      {...getA11yProps(comp, ctx)}
    >
      {text}
    </p>
  );
}

export function renderButton(
  comp: ButtonComponent,
  ctx: EvalContext,
  helpers: RenderHelpers
) {
  const variant = comp.variant || 'default';
  const isOpenUrl =
    'functionCall' in comp.action && comp.action.functionCall['@call'] === 'openUrl';

  const variantClasses =
    variant === 'primary'
      ? 'bg-[#335CD6] hover:bg-[#274BB5] text-white border border-transparent shadow-xs [&_*]:text-white'
      : variant === 'borderless'
      ? 'bg-transparent hover:bg-[#E8F0FE] text-[#1967D2] border border-transparent [&_*]:text-[#1967D2]'
      : 'bg-white hover:border-[#4471ED] hover:text-[#1967D2] text-[#202124] border border-[#DADCE0]';

  // If button invokes openUrl, check URL safety upfront so broken/unsafe links disable cleanly
  let isUnsafeUrl = false;
  if (isOpenUrl && 'functionCall' in comp.action) {
    const rawUrl = resolveDynamicString(
      comp.action.functionCall.args?.url as TextComponent['text'],
      ctx
    );
    isUnsafeUrl = !sanitizeExternalUrl(rawUrl);
  }

  return (
    <button
      key={comp.id}
      type="button"
      disabled={isUnsafeUrl}
      onClick={() => helpers.onAction(comp.action, ctx)}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold font-display transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variantClasses}`}
      {...getA11yProps(comp, ctx)}
    >
      <span className="inline-flex items-center gap-1.5">
        {helpers.renderNode(comp.child, ctx, { inline: true })}
      </span>
      {isOpenUrl && <ExternalLink className="w-3.5 h-3.5 shrink-0" />}
    </button>
  );
}

export function renderIcon(comp: IconComponent, ctx: EvalContext) {
  const name = resolveDynamicString(comp.name, ctx).toLowerCase();
  const iconClass = 'w-4 h-4 shrink-0 text-[#4471ED]';
  switch (name) {
    case 'check':
      return <Check key={comp.id} className={iconClass} />;
    case 'warning':
    case 'error':
      return <AlertTriangle key={comp.id} className="w-4 h-4 shrink-0 text-[#EA4335]" />;
    case 'info':
    case 'help':
      return <Info key={comp.id} className={iconClass} />;
    case 'calendartoday':
    case 'event':
      return <Calendar key={comp.id} className={iconClass} />;
    case 'arrowforward':
      return <ArrowRight key={comp.id} className={iconClass} />;
    default:
      return <Sparkles key={comp.id} className={iconClass} />;
  }
}

export function A2UIModalView({
  comp,
  ctx,
  helpers,
}: {
  comp: ModalComponent;
  ctx: EvalContext;
  helpers: RenderHelpers;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div {...getA11yProps(comp, ctx)}>
      <div onClick={() => setOpen(true)} className="inline-block cursor-pointer">
        {helpers.renderNode(comp.trigger, ctx)}
      </div>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-[#202124]/60 backdrop-blur-xs p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-xl max-h-[80vh] overflow-y-auto rounded-2xl bg-white border border-[#DADCE0] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close dialog"
              className="absolute right-4 top-4 p-1.5 rounded-lg text-[#5F6368] hover:text-[#202124] hover:bg-[#F1F3F4] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            {helpers.renderNode(comp.content, ctx)}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Research Brief Extension Catalog v1.0 Renderers (FDE Corporate System)
// ============================================================================

export function renderHeroBanner(comp: HeroBannerComponent, ctx: EvalContext) {
  const title = resolveDynamicString(comp.title, ctx);
  const source = resolveDynamicString(comp.source, ctx);
  const date = comp.date ? resolveDynamicString(comp.date, ctx) : '';
  const significance = comp.significance
    ? resolveDynamicString(comp.significance, ctx)
    : '';
  const subtitle = comp.subtitle ? resolveDynamicString(comp.subtitle, ctx) : '';
  const tags = comp.tags ? resolveDynamicStringList(comp.tags, ctx) : [];

  const isKnownLab = KNOWN_COMPANIES.has(source);
  const labAccent = LAB_ACCENTS[source];

  return (
    <section
      key={comp.id}
      className="relative overflow-hidden rounded-2xl bg-[#202124] text-white border border-[#3C4043] shadow-sm"
      style={{
        backgroundImage: `url('/brand/bg_dark_aurora.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      {...getA11yProps(comp, ctx)}
    >
      {/* Per-Lab Canonical 4px Top Accent Bar (CONSTITUTION.md §2.1 F) */}
      {labAccent ? (
        <div
          className="h-1 w-full"
          style={{ background: `linear-gradient(90deg, ${labAccent.from}, ${labAccent.to})` }}
        />
      ) : (
        <div className="h-1.5 w-full fde-gradient-divider" />
      )}

      <div className="relative z-10 p-6 sm:p-7 space-y-4">
        {/* Lab Identity + Metadata Row */}
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-xs">
            {isKnownLab ? (
              <CompanyLogo
                company={source as Parameters<typeof CompanyLogo>[0]['company']}
                className="w-4 h-4"
              />
            ) : (
              <Layers className="w-3.5 h-3.5 text-[#8AB4F8]" />
            )}
            <span className="text-xs font-bold font-display tracking-tight text-white">
              {source}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 min-w-0">
            {significance && (
              <span
                title={significance}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#4471ED]/25 border border-[#4471ED]/50 text-[#8AB4F8] text-xs font-mono font-normal uppercase tracking-wide max-w-[200px]"
              >
                <Sparkles className="w-3 h-3 shrink-0" />
                <span className="truncate">{significance}</span>
              </span>
            )}
            {date && (
              <span className="inline-flex items-center gap-1.5 text-xs font-mono font-normal text-[#BABBBC] tabular-nums whitespace-nowrap shrink-0">
                <Calendar className="w-3.5 h-3.5 text-[#8AB4F8] shrink-0" />
                {date}
              </span>
            )}
          </div>
        </div>

        {/* Display Headline */}
        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold font-display text-white leading-[1.2] tracking-[-0.015em]">
            {title}
          </h2>
          {subtitle && (
            <p className="text-sm text-[#BABBBC] leading-relaxed max-w-[68ch]">
              {subtitle}
            </p>
          )}
        </div>

        {/* Taxonomy Chips */}
        {tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {tags.slice(0, 6).map((tag, i) => (
              <span
                key={`${comp.id}-tag-${i}`}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-mono bg-white/8 text-[#E8EAED] border border-white/15"
              >
                <Tag className="w-2.5 h-2.5 text-[#8AB4F8]" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function renderHeading(comp: HeadingComponent, ctx: EvalContext) {
  const text = resolveDynamicString(comp.text, ctx);
  const eyebrow = comp.eyebrow ? resolveDynamicString(comp.eyebrow, ctx) : '';
  const level = comp.level || 2;

  const sizeClass =
    level === 1
      ? 'text-xl sm:text-2xl font-bold'
      : level === 2
      ? 'text-base sm:text-lg font-bold'
      : level === 3
      ? 'text-sm sm:text-base font-bold'
      : 'text-sm font-semibold';

  const TagName = (`h${Math.min(4, Math.max(1, level))}` as 'h1' | 'h2' | 'h3' | 'h4');

  return (
    <div key={comp.id} className="space-y-1 min-w-0" {...getA11yProps(comp, ctx)}>
      {eyebrow && (
        <div className="text-xs font-display font-bold uppercase tracking-wider text-[#1967D2]">
          {eyebrow}
        </div>
      )}
      <TagName
        className={`${sizeClass} font-display text-[#202124] leading-snug tracking-[-0.015em]`}
      >
        {text}
      </TagName>
    </div>
  );
}

const METRIC_ACCENTS: Record<string, { bar: string; pillBg: string; pillText: string }> = {
  blue: { bar: '#4471ED', pillBg: 'bg-[#E8F0FE]', pillText: 'text-[#1967D2]' },
  green: { bar: '#34A853', pillBg: 'bg-[#E6F4EA]', pillText: 'text-[#137333]' },
  yellow: { bar: '#FBBC04', pillBg: 'bg-[#FEF7E0]', pillText: 'text-[#8F4E00]' },
  red: { bar: '#EA4335', pillBg: 'bg-[#FCE8E6]', pillText: 'text-[#C5221F]' },
  dark: { bar: '#202124', pillBg: 'bg-[#F1F3F4]', pillText: 'text-[#202124]' },
};

export function renderMetricCard(comp: MetricCardComponent, ctx: EvalContext) {
  const label = resolveDynamicString(comp.label, ctx);
  const value = resolveDynamicString(comp.value, ctx);
  const delta = comp.delta ? resolveDynamicString(comp.delta, ctx) : '';
  const context = comp.context ? resolveDynamicString(comp.context, ctx) : '';
  const accentKey = comp.accent
    ? resolveDynamicString(comp.accent as TextComponent['text'], ctx).toLowerCase()
    : 'blue';
  const style = METRIC_ACCENTS[accentKey] || METRIC_ACCENTS.blue;

  return (
    <div
      key={comp.id}
      className="relative overflow-hidden rounded-xl border border-[#DADCE0] bg-white shadow-xs flex flex-col justify-between min-w-0"
      {...getA11yProps(comp, ctx)}
    >
      <div className="h-1 w-full" style={{ backgroundColor: style.bar }} />
      <div className="p-4 space-y-2">
        <div className="text-[11px] font-display font-bold uppercase tracking-wider text-[#5F6368]">
          {label}
        </div>
        <div className="text-lg sm:text-xl font-bold font-display text-[#202124] tabular-nums leading-tight break-words">
          {value}
        </div>
        {delta && (
          <div>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-normal ${style.pillBg} ${style.pillText}`}
            >
              {delta}
            </span>
          </div>
        )}
        {context && (
          <p className="text-xs text-[#5F6368] leading-snug pt-0.5">{context}</p>
        )}
      </div>
    </div>
  );
}

const CALLOUT_STYLES: Record<
  string,
  { border: string; bg: string; title: string; icon: React.ComponentType<{ className?: string }> }
> = {
  innovation: {
    border: 'border-l-[#4471ED]',
    bg: 'bg-[#E8F0FE]/55',
    title: 'text-[#1967D2]',
    icon: Cpu,
  },
  info: {
    border: 'border-l-[#4285F4]',
    bg: 'bg-[#F8F9FA]',
    title: 'text-[#1967D2]',
    icon: Info,
  },
  success: {
    border: 'border-l-[#34A853]',
    bg: 'bg-[#E6F4EA]/60',
    title: 'text-[#137333]',
    icon: CheckCircle2,
  },
  warning: {
    border: 'border-l-[#FBBC04]',
    bg: 'bg-[#FEF7E0]/75',
    title: 'text-[#8F4E00]',
    icon: AlertTriangle,
  },
};

export function renderCallout(comp: CalloutComponent, ctx: EvalContext) {
  const title = resolveDynamicString(comp.title, ctx);
  const body = resolveDynamicString(comp.body, ctx);
  const toneKey = comp.tone
    ? resolveDynamicString(comp.tone as TextComponent['text'], ctx).toLowerCase()
    : 'info';
  const style = CALLOUT_STYLES[toneKey] || CALLOUT_STYLES.info;
  const Icon = style.icon;

  return (
    <div
      key={comp.id}
      className={`rounded-r-xl rounded-l-sm border border-[#DADCE0] border-l-4 ${style.border} ${style.bg} p-4 sm:p-5 space-y-1.5 min-w-0`}
      {...getA11yProps(comp, ctx)}
    >
      <div className={`flex items-center gap-2 text-xs font-display font-bold uppercase tracking-wider ${style.title}`}>
        <Icon className="w-4 h-4 shrink-0" />
        <span>{title}</span>
      </div>
      <p className="text-sm text-[#202124] leading-[1.6] max-w-[70ch]">{body}</p>
    </div>
  );
}

export function renderStepFlow(comp: StepFlowComponent, ctx: EvalContext) {
  const title = comp.title ? resolveDynamicString(comp.title, ctx) : '';
  const rawSteps = resolveDynamicValue<StepItem[]>(comp.steps, ctx);
  const steps = Array.isArray(rawSteps) ? rawSteps.slice(0, 8) : [];

  if (steps.length === 0) return null;

  return (
    <div
      key={comp.id}
      className="rounded-xl border border-[#DADCE0] bg-white p-5 space-y-4 min-w-0"
      {...getA11yProps(comp, ctx)}
    >
      {title && (
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-[#DADCE0]/70">
          <h4 className="text-sm font-bold font-display text-[#202124]">{title}</h4>
          <span className="text-[11px] font-mono text-[#5F6368] tabular-nums">
            {steps.length} Stages
          </span>
        </div>
      )}

      <ol className="space-y-3.5">
        {steps.map((item, idx) => {
          const stepNum = sanitizePlainText(item?.step ?? String(idx + 1).padStart(2, '0'));
          const stepTitle = sanitizePlainText(item?.title || `Stage ${idx + 1}`);
          const detail = sanitizePlainText(item?.detail || '');
          const tag = item?.tag ? sanitizePlainText(item.tag) : '';
          const isLast = idx === steps.length - 1;

          return (
            <li key={`${comp.id}-step-${idx}`} className="relative flex gap-3.5">
              {/* Timeline Rail + Numbered Medallion */}
              <div className="flex flex-col items-center shrink-0">
                <div className="w-7 h-7 rounded-lg bg-[#E8F0FE] border border-[#4471ED]/30 text-[#1967D2] font-mono font-normal text-xs tabular-nums flex items-center justify-center">
                  {stepNum}
                </div>
                {!isLast && <div className="w-px flex-1 bg-[#DADCE0] my-1.5" />}
              </div>

              {/* Step Content */}
              <div className={`flex-1 min-w-0 ${isLast ? 'pb-0' : 'pb-2'}`}>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-sm font-bold font-display text-[#202124]">
                    {stepTitle}
                  </span>
                  {tag && (
                    <span className="px-2 py-0.5 rounded bg-[#F8F9FA] border border-[#DADCE0] text-[11px] font-mono text-[#5F6368]">
                      {tag}
                    </span>
                  )}
                </div>
                {detail && (
                  <p className="text-xs sm:text-sm text-[#3C4043] leading-[1.6] max-w-[66ch]">
                    {detail}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function renderDataTable(comp: DataTableComponent, ctx: EvalContext) {
  const caption = comp.caption ? resolveDynamicString(comp.caption, ctx) : '';
  const columns = resolveDynamicStringList(comp.columns, ctx);
  const rawRows = resolveDynamicValue<Array<Array<string | number>>>(comp.rows, ctx);
  const rows = Array.isArray(rawRows) ? rawRows.slice(0, 20) : [];

  if (columns.length === 0) return null;

  return (
    <div
      key={comp.id}
      className="rounded-xl border border-[#DADCE0] bg-white overflow-hidden shadow-xs min-w-0"
      {...getA11yProps(comp, ctx)}
    >
      {caption && (
        <div className="px-4 py-3 border-b border-[#DADCE0] bg-[#F8F9FA] flex items-center justify-between gap-2">
          <span className="text-xs font-bold font-display text-[#202124]">{caption}</span>
          <span className="text-[11px] font-mono text-[#5F6368] tabular-nums">
            {rows.length} rows
          </span>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs sm:text-sm">
          <thead>
            <tr className="bg-[#E8F0FE] border-b border-[#DADCE0] text-[#202124]">
              {columns.map((col, idx) => (
                <th
                  key={`${comp.id}-col-${idx}`}
                  className="py-3 px-4 font-bold font-display whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#DADCE0]">
            {rows.map((row, rIdx) => {
              const cells = Array.isArray(row) ? row : [];
              return (
                <tr key={`${comp.id}-row-${rIdx}`} className="hover:bg-[#F8F9FA]">
                  {columns.map((_col, cIdx) => {
                    const cellText = sanitizePlainText(cells[cIdx] ?? '—');
                    const isNumeric = /^[-+]?\d[\d.,%x×]*$/.test(cellText);
                    return (
                      <td
                        key={`${comp.id}-cell-${rIdx}-${cIdx}`}
                        className={`py-3 px-4 align-top leading-relaxed ${
                          cIdx === 0
                            ? 'font-semibold text-[#202124] whitespace-nowrap'
                            : isNumeric
                            ? 'font-mono font-normal tabular-nums text-[#1967D2]'
                            : 'text-[#3C4043]'
                        }`}
                      >
                        {cellText}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function A2UICollapsibleView({
  comp,
  ctx,
  helpers,
}: {
  comp: CollapsibleComponent;
  ctx: EvalContext;
  helpers: RenderHelpers;
}) {
  const initialOpen =
    comp.defaultOpen !== undefined ? resolveDynamicBoolean(comp.defaultOpen, ctx) : false;
  const [open, setOpen] = useState(initialOpen);
  const title = resolveDynamicString(comp.title, ctx);
  const badge = comp.badge ? resolveDynamicString(comp.badge, ctx) : '';

  return (
    <div
      className="rounded-xl border border-[#DADCE0] bg-white overflow-hidden shadow-xs min-w-0"
      {...getA11yProps(comp, ctx)}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[#F8F9FA] transition-colors cursor-pointer"
      >
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="text-sm font-bold font-display text-[#202124]">{title}</span>
          {badge && (
            <span className="px-2 py-0.5 rounded bg-[#E8F0FE] text-[#1967D2] text-[11px] font-mono font-normal">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[#5F6368] shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180 text-[#4471ED]' : ''
          }`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-[#DADCE0]/70 bg-[#F8F9FA]/60">
          {helpers.renderNode(comp.child, ctx)}
        </div>
      )}
    </div>
  );
}

const BADGE_TONES: Record<string, string> = {
  default: 'bg-[#F8F9FA] text-[#202124] border-[#DADCE0]',
  primary: 'bg-[#E8F0FE] text-[#1967D2] border-[#4471ED]/30',
  success: 'bg-[#E6F4EA] text-[#137333] border-[#34A853]/30',
  warning: 'bg-[#FEF7E0] text-[#8F4E00] border-[#FBBC04]/40',
  danger: 'bg-[#FCE8E6] text-[#C5221F] border-[#EA4335]/30',
  dark: 'bg-[#202124] text-white border-[#3C4043]',
};

export function renderBadge(comp: BadgeComponent, ctx: EvalContext) {
  const label = resolveDynamicString(comp.label, ctx);
  const toneKey = comp.tone
    ? resolveDynamicString(comp.tone as TextComponent['text'], ctx).toLowerCase()
    : 'default';
  const toneClass = BADGE_TONES[toneKey] || BADGE_TONES.default;

  return (
    <span
      key={comp.id}
      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-mono font-normal border ${toneClass}`}
      {...getA11yProps(comp, ctx)}
    >
      {label}
    </span>
  );
}
