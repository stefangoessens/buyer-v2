"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const CONFIRM_PHRASE = "DELETE";

export function ProfileDangerZoneSection() {
  const [open, setOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setConfirmInput("");
      setSubmitted(false);
    }
  };

  const handleConfirm = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (confirmInput.trim() !== CONFIRM_PHRASE) return;
    setSubmitted(true);
  };

  const canConfirm = confirmInput.trim() === CONFIRM_PHRASE && !submitted;

  return (
    <Card
      id="danger-zone"
      className="border border-destructive/40 ring-destructive/10"
    >
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>
          Permanent actions. We pause to confirm before anything is deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 rounded-3xl bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              Delete account
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Removes your buyer profile, saved searches, and dashboard access.
            </p>
          </div>
          <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                Delete account
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>
                  This can&apos;t be undone. Type <strong>{CONFIRM_PHRASE}</strong>{" "}
                  below to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {submitted ? (
                <div className="rounded-3xl bg-muted/60 p-4 text-sm text-foreground">
                  Coming soon — please contact{" "}
                  <a
                    href="mailto:support@buyer.com"
                    className="font-medium text-primary underline underline-offset-4"
                  >
                    support@buyer.com
                  </a>{" "}
                  to delete your account.
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label htmlFor="danger-confirm">Confirmation</Label>
                  <Input
                    id="danger-confirm"
                    placeholder={CONFIRM_PHRASE}
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>
                  {submitted ? "Close" : "Cancel"}
                </AlertDialogCancel>
                {!submitted ? (
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleConfirm}
                    disabled={!canConfirm}
                  >
                    Confirm delete
                  </AlertDialogAction>
                ) : null}
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
