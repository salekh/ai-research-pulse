'use client';

import React, { useMemo, useCallback } from 'react';
import {
  A2UIAction,
  A2UIComponent,
  A2UIMessage,
  ChildList,
} from '@/lib/a2ui/spec';
import {
  A2UI_LIMITS,
  EvalContext,
  resolveDynamicString,
  resolveJsonPointer,
  sanitizeExternalUrl,
  validateA2UIPayload,
} from '@/lib/a2ui/validator';
import {
  A2UICollapsibleView,
  A2UIModalView,
  A2UITabsView,
  RenderHelpers,
  renderBadge,
  renderButton,
  renderCallout,
  renderCard,
  renderColumn,
  renderDataTable,
  renderDivider,
  renderHeading,
  renderHeroBanner,
  renderIcon,
  renderList,
  renderMetricCard,
  renderRow,
  renderStepFlow,
  renderText,
} from './catalog';

export interface A2UIRendererProps {
  messages: A2UIMessage[];
  onEventAction?: (name: string, context?: Record<string, unknown>) => void;
}

/**
 * Spec-compliant A2UI v1.0 Surface Renderer.
 * - Processes `createSurface`, `updateDataModel`, `updateComponents`, `deleteSurface`
 * - Enforces catalog allowlisting, cycle safety, and max depth
 * - Resolves RFC 6901 JSON Pointers (`@path`) and v1.0 catalog functions (`@call`, `@index`)
 */
export function A2UIRenderer({ messages, onEventAction }: A2UIRendererProps) {
  const validation = useMemo(() => validateA2UIPayload(messages), [messages]);

  const handleAction = useCallback(
    (action: A2UIAction, ctx: EvalContext) => {
      if ('functionCall' in action) {
        const fn = action.functionCall;
        if (fn['@call'] === 'openUrl') {
          const rawUrl = resolveDynamicString(
            fn.args?.url as string | { '@path': string },
            ctx
          );
          const safeUrl = sanitizeExternalUrl(rawUrl);
          if (safeUrl && typeof window !== 'undefined') {
            window.open(safeUrl, '_blank', 'noopener,noreferrer');
          }
        }
        return;
      }

      if ('event' in action && onEventAction) {
        onEventAction(action.event.name, action.event.context);
      }
    },
    [onEventAction]
  );

  if (!validation.valid || !validation.surface) {
    return (
      <div className="rounded-xl border border-[#EA4335]/40 bg-[#FCE8E6] p-5 text-sm text-[#C5221F] space-y-2">
        <div className="font-bold font-display">A2UI 1.0 Surface Validation Failed</div>
        <ul className="list-disc pl-5 text-xs font-mono space-y-1">
          {validation.errors.slice(0, 5).map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      </div>
    );
  }

  const surface = validation.surface;

  const renderById = (
    id: string,
    ctx: EvalContext,
    ancestors: Set<string>,
    depth: number,
    instanceKey?: string,
    options?: { inline?: boolean }
  ): React.ReactNode => {
    if (depth > A2UI_LIMITS.MAX_DEPTH) return null;
    if (ancestors.has(id)) return null;

    const comp: A2UIComponent | undefined = surface.components.get(id);
    if (!comp) return null;

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(id);

    const helpers: RenderHelpers = {
      renderNode: (childId, ctxOverride, childOptions) =>
        renderById(
          childId,
          ctxOverride ?? ctx,
          nextAncestors,
          depth + 1,
          instanceKey ? `${instanceKey}:${childId}` : undefined,
          childOptions
        ),
      renderChildList: (childList: ChildList, listCtx: EvalContext) => {
        if (Array.isArray(childList)) {
          return childList.map((childId, idx) => (
            <React.Fragment key={`${instanceKey || id}-${childId}-${idx}`}>
              {renderById(childId, listCtx, nextAncestors, depth + 1)}
            </React.Fragment>
          ));
        }

        // Dynamic ChildList template ({ componentId, path })
        const collection = resolveJsonPointer(
          listCtx.rootData,
          childList.path,
          listCtx.scopeData
        );
        if (!Array.isArray(collection)) return [];

        return collection
          .slice(0, A2UI_LIMITS.MAX_TEMPLATE_ITEMS)
          .map((item, idx) => {
            const itemCtx: EvalContext = {
              rootData: listCtx.rootData,
              scopeData: item,
              templateIndex: idx,
            };
            const tplKey = `${id}-tpl-${idx}`;
            return (
              <React.Fragment key={tplKey}>
                {renderById(
                  childList.componentId,
                  itemCtx,
                  nextAncestors,
                  depth + 1,
                  tplKey
                )}
              </React.Fragment>
            );
          });
      },
      onAction: handleAction,
    };

    const reactKey = instanceKey || comp.id;

    switch (comp.component) {
      case 'Column':
        return <React.Fragment key={reactKey}>{renderColumn(comp, ctx, helpers)}</React.Fragment>;
      case 'Row':
        return <React.Fragment key={reactKey}>{renderRow(comp, ctx, helpers)}</React.Fragment>;
      case 'Card':
        return <React.Fragment key={reactKey}>{renderCard(comp, ctx, helpers)}</React.Fragment>;
      case 'List':
        return <React.Fragment key={reactKey}>{renderList(comp, ctx, helpers)}</React.Fragment>;
      case 'Tabs':
        return <A2UITabsView key={reactKey} comp={comp} ctx={ctx} helpers={helpers} />;
      case 'Divider':
        return <React.Fragment key={reactKey}>{renderDivider(comp, ctx)}</React.Fragment>;
      case 'Text':
        return <React.Fragment key={reactKey}>{renderText(comp, ctx, options)}</React.Fragment>;
      case 'Button':
        return <React.Fragment key={reactKey}>{renderButton(comp, ctx, helpers)}</React.Fragment>;
      case 'Icon':
        return <React.Fragment key={reactKey}>{renderIcon(comp, ctx)}</React.Fragment>;
      case 'Modal':
        return <A2UIModalView key={reactKey} comp={comp} ctx={ctx} helpers={helpers} />;
      case 'HeroBanner':
        return <React.Fragment key={reactKey}>{renderHeroBanner(comp, ctx)}</React.Fragment>;
      case 'Heading':
        return <React.Fragment key={reactKey}>{renderHeading(comp, ctx)}</React.Fragment>;
      case 'MetricCard':
        return <React.Fragment key={reactKey}>{renderMetricCard(comp, ctx)}</React.Fragment>;
      case 'Callout':
        return <React.Fragment key={reactKey}>{renderCallout(comp, ctx)}</React.Fragment>;
      case 'StepFlow':
        return <React.Fragment key={reactKey}>{renderStepFlow(comp, ctx)}</React.Fragment>;
      case 'DataTable':
        return <React.Fragment key={reactKey}>{renderDataTable(comp, ctx)}</React.Fragment>;
      case 'Collapsible':
        return <A2UICollapsibleView key={reactKey} comp={comp} ctx={ctx} helpers={helpers} />;
      case 'Badge':
        return <React.Fragment key={reactKey}>{renderBadge(comp, ctx)}</React.Fragment>;
      default:
        return null;
    }
  };

  return (
    <div
      data-a2ui-surface={surface.surfaceId}
      data-a2ui-version="1.0"
      className="w-full min-w-0"
    >
      {renderById('root', { rootData: surface.dataModel }, new Set(), 0)}
    </div>
  );
}
