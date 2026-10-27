/**
 * The widget bundle's entry. Built as one IIFE that exposes `window.OkfWidgets`, which
 * scripts/okf-view.mjs calls for every ```widget block in a concept.
 */

import {
  Component,
  StrictMode,
  type ComponentType,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import styles from './widgets.css?inline';
import Eligibility from './widgets/Eligibility.tsx';
import RequestMemory from './widgets/RequestMemory.tsx';
import RlsPlayground from './widgets/RlsPlayground.tsx';
import SummaryStats from './widgets/SummaryStats.tsx';
import WeekBounds from './widgets/WeekBounds.tsx';

export const WIDGETS: Readonly<
  Record<string, { title: string; component: ComponentType }>
> = {
  'week-bounds': { title: 'Try it: bound the week', component: WeekBounds },
  eligibility: {
    title: 'Try it: who counts as eligible',
    component: Eligibility,
  },
  'summary-stats': {
    title: 'Try it: from responses to summary',
    component: SummaryStats,
  },
  'rls-playground': {
    title: 'Try it: the policy on responses',
    component: RlsPlayground,
  },
  'request-memory': {
    title: 'Try it: sharing the transaction',
    component: RequestMemory,
  },
};

class Boundary extends Component<
  { children: ReactNode },
  { failed: string | null }
> {
  state = { failed: null as string | null };

  static getDerivedStateFromError(error: unknown) {
    return { failed: error instanceof Error ? error.message : String(error) };
  }

  render() {
    if (this.state.failed !== null) {
      return (
        <p className="okfw-error">
          This widget failed to render: {this.state.failed}
        </p>
      );
    }
    return this.props.children;
  }
}

const roots = new Set<Root>();

function injectStyles() {
  if (document.getElementById('okfw-styles')) return;
  const style = document.createElement('style');
  style.id = 'okfw-styles';
  style.textContent = styles;
  document.head.append(style);
}

/** Render widget `name` into `element`. Returns false for an unknown name. */
export function mount(element: HTMLElement, name: string): boolean {
  const widget = WIDGETS[name];
  if (!widget) return false;
  injectStyles();
  const root = createRoot(element);
  const Widget = widget.component;
  root.render(
    <StrictMode>
      <figure className="okfw" data-widget={name}>
        <figcaption>{widget.title}</figcaption>
        <Boundary>
          <Widget />
        </Boundary>
      </figure>
    </StrictMode>,
  );
  roots.add(root);
  return true;
}

/** Unmount every widget, before the viewer replaces the reading pane. */
export function unmountAll(): void {
  for (const root of roots) root.unmount();
  roots.clear();
}

export const names = Object.keys(WIDGETS);
