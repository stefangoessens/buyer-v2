import { redirect } from "next/navigation";

export default async function ClosePageRedirect({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  redirect(`/property/${propertyId}/closing`);
}
