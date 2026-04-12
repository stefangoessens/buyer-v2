export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-4xl font-bold tracking-tight">buyer-v2</h1>
      <p className="text-lg text-gray-600">
        AI-native Florida buyer brokerage platform
      </p>
      <div className="mt-4 flex items-center gap-2 rounded-full bg-green-50 px-4 py-2 text-sm text-green-700">
        <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
        Platform running
      </div>
    </main>
  );
}
