import type { EncodingOption, existsSync as ExistsSync, PathLike, readFileSync as ReadFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

type FsActual = {
	existsSync: typeof ExistsSync;
	readFileSync: typeof ReadFileSync;
};

const actualFs = await vi.importActual<FsActual>("node:fs");

vi.mock("node:fs", async () => {
	const actual = await vi.importActual<FsActual>("node:fs");
	return {
		...actual,
		existsSync: vi.fn((path: PathLike) => actual.existsSync(path)),
		readFileSync: vi.fn((path: PathLike, options?: EncodingOption) => actual.readFileSync(path, options)),
	};
});

// Mock the sandbox runtime
const { mockSandboxManager } = vi.hoisted(() => ({
	mockSandboxManager: {
		initialize: vi.fn(),
		reset: vi.fn(),
		updateConfig: vi.fn(),
		wrapWithSandbox: vi.fn(async (command: string) => command),
	},
}));

vi.mock("@sysid/sandbox-runtime-improved", () => ({ SandboxManager: mockSandboxManager }));

import { existsSync, readFileSync } from "node:fs";
import type {
	ExtensionAPI,
	ExtensionContext,
	SessionStartEvent,
	ToolCallEvent,
	ToolCallEventResult,
} from "@mariozechner/pi-coding-agent";
import { SandboxManager } from "@sysid/sandbox-runtime-improved";
import sandboxExtension from "./index.js";

interface SandboxConfigFile {
	enabled?: boolean;
	enableWeakerNetworkIsolation?: boolean;
	filesystem?: {
		denyRead?: string[];
		allowWrite?: string[];
		denyWrite?: string[];
	};
}

type ToolCallHandler = (event: ToolCallEvent, ctx: ExtensionContext) => Promise<ToolCallEventResult | undefined>;
type SessionStartHandler = (event: SessionStartEvent, ctx: ExtensionContext) => Promise<void>;

interface CapturedHandlers {
	toolCall: ToolCallHandler;
	sessionStart: SessionStartHandler;
}

interface SandboxManagerMock {
	initialize: ReturnType<typeof vi.fn>;
	reset: ReturnType<typeof vi.fn>;
	updateConfig: ReturnType<typeof vi.fn>;
	wrapWithSandbox: ReturnType<typeof vi.fn>;
}

const sandboxManager = SandboxManager as unknown as SandboxManagerMock;
const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);

function mockConfig(cwd: string, config: SandboxConfigFile) {
	const projectPath = join(cwd, ".pi", "sandbox.json");
	const globalPath = join(homedir(), ".pi", "agent", "sandbox.json");

	mockedExistsSync.mockImplementation((path) => {
		if (path === projectPath || path === globalPath) return true;
		return actualFs.existsSync(path as PathLike);
	});

	mockedReadFileSync.mockImplementation(((path, options) => {
		if (path === projectPath || path === globalPath) {
			return JSON.stringify(config);
		}
		return actualFs.readFileSync(path as PathLike, options as EncodingOption);
	}) as typeof readFileSync);
}

function captureHandlers(noSandbox: boolean): CapturedHandlers {
	let toolCallHandler: ToolCallHandler | undefined;
	let sessionStartHandler: SessionStartHandler | undefined;

	const mockApi = {
		on: vi.fn((event: string, handler: ToolCallHandler | SessionStartHandler) => {
			if (event === "tool_call") toolCallHandler = handler as ToolCallHandler;
			if (event === "session_start") sessionStartHandler = handler as SessionStartHandler;
		}),
		registerFlag: vi.fn(),
		registerTool: vi.fn(),
		registerCommand: vi.fn(),
		getFlag: vi.fn(() => noSandbox),
	} as unknown as ExtensionAPI;

	sandboxExtension(mockApi);

	if (!toolCallHandler || !sessionStartHandler) {
		throw new Error("Extension did not register expected handlers");
	}

	return { toolCall: toolCallHandler, sessionStart: sessionStartHandler };
}

function makeEvent(toolName: string, input: Record<string, unknown>): ToolCallEvent {
	return { toolName, input } as ToolCallEvent;
}

