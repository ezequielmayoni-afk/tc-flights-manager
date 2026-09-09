import Link from 'next/link'

export interface BreadcrumbItem {
  label: string
  /** Sin href es el último tramo (la página actual). */
  href?: string
  /** Los links a siviajo.com salen del sitio: van con `<a>`. */
  external?: boolean
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Miga de pan" className="flex flex-wrap items-center gap-1 text-xs text-[#6C757D]">
      {items.map((item, i) => (
        <span key={item.label} className="flex items-center gap-1">
          {i > 0 && <span aria-hidden="true">›</span>}
          {item.href ? (
            item.external ? (
              <a href={item.href} className="hover:underline">
                {item.label}
              </a>
            ) : (
              <Link href={item.href} className="hover:underline">
                {item.label}
              </Link>
            )
          ) : (
            <span className="text-[#495057]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}
