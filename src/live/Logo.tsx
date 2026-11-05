/** SEEK mark from the brand sheet: two mint slabs joined by a darker diagonal band, plus the wordmark. */
export function LogoMark({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 130 130" aria-hidden="true">
    <path d="M20 0H130L102 30H48L20 58Z" fill="#a8d9c4" />
    <path d="M20 58L48 30L110 72L82 100Z" fill="#48766c" />
    <path d="M110 130H0L28 100H82L110 72Z" fill="#a8d9c4" />
  </svg>;
}

export default function Logo({ href = '/', size = 22 }: { href?: string; size?: number }) {
  return <a className="seek-logo" href={href} aria-label="SEEK"><LogoMark size={size} /><span>SEEK</span></a>;
}
