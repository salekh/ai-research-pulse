import { notFound } from "next/navigation"

export default function NotFound() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4 text-center">
      <h2 className="text-2xl font-bold">404 Not Found</h2>
      <p className="text-muted-foreground">Could not find requested resource</p>
    </div>
  )
}
