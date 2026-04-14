import Image from "next/image";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserGroupIcon } from "@hugeicons/core-free-icons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AboutTeamContent, AboutTeamMember } from "@/content/about";

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function MemberAvatar({ member }: { member: AboutTeamMember }) {
  if (member.photoSrc) {
    return (
      <div className="relative size-20 overflow-hidden rounded-full ring-2 ring-primary/10">
        <Image
          src={member.photoSrc}
          alt={`${member.name} portrait`}
          fill
          className="object-cover object-center"
          sizes="80px"
        />
      </div>
    );
  }

  return (
    <div
      className="flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-primary-100 to-primary-50 text-lg font-semibold text-primary-700 ring-2 ring-primary/10"
      aria-label={`${member.name} silhouette placeholder`}
    >
      {getInitials(member.name)}
    </div>
  );
}

export function AboutTeamSection({ team }: { team: AboutTeamContent }) {
  const hasMembers = team.members.length > 0;

  return (
    <section className="w-full bg-neutral-50 py-20 lg:py-28">
      <div className="mx-auto max-w-[1248px] px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-400">
            {team.eyebrow}
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.003em] text-neutral-800 lg:text-[41px] lg:leading-[1.2]">
            {team.title}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-neutral-500">
            {team.description}
          </p>
        </div>

        {hasMembers ? (
          <div className="mt-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {team.members.map((member) => (
              <Card
                key={member.id}
                className="h-full border border-neutral-200 bg-white shadow-sm"
              >
                <CardHeader className="items-center gap-4 text-center">
                  <MemberAvatar member={member} />
                  <CardTitle className="mt-2 text-base font-semibold tracking-tight text-neutral-800">
                    {member.name}
                  </CardTitle>
                  <p className="text-xs font-medium uppercase tracking-wider text-primary-500">
                    {member.role}
                  </p>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-center text-sm leading-relaxed text-neutral-500">
                    {member.bio}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="mt-14 flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-neutral-200 bg-white px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <HugeiconsIcon
                icon={UserGroupIcon}
                strokeWidth={1.75}
                className="size-6"
              />
            </div>
            <p className="text-base font-semibold text-neutral-800">
              {team.emptyState}
            </p>
            <p className="max-w-md text-sm leading-relaxed text-neutral-500">
              We are putting together full team profiles. Check back soon to meet
              the Florida operators behind the platform.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
