/**
 * La tarjeta de 1200×630 que se comparte en WhatsApp, Facebook y X.
 *
 * La dibuja Satori (`ImageResponse`), no el navegador: sólo entiende un
 * subconjunto de CSS, todo va en estilos inline y **todo div con más de un hijo
 * necesita `display: flex`**. Tampoco hay clases de Tailwind ni fuentes
 * remotas: los colores de siviajo van literales y la tipografía es la única que
 * trae `next/og`, que viene en un solo grosor — el título pesa por tamaño, no
 * por negrita.
 */
export function OgCard({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#FFFFFF',
        color: '#1A237E',
      }}
    >
      <div style={{ display: 'flex', padding: '56px 80px 0 80px', fontSize: 34, color: '#1A237E' }}>Sí, Viajo</div>

      <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', padding: '0 80px' }}>
        <div style={{ display: 'flex', fontSize: 82, color: '#1A237E', lineHeight: 1.12 }}>{title}</div>
        <div style={{ display: 'flex', marginTop: 30, fontSize: 38, color: '#495057' }}>{subtitle}</div>
      </div>

      <div style={{ display: 'flex', padding: '0 80px 44px 80px', fontSize: 28, color: '#6C757D' }}>vuelos.siviajo.com</div>
      <div style={{ display: 'flex', height: 28, backgroundColor: '#1DE9B6' }} />
    </div>
  )
}
