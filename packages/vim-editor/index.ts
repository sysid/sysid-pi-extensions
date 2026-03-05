/**
 * Vim Editor - modal editing with normal/insert modes
 *
 * Usage: pi --extension ./examples/extensions/vim-editor.ts
 *
 * Modes:
 *   INSERT: All input is passed through (default)
 *   NORMAL: Vim motions and operators
 *
 * Normal mode keys:
 *   Motion: h/j/k/l, w/b/e, 0/$, ^, gg/G
 *   Insert: i/a/I/A/o/O
 *   Edit:   x/X, dd/cc/yy, D/C, p/P, J, r{char}, u
 *   Operators: d/c/y + motion
 *   Count: prefix any command with a number
 */

import { CustomEditor, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

type VimMode = "normal" | "insert";

// Cursor position
interface Pos {
	line: number;
	col: number;
}

// --- Word motion helpers (pure functions) ---

function isWordChar(ch: string): boolean {
	return /\w/.test(ch);
}

/** Find next word start position (vim 'w' motion) */
function nextWordStart(lines: string[], line: number, col: number, count: number): Pos {
	for (let n = 0; n < count; n++) {
		const text = lines[line] ?? "";

		if (col >= text.length) {
			// At end of line, move to start of next line
			if (line < lines.length - 1) {
				line++;
				col = 0;
				// Skip blank lines
				const nextLine = lines[line] ?? "";
				if (nextLine.length === 0 && line < lines.length - 1) {
					continue; // count this as one w step
				}
			}
			continue;
		}

		// Skip current word class
		const startIsWord = isWordChar(text[col]!);
		const startIsSpace = text[col] === " ";

		if (startIsSpace) {
			// Skip spaces
			while (col < text.length && text[col] === " ") col++;
		} else {
			// Skip current word class
			if (startIsWord) {
				while (col < text.length && isWordChar(text[col]!)) col++;
			} else {
				while (col < text.length && !isWordChar(text[col]!) && text[col] !== " ") col++;
			}
			// Skip spaces after word
			while (col < text.length && text[col] === " ") col++;
		}

		// If we hit end of line, wrap to next line and skip leading spaces
		if (col >= text.length && line < lines.length - 1) {
			line++;
			col = 0;
			const nextText = lines[line] ?? "";
			while (col < nextText.length && nextText[col] === " ") col++;
		}
	}
	return { line, col };
}

/** Find previous word start position (vim 'b' motion) */
function prevWordStart(lines: string[], line: number, col: number, count: number): Pos {
	for (let n = 0; n < count; n++) {
		if (col === 0) {
			if (line > 0) {
				line--;
				col = (lines[line] ?? "").length;
			}
			if (col === 0) continue;
		}

		const text = lines[line] ?? "";

		// Skip spaces before cursor
		while (col > 0 && text[col - 1] === " ") col--;

		if (col === 0) continue;

		// Now skip the word class
		const prevIsWord = isWordChar(text[col - 1]!);
		if (prevIsWord) {
			while (col > 0 && isWordChar(text[col - 1]!)) col--;
		} else {
			while (col > 0 && !isWordChar(text[col - 1]!) && text[col - 1] !== " ") col--;
		}
	}
	return { line, col };
}

/** Find word end position (vim 'e' motion) */
function wordEnd(lines: string[], line: number, col: number, count: number): Pos {
	for (let n = 0; n < count; n++) {
		const text = lines[line] ?? "";

		// Move at least one char forward
		col++;

		// If past end of line, wrap
		if (col >= text.length) {
			if (line < lines.length - 1) {
				line++;
				col = 0;
				const nextText = lines[line] ?? "";
				// Skip spaces at start of next line
				while (col < nextText.length && nextText[col] === " ") col++;
			} else {
				col = text.length > 0 ? text.length - 1 : 0;
				continue;
			}
		}

		const curText = lines[line] ?? "";
		// Skip spaces
		while (col < curText.length && curText[col] === " ") col++;

		if (col >= curText.length) {
			col = curText.length > 0 ? curText.length - 1 : 0;
			continue;
		}

		// Skip to end of word class
		const startIsWord = isWordChar(curText[col]!);
		if (startIsWord) {
			while (col + 1 < curText.length && isWordChar(curText[col + 1]!)) col++;
		} else {
			while (col + 1 < curText.length && !isWordChar(curText[col + 1]!) && curText[col + 1] !== " ") col++;
		}
	}
	return { line, col };
}

/** Find first non-blank character in a line */
function firstNonBlank(text: string): number {
	for (let i = 0; i < text.length; i++) {
		if (text[i] !== " " && text[i] !== "\t") return i;
	}
	return 0;
}

export class VimEditor extends CustomEditor {
	private mode: VimMode = "insert";
	private count = 0;
	private pendingOperator: "d" | "c" | "y" | null = null;
	private pendingG = false;
	private pendingR = false;
	private register = ""; // yank buffer
	private registerLinewise = false; // whether the register contains whole lines

	getMode(): VimMode {
		return this.mode;
	}

	handleInput(data: string): void {
		if (this.mode === "insert") {
			this.handleInsertMode(data);
		} else {
			this.handleNormalMode(data);
		}
	}

	private handleInsertMode(data: string): void {
		if (matchesKey(data, "escape")) {
			this.mode = "normal";
			// Vim moves cursor one char back when leaving insert mode
			if (this.getCursor().col > 0) {
				super.handleInput("\x1b[D"); // left
			}
			return;
		}
		super.handleInput(data);
	}

	private handleNormalMode(data: string): void {
		// Pending replace char mode
		if (this.pendingR) {
			this.pendingR = false;
			if (data.length === 1 && data.charCodeAt(0) >= 32) {
				this.replaceChar(data);
			}
			return;
		}

		// Pending g (for gg)
		if (this.pendingG) {
			this.pendingG = false;
			if (data === "g") {
				this.gotoLine(0);
				this.resetPending();
			}
			return;
		}

		// Control sequences always pass through
		if (data.length > 1 || data.charCodeAt(0) < 32) {
			this.resetPending();
			super.handleInput(data);
			return;
		}

		const ch = data;

		// Count prefix: 1-9 starts, then 0-9 extends
		if (this.count > 0 && ch >= "0" && ch <= "9") {
			this.count = this.count * 10 + parseInt(ch, 10);
			return;
		}
		if (ch >= "1" && ch <= "9" && this.pendingOperator === null) {
			this.count = parseInt(ch, 10);
			return;
		}

		const effectiveCount = Math.max(this.count, 1);

		// Check if we're in operator-pending mode
		if (this.pendingOperator !== null) {
			// Doubled operator (dd, cc, yy)
			if (ch === this.pendingOperator) {
				this.executeLinewise(this.pendingOperator, effectiveCount);
				this.resetPending();
				return;
			}

			// Operator + motion
			const target = this.resolveMotion(ch, effectiveCount);
			if (target) {
				this.executeOperatorMotion(this.pendingOperator, target);
				this.resetPending();
				return;
			}

			// Invalid combo, cancel
			this.resetPending();
			return;
		}

		// Normal mode dispatch
		switch (ch) {
			// Motions
			case "h":
				for (let i = 0; i < effectiveCount; i++) super.handleInput("\x1b[D");
				break;
			case "j":
				for (let i = 0; i < effectiveCount; i++) super.handleInput("\x1b[B");
				break;
			case "k":
				for (let i = 0; i < effectiveCount; i++) super.handleInput("\x1b[A");
				break;
			case "l":
				for (let i = 0; i < effectiveCount; i++) super.handleInput("\x1b[C");
				break;
			case "0":
				super.handleInput("\x01"); // ctrl+a (line start)
				break;
			case "$":
				super.handleInput("\x05"); // ctrl+e (line end)
				break;
			case "^":
				this.gotoFirstNonBlank();
				break;
			case "w":
				this.moveTo(nextWordStart(this.getLines(), this.getCursor().line, this.getCursor().col, effectiveCount));
				break;
			case "b":
				this.moveTo(prevWordStart(this.getLines(), this.getCursor().line, this.getCursor().col, effectiveCount));
				break;
			case "e":
				this.moveTo(wordEnd(this.getLines(), this.getCursor().line, this.getCursor().col, effectiveCount));
				break;
			case "G":
				this.gotoLine(this.getLines().length - 1);
				break;
			case "g":
				this.pendingG = true;
				this.count = effectiveCount; // preserve count
				return; // don't reset

			// Insert mode entries
			case "i":
				this.mode = "insert";
				break;
			case "a":
				super.handleInput("\x1b[C"); // move right
				this.mode = "insert";
				break;
			case "I":
				super.handleInput("\x01"); // line start
				this.mode = "insert";
				break;
			case "A":
				super.handleInput("\x05"); // line end
				this.mode = "insert";
				break;
			case "o":
				this.openLineBelow();
				break;
			case "O":
				this.openLineAbove();
				break;

			// Editing
			case "x":
				for (let i = 0; i < effectiveCount; i++) super.handleInput("\x1b[3~"); // delete
				break;
			case "X":
				for (let i = 0; i < effectiveCount; i++) super.handleInput("\x7f"); // backspace
				break;
			case "D":
				this.deleteToEnd();
				break;
			case "C":
				this.deleteToEnd();
				this.mode = "insert";
				break;
			case "J":
				this.joinLines();
				break;
			case "r":
				this.pendingR = true;
				this.count = 0;
				return; // don't reset
			case "u":
				super.handleInput("\x1f"); // ctrl+- (undo)
				break;
			case "p":
				this.paste(false);
				break;
			case "P":
				this.paste(true);
				break;

			// Operators
			case "d":
			case "c":
			case "y":
				this.pendingOperator = ch;
				this.count = effectiveCount; // preserve count for operator
				return; // don't reset

			default:
				// Unmapped key in normal mode — ignore
				break;
		}

		this.resetPending();
	}

	private resetPending(): void {
		this.count = 0;
		this.pendingOperator = null;
		this.pendingG = false;
	}

	/** Resolve a motion key to a target position, or null if not a motion */
	private resolveMotion(ch: string, count: number): Pos | null {
		const lines = this.getLines();
		const cur = this.getCursor();

		switch (ch) {
			case "h":
				return { line: cur.line, col: Math.max(0, cur.col - count) };
			case "l":
				return { line: cur.line, col: cur.col + count };
			case "j":
				return { line: Math.min(lines.length - 1, cur.line + count), col: cur.col };
			case "k":
				return { line: Math.max(0, cur.line - count), col: cur.col };
			case "w":
				return nextWordStart(lines, cur.line, cur.col, count);
			case "b":
				return prevWordStart(lines, cur.line, cur.col, count);
			case "e": {
				const pos = wordEnd(lines, cur.line, cur.col, count);
				return { line: pos.line, col: pos.col + 1 }; // e is inclusive in vim
			}
			case "0":
				return { line: cur.line, col: 0 };
			case "$":
				return { line: cur.line, col: (lines[cur.line] ?? "").length };
			case "^":
				return { line: cur.line, col: firstNonBlank(lines[cur.line] ?? "") };
			default:
				return null;
		}
	}

	/** Execute operator over a motion range (characterwise) */
	private executeOperatorMotion(op: "d" | "c" | "y", target: Pos): void {
		const lines = this.getLines();
		const cur = this.getCursor();

		// Determine range (from, to) — always from < to
		let from: Pos, to: Pos;
		if (target.line < cur.line || (target.line === cur.line && target.col < cur.col)) {
			from = target;
			to = cur;
		} else {
			from = cur;
			to = target;
		}

		// Handle multiline range for j/k motions (linewise)
		if (from.line !== to.line) {
			const startLine = from.line;
			const endLine = to.line;
			const yanked = lines.slice(startLine, endLine + 1).join("\n");
			this.register = yanked;
			this.registerLinewise = true;

			if (op === "y") {
				return; // yank only, don't modify
			}

			const newLines = [...lines];
			newLines.splice(startLine, endLine - startLine + 1);
			if (newLines.length === 0) newLines.push("");
			this.performSurgery(newLines, Math.min(startLine, newLines.length - 1), 0);

			if (op === "c") {
				this.mode = "insert";
			}
			return;
		}

		// Same line — characterwise
		const lineText = lines[from.line] ?? "";
		const deletedText = lineText.slice(from.col, to.col);
		this.register = deletedText;
		this.registerLinewise = false;

		if (op === "y") {
			return; // yank only
		}

		const newLine = lineText.slice(0, from.col) + lineText.slice(to.col);
		const newLines = [...lines];
		newLines[from.line] = newLine;
		this.performSurgery(newLines, from.line, from.col);

		if (op === "c") {
			this.mode = "insert";
		}
	}

	/** Execute linewise operation (dd, cc, yy) */
	private executeLinewise(op: "d" | "c" | "y", count: number): void {
		const lines = this.getLines();
		const cur = this.getCursor();
		const startLine = cur.line;
		const endLine = Math.min(startLine + count - 1, lines.length - 1);

		const yanked = lines.slice(startLine, endLine + 1).join("\n");
		this.register = yanked;
		this.registerLinewise = true;

		if (op === "y") {
			return;
		}

		const newLines = [...lines];
		if (op === "c") {
			// Replace lines with empty line
			newLines.splice(startLine, endLine - startLine + 1, "");
			this.performSurgery(newLines, startLine, 0);
			this.mode = "insert";
		} else {
			// Delete lines
			newLines.splice(startLine, endLine - startLine + 1);
			if (newLines.length === 0) newLines.push("");
			const targetLine = Math.min(startLine, newLines.length - 1);
			this.performSurgery(newLines, targetLine, 0);
		}
	}

	/** Delete from cursor to end of line */
	private deleteToEnd(): void {
		const lines = this.getLines();
		const cur = this.getCursor();
		const lineText = lines[cur.line] ?? "";
		const deleted = lineText.slice(cur.col);
		this.register = deleted;
		this.registerLinewise = false;

		const newLines = [...lines];
		newLines[cur.line] = lineText.slice(0, cur.col);
		this.performSurgery(newLines, cur.line, cur.col);
	}

	/** Paste register contents */
	private paste(before: boolean): void {
		if (!this.register) return;

		const lines = this.getLines();
		const cur = this.getCursor();

		if (this.registerLinewise) {
			const newLines = [...lines];
			const pasteLines = this.register.split("\n");
			const insertAt = before ? cur.line : cur.line + 1;
			newLines.splice(insertAt, 0, ...pasteLines);
			this.performSurgery(newLines, insertAt, 0);
		} else {
			// Characterwise paste: p inserts after cursor, P inserts before
			const lineText = lines[cur.line] ?? "";
			const insertCol = before ? cur.col : Math.min(cur.col + 1, lineText.length);
			const newLine = lineText.slice(0, insertCol) + this.register + lineText.slice(insertCol);
			const newLines = [...lines];
			newLines[cur.line] = newLine;
			this.performSurgery(newLines, cur.line, insertCol + this.register.length);
		}
	}

	/** Open new line below current and enter insert mode */
	private openLineBelow(): void {
		const lines = this.getLines();
		const cur = this.getCursor();
		const newLines = [...lines];
		newLines.splice(cur.line + 1, 0, "");
		this.performSurgery(newLines, cur.line + 1, 0);
		this.mode = "insert";
	}

	/** Open new line above current and enter insert mode */
	private openLineAbove(): void {
		const lines = this.getLines();
		const cur = this.getCursor();
		const newLines = [...lines];
		newLines.splice(cur.line, 0, "");
		this.performSurgery(newLines, cur.line, 0);
		this.mode = "insert";
	}

	/** Join current line with next */
	private joinLines(): void {
		const lines = this.getLines();
		const cur = this.getCursor();
		if (cur.line >= lines.length - 1) return;

		const currentLine = lines[cur.line] ?? "";
		const nextLine = (lines[cur.line + 1] ?? "").trimStart();
		const joinCol = currentLine.length;

		const newLines = [...lines];
		newLines[cur.line] = `${currentLine} ${nextLine}`;
		newLines.splice(cur.line + 1, 1);
		this.performSurgery(newLines, cur.line, joinCol);
	}

	/** Replace character under cursor */
	private replaceChar(ch: string): void {
		const lines = this.getLines();
		const cur = this.getCursor();
		const lineText = lines[cur.line] ?? "";
		if (cur.col >= lineText.length) return;

		const newLines = [...lines];
		newLines[cur.line] = lineText.slice(0, cur.col) + ch + lineText.slice(cur.col + 1);
		this.performSurgery(newLines, cur.line, cur.col);
	}

	/** Go to first non-blank character of current line */
	private gotoFirstNonBlank(): void {
		const lines = this.getLines();
		const cur = this.getCursor();
		const col = firstNonBlank(lines[cur.line] ?? "");
		this.moveTo({ line: cur.line, col });
	}

	/** Go to specific line number */
	private gotoLine(targetLine: number): void {
		this.moveTo({ line: targetLine, col: 0 });
	}

	/** Move cursor to a target position using text surgery */
	private moveTo(target: Pos): void {
		const lines = this.getLines();
		// No text modification, just reposition cursor
		this.performSurgery(lines, target.line, target.col);
	}

	/**
	 * Apply text changes and reposition cursor.
	 * Uses setText() then escape sequences to move cursor to the target.
	 */
	private performSurgery(newLines: string[], targetLine: number, targetCol: number): void {
		const newText = newLines.join("\n");
		this.setText(newText);
		// After setText(), cursor is at end of last line.
		// Reposition to target using escape sequences.
		const lastLine = newLines.length - 1;

		// Go to col 0 of current (last) line
		super.handleInput("\x01"); // ctrl+a

		// Move up to line 0
		for (let i = 0; i < lastLine; i++) {
			super.handleInput("\x1b[A"); // up
		}

		// Move down to target line
		for (let i = 0; i < targetLine; i++) {
			super.handleInput("\x1b[B"); // down
		}

		// Ensure col 0
		super.handleInput("\x01"); // ctrl+a

		// Move right to target col
		for (let i = 0; i < targetCol; i++) {
			super.handleInput("\x1b[C"); // right
		}
	}

	render(width: number): string[] {
		const lines = super.render(width);
		if (lines.length === 0) return lines;

		// Build mode indicator
		let label: string;
		if (this.pendingOperator) {
			const countStr = this.count > 1 ? String(this.count) : "";
			label = ` ${countStr}${this.pendingOperator}_ `;
		} else if (this.count > 0) {
			label = ` ${this.count}_ `;
		} else {
			label = this.mode === "normal" ? " NORMAL " : " INSERT ";
		}

		// Replace end of last line with mode indicator
		const last = lines.length - 1;
		if (visibleWidth(lines[last]!) >= label.length) {
			lines[last] = truncateToWidth(lines[last]!, width - label.length, "") + label;
		}
		return lines;
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.setEditorComponent((tui, theme, kb) => new VimEditor(tui, theme, kb));
	});
}
