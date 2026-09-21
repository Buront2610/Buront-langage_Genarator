export const reviewDimensions = ['S', 'Q', 'C'] as const;
export const reviewChoices = ['left', 'right', 'tie', 'both_bad', 'cannot_judge'] as const;
export type ReviewChoice = typeof reviewChoices[number];
export type ReviewRatings = Record<typeof reviewDimensions[number], ReviewChoice>;
export type ReviewItem = { id: string; source: string; left: string; right: string; private: Record<string, unknown> };
export type ReviewPack = { schemaVersion: 1; batchId: string; title: string; engineHash: string; datasetId: string; vectorReportHash: string; items: ReviewItem[]; manifest: Record<string, unknown> };
export type ReviewAnswer = { itemId: string; annotatorId: string; ratings: ReviewRatings; reason: string; revision: number; savedAt: string; origin: 'explicit_user' };
export type PublicReview = { batchId: string; title: string; items: Omit<ReviewItem, 'private'>[]; answers: ReviewAnswer[]; engineHash: string; humanApproval: 'pending' | 'rated_not_automatically_approved' };
