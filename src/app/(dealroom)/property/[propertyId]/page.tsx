export default async function DealRoomPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Deal Room</h1>
      <p className="text-gray-600">Property: {propertyId}</p>
      <p className="text-sm text-gray-400">
        Full deal room UI will be implemented in P3 milestone.
      </p>
    </div>
  );
}
