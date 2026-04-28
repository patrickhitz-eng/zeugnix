/**
 * Layout für öffentliche /app/-Routen (Token-basiert, kein Login).
 * Bewusst minimal, damit die jeweilige Page ihr eigenes Chrome rendert.
 */
export default function PublicAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
