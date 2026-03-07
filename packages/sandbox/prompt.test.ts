import { describe, expect, it, vi } from "vitest";
import { type PromptUI, promptDomainBlock, promptWriteBlock } from "./prompt.js";

function mockUI(selectResult: string | undefined): PromptUI {
	return {
		select: vi.fn(async () => selectResult),
		notify: vi.fn(),
	};
}

describe("prompt", () => {
	describe("promptWriteBlock", () => {
		it("returns abort when user dismisses (undefined)", async () => {
			const ui = mockUI(undefined);
			expect(await promptWriteBlock(ui, "/some/path")).toBe("abort");
		});

		it("returns abort when user selects abort option", async () => {
			const ui = mockUI("Abort (keep blocked)");
			expect(await promptWriteBlock(ui, "/some/path")).toBe("abort");
		});

		it("returns session when user selects session option", async () => {
			const ui = mockUI("Allow for this session only");
			expect(await promptWriteBlock(ui, "/some/path")).toBe("session");
		});

		it("returns project when user selects project option", async () => {
			const ui = mockUI("Allow for this project");
			expect(await promptWriteBlock(ui, "/some/path")).toBe("project");
		});

		it("returns global when user selects global option", async () => {
			const ui = mockUI("Allow for all projects");
			expect(await promptWriteBlock(ui, "/some/path")).toBe("global");
		});

		it("passes path in the prompt title", async () => {
			const ui = mockUI(undefined);
			await promptWriteBlock(ui, "/work/secret.txt");
			expect(ui.select).toHaveBeenCalledWith(expect.stringContaining("/work/secret.txt"), expect.any(Array));
		});
	});

	describe("promptDomainBlock", () => {
		it("returns abort when user dismisses", async () => {
			const ui = mockUI(undefined);
			expect(await promptDomainBlock(ui, "evil.com")).toBe("abort");
		});

		it("returns session for session choice", async () => {
			const ui = mockUI("Allow for this session only");
			expect(await promptDomainBlock(ui, "api.example.com")).toBe("session");
		});

		it("passes domain in the prompt title", async () => {
			const ui = mockUI(undefined);
			await promptDomainBlock(ui, "api.example.com");
			expect(ui.select).toHaveBeenCalledWith(expect.stringContaining("api.example.com"), expect.any(Array));
		});
	});
});
