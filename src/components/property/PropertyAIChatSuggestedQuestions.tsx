"use client";

import {
  WIZARD_STEP_SUGGESTED_QUESTIONS,
  type WizardStep,
} from "@/lib/propertyChatPrompts";
import { Button } from "@/components/ui/button";

interface PropertyAIChatSuggestedQuestionsProps {
  wizardStep: WizardStep;
  onPick: (question: string) => void;
  disabled?: boolean;
}

export function PropertyAIChatSuggestedQuestions({
  wizardStep,
  onPick,
  disabled,
}: PropertyAIChatSuggestedQuestionsProps) {
  const questions = WIZARD_STEP_SUGGESTED_QUESTIONS[wizardStep] ?? [];

  if (questions.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Try asking
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {questions.map((question) => (
          <Button
            key={question}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto justify-start whitespace-normal py-2 text-left text-xs sm:text-sm"
            disabled={disabled}
            onClick={() => onPick(question)}
          >
            {question}
          </Button>
        ))}
      </div>
    </div>
  );
}