describe("sandbox extension tool guard", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	it("passes weaker network isolation flag to sandbox runtime", async () => {
		const cwd = "/work";
		mockConfig(cwd, {
			enabled: true,
			enableWeakerNetworkIsolation: true,
			filesystem: {
				denyRead: ["/restricted"],
				allowWrite: ["."],
				denyWrite: [],
			},
		});

		const { sessionStart } = captureHandlers(false);
		const ctx = {
			hasUI: true,
			cwd,
			ui: { notify: vi.fn(), setStatus: vi.fn(), theme: { fg: vi.fn((_: string, text: string) => text) } },
			theme: { fg: vi.fn((_: string, text: string) => text) },
		} as unknown as ExtensionContext;

		await sessionStart({ type: "session_start" }, ctx);

		expect(sandboxManager.initialize).toHaveBeenCalledWith(
			expect.objectContaining({ enableWeakerNetworkIsolation: true }),
			expect.any(Function),
		);
	});

	it("keeps tool guard active when OS sandbox init fails", async () => {
		const cwd = "/work";
		mockConfig(cwd, {
			enabled: true,
			filesystem: {
				denyRead: ["/restricted"],
				allowWrite: ["."],
				denyWrite: [],
			},
		});

		sandboxManager.initialize.mockRejectedValueOnce(new Error("boom"));

		const { sessionStart, toolCall } = captureHandlers(false);
		const ctx = {
			hasUI: true,
			cwd,
			ui: { notify: vi.fn(), setStatus: vi.fn() },
			theme: { fg: vi.fn((_: string, text: string) => text) },
		} as unknown as ExtensionContext;

		await sessionStart({ type: "session_start" }, ctx);

		const result = await toolCall(makeEvent("read", { path: "/restricted/file.txt" }), ctx);
		expect(result).toEqual({ block: true, reason: expect.stringContaining("/restricted") });
	});

	it("disables tool guard when --no-sandbox is set", async () => {
		const cwd = "/work";
		mockConfig(cwd, {
			enabled: true,
			filesystem: {
				denyRead: ["/restricted"],
				allowWrite: ["."],
				denyWrite: [],
			},
		});

		const { sessionStart, toolCall } = captureHandlers(true);
		const ctx = {
			hasUI: true,
			cwd,
			ui: { notify: vi.fn(), setStatus: vi.fn() },
			theme: { fg: vi.fn((_: string, text: string) => text) },
		} as unknown as ExtensionContext;

		await sessionStart({ type: "session_start" }, ctx);

		const result = await toolCall(makeEvent("read", { path: "/restricted/file.txt" }), ctx);
		expect(result).toBeUndefined();
	});

	it("prompts for write to non-allowed path and allows on session choice", async () => {
		const cwd = "/work";
		mockConfig(cwd, {
			enabled: true,
			filesystem: {
				denyRead: [],
				allowWrite: ["."],
				denyWrite: [],
			},
		});

		const { sessionStart, toolCall } = captureHandlers(false);
		const ctx = {
			hasUI: true,
			cwd,
			ui: {
				notify: vi.fn(),
				setStatus: vi.fn(),
				select: vi.fn(async () => "Allow for this session only"),
				theme: { fg: vi.fn((_: string, text: string) => text) },
			},
			theme: { fg: vi.fn((_: string, text: string) => text) },
		} as unknown as ExtensionContext;

		await sessionStart({ type: "session_start" }, ctx);

		// /outside is not under allowWrite "." = "/work"
		const result = await toolCall(makeEvent("write", { path: "/outside/file.txt" }), ctx);
		expect(result).toBeUndefined(); // allowed after prompt
		expect(ctx.ui.select).toHaveBeenCalled();
	});

	it("hard-blocks write when no UI available", async () => {
		const cwd = "/work";
		mockConfig(cwd, {
			enabled: true,
			filesystem: {
				denyRead: [],
				allowWrite: ["."],
				denyWrite: [],
			},
		});

		const { sessionStart, toolCall } = captureHandlers(false);
		const ctx = {
			hasUI: false,
			cwd,
			ui: { notify: vi.fn(), setStatus: vi.fn(), theme: { fg: vi.fn((_: string, text: string) => text) } },
			theme: { fg: vi.fn((_: string, text: string) => text) },
		} as unknown as ExtensionContext;

		await sessionStart({ type: "session_start" }, ctx);

		const result = await toolCall(makeEvent("write", { path: "/outside/file.txt" }), ctx);
		expect(result).toEqual({ block: true, reason: expect.stringContaining("not under any allowed") });
	});

	it("never prompts for denyWrite matches", async () => {
		const cwd = "/work";
		mockConfig(cwd, {
			enabled: true,
			filesystem: {
				denyRead: [],
				allowWrite: ["."],
				denyWrite: [".env"],
			},
		});

		const { sessionStart, toolCall } = captureHandlers(false);
		const selectFn = vi.fn();
		const ctx = {
			hasUI: true,
			cwd,
			ui: {
				notify: vi.fn(),
				setStatus: vi.fn(),
				select: selectFn,
				theme: { fg: vi.fn((_: string, text: string) => text) },
			},
			theme: { fg: vi.fn((_: string, text: string) => text) },
		} as unknown as ExtensionContext;

		await sessionStart({ type: "session_start" }, ctx);

		const result = await toolCall(makeEvent("write", { path: "/work/.env" }), ctx);
		expect(result).toEqual({ block: true, reason: expect.stringContaining(".env") });
		expect(selectFn).not.toHaveBeenCalled();
	});

	it("session-allowed write path bypasses prompt on second access", async () => {
		const cwd = "/work";
		mockConfig(cwd, {
			enabled: true,
			filesystem: {
				denyRead: [],
				allowWrite: ["."],
				denyWrite: [],
			},
		});

		const { sessionStart, toolCall } = captureHandlers(false);
		const selectFn = vi.fn(async () => "Allow for this session only");
		const ctx = {
			hasUI: true,
			cwd,
			ui: {
				notify: vi.fn(),
				setStatus: vi.fn(),
				select: selectFn,
				theme: { fg: vi.fn((_: string, text: string) => text) },
			},
			theme: { fg: vi.fn((_: string, text: string) => text) },
		} as unknown as ExtensionContext;

		await sessionStart({ type: "session_start" }, ctx);

		// First access — prompts
		await toolCall(makeEvent("write", { path: "/outside/file.txt" }), ctx);
		expect(selectFn).toHaveBeenCalledTimes(1);

		// Second access — should bypass prompt
		selectFn.mockClear();
		const result = await toolCall(makeEvent("write", { path: "/outside/file.txt" }), ctx);
		expect(result).toBeUndefined();
		expect(selectFn).not.toHaveBeenCalled();
	});

	it("passes SandboxAskCallback to initialize when UI available", async () => {
		const cwd = "/work";
		mockConfig(cwd, {
			enabled: true,
			filesystem: {
				denyRead: [],
				allowWrite: ["."],
				denyWrite: [],
			},
		});

		const { sessionStart } = captureHandlers(false);
		const ctx = {
			hasUI: true,
			cwd,
			ui: {
				notify: vi.fn(),
				setStatus: vi.fn(),
				select: vi.fn(),
				theme: { fg: vi.fn((_: string, text: string) => text) },
			},
			theme: { fg: vi.fn((_: string, text: string) => text) },
		} as unknown as ExtensionContext;

		await sessionStart({ type: "session_start" }, ctx);

		expect(sandboxManager.initialize).toHaveBeenCalledWith(expect.any(Object), expect.any(Function));
	});

	it("does not pass SandboxAskCallback when no UI", async () => {
		const cwd = "/work";
		mockConfig(cwd, {
			enabled: true,
			filesystem: {
				denyRead: [],
				allowWrite: ["."],
				denyWrite: [],
			},
		});

		const { sessionStart } = captureHandlers(false);
		const ctx = {
			hasUI: false,
			cwd,
			ui: { notify: vi.fn(), setStatus: vi.fn(), theme: { fg: vi.fn((_: string, text: string) => text) } },
			theme: { fg: vi.fn((_: string, text: string) => text) },
		} as unknown as ExtensionContext;

		await sessionStart({ type: "session_start" }, ctx);

		expect(sandboxManager.initialize).toHaveBeenCalledWith(expect.any(Object), undefined);
	});
});
