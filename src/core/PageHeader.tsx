import type { ReactNode } from 'react'

type PageHeaderProps = {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
}

/** Shared first-level heading for every destination in the workspace. */
export default function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="intro">{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  )
}
