export interface PromptUI {
	select(title: string, options: string[]): Promise<string | undefined>;
	notify(message: string, type?: "info" | "warning" | "error"): void;
}

export type PromptChoice = "abort" | "session" | "project" | "global";

const OPTION_ABORT = "Abort (keep blocked)";
const OPTION_SESSION = "Allow for this session only";
const OPTION_PROJECT = "Allow for this project";
const OPTION_GLOBAL = "Allow for all projects";

const OPTIONS = [OPTION_ABORT, OPTION_SESSION, OPTION_PROJECT, OPTION_GLOBAL];

export async function promptWriteBlock(ui: PromptUI, path: string): Promise<PromptChoice> {
	const choice = await ui.select(`Write blocked: "${path}" is not in allowWrite`, OPTIONS);
	return mapChoice(choice);
}

export async function promptDomainBlock(ui: PromptUI, domain: string): Promise<PromptChoice> {
	const choice = await ui.select(`Network blocked: "${domain}" is not in allowedDomains`, OPTIONS);
	return mapChoice(choice);
}

function mapChoice(choice: string | undefined): PromptChoice {
	switch (choice) {
		case OPTION_SESSION:
			return "session";
		case OPTION_PROJECT:
			return "project";
		case OPTION_GLOBAL:
			return "global";
		default:
			return "abort";
	}
}
