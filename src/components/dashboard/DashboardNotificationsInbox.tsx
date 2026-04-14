"use client";

import { Card, CardContent } from "@/components/ui/card";

export function DashboardNotificationsInbox() {
  const placeholder = [
    {
      id: 1,
      type: "welcome",
      title: "Welcome to buyer-v2",
      body: "Get started by pasting a property listing.",
      time: "Just now",
    },
    {
      id: 2,
      type: "profile",
      title: "Set up your buyer profile",
      body: "Add your search criteria to get a personalized market digest.",
      time: "5 min ago",
    },
  ];

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-foreground">Inbox</h2>
      <Card>
        <CardContent className="divide-y divide-border p-0">
          {placeholder.map((note) => (
            <div key={note.id} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-foreground">
                  {note.title}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {note.time}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{note.body}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
