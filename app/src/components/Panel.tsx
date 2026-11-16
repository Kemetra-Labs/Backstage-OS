import type { ReactNode } from 'react';

interface Props {
  /** Unique id for aria-labelledby. */
  readonly id: string;
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly level?: 2 | 3;
  readonly tone?: 'default' | 'raised' | 'stage';
  /** Optional quiet controls or a count next to the heading. */
  readonly aside?: ReactNode;
  readonly className?: string;
  readonly testId?: string;
}

/** A titled section. One level of surface: panels never nest other panels. */
export function Panel({ id, title, children, level = 2, tone = 'default', aside, className, testId }: Props) {
  const H = level === 2 ? 'h2' : 'h3';
  return (
    <section className={`panel panel-${tone}${className ? ` ${className}` : ''}`} aria-labelledby={id} data-testid={testId}>
      <div className="panel-head">
        <H id={id}>{title}</H>
        {aside && <div className="panel-aside">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
