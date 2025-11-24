import { Suspense } from "react"
import FileSharing from "@/components/file-sharing"
import Loading from "@/components/loading"
import { memo } from "@/lib/performance"

// Memoize the Home component to prevent unnecessary re-renders
const Home = memo(function Home() {
  return (
    <main className="container max-w-7xl py-6">
      <div className="text-center mb-10 space-y-2">
        <h1 className="text-4xl font-bold gradient-text">
          File Share
        </h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          Seamless P2P file sharing with no size limits, privacy-focused and lightning fast
        </p>
      </div>

      <Suspense fallback={<Loading />}>
        <FileSharing />
      </Suspense>
    </main>
  )
})

export default Home;