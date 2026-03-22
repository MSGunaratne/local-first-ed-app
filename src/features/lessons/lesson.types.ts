/**
 * Curriculum item structure - matches public/curriculum/*.json
 */
export interface CurriculumItem {
	id: string; // e.g., "ENG-GR6-1.1"
	subject: string;
	grade: number;
	competency_level: string;
	topic: string;
	learning_outcome: string;
	content_summary: string;
	keywords: string[];
	score?: number; // Added during matching
}

/**
 * Flashcard for interactive offline review
 */
export interface FlashcardItem {
	question: string;
	answer: string;
}
