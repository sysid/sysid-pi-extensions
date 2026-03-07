.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory

SHELL	= bash
.ONESHELL:

################################################################################
# Testing \
TESTING:  ## ############################################################

.PHONY: test
test:  ## run all tests
	npx vitest run

.PHONY: test-watch
test-watch:  ## run tests in watch mode
	npx vitest watch

.PHONY: test-verbose
test-verbose:  ## run tests with verbose output
	npx vitest run --reporter=verbose

################################################################################
# Code Quality \
QUALITY:  ## ############################################################

.PHONY: lint
lint:  ## lint with biome
	npx biome check .

.PHONY: lint-fix
lint-fix:  ## autofix linter findings
	npx biome check --write .

.PHONY: check
check: lint test  ## run all checks (lint + test)

################################################################################
# Setup \
SETUP:  ## ############################################################

.PHONY: install
install:  ## install all dependencies
	npm install

.PHONY: use-sysid-sandbox
use-sysid-sandbox:  ## switch sandbox-runtime to sysid fork (local dev)
	cd packages/sandbox && npm pkg set "dependencies.@anthropic-ai/sandbox-runtime"="github:sysid/sandbox-runtime#sysid"
	npm install
	git update-index --skip-worktree packages/sandbox/package.json
	@echo "Switched to sysid fork. package.json hidden from git."

.PHONY: use-official-sandbox
use-official-sandbox:  ## switch sandbox-runtime to official npm package
	git update-index --no-skip-worktree packages/sandbox/package.json
	git checkout -- packages/sandbox/package.json
	npm install
	@echo "Switched to official npm package."

################################################################################
# Versioning \
VERSIONING:  ## ############################################################

.PHONY: bump-sandbox-patch
bump-sandbox-patch: check-github-token  ## bump sandbox patch version, tag, release
	cd packages/sandbox && bump-my-version bump --commit --tag patch
	git push && git push --tags
	@$(MAKE) create-release-sandbox

.PHONY: bump-sandbox-minor
bump-sandbox-minor: check-github-token  ## bump sandbox minor version, tag, release
	cd packages/sandbox && bump-my-version bump --commit --tag minor
	git push && git push --tags
	@$(MAKE) create-release-sandbox

.PHONY: bump-sandbox-major
bump-sandbox-major: check-github-token  ## bump sandbox major version, tag, release
	cd packages/sandbox && bump-my-version bump --commit --tag major
	git push && git push --tags
	@$(MAKE) create-release-sandbox

.PHONY: create-release-sandbox
create-release-sandbox: check-github-token
	@VERSION=$$(cat packages/sandbox/VERSION); \
	if ! command -v gh &>/dev/null; then \
		echo "gh CLI not installed. Please create the release manually."; exit 1; \
	else \
		echo "Creating GitHub release for sandbox-v$$VERSION"; \
		gh release create "sandbox-v$$VERSION" --generate-notes; \
	fi

.PHONY: bump-access-guard-patch
bump-access-guard-patch: check-github-token  ## bump access-guard patch version, tag, release
	cd packages/access-guard && bump-my-version bump --commit --tag patch
	git push && git push --tags
	@$(MAKE) create-release-access-guard

.PHONY: bump-access-guard-minor
bump-access-guard-minor: check-github-token  ## bump access-guard minor version, tag, release
	cd packages/access-guard && bump-my-version bump --commit --tag minor
	git push && git push --tags
	@$(MAKE) create-release-access-guard

.PHONY: bump-access-guard-major
bump-access-guard-major: check-github-token  ## bump access-guard major version, tag, release
	cd packages/access-guard && bump-my-version bump --commit --tag major
	git push && git push --tags
	@$(MAKE) create-release-access-guard

.PHONY: create-release-access-guard
create-release-access-guard: check-github-token
	@VERSION=$$(cat packages/access-guard/VERSION); \
	if ! command -v gh &>/dev/null; then \
		echo "gh CLI not installed. Please create the release manually."; exit 1; \
	else \
		echo "Creating GitHub release for access-guard-v$$VERSION"; \
		gh release create "access-guard-v$$VERSION" --generate-notes; \
	fi

.PHONY: bump-vim-editor-patch
bump-vim-editor-patch: check-github-token  ## bump vim-editor patch version, tag, release
	cd packages/vim-editor && bump-my-version bump --commit --tag patch
	git push && git push --tags
	@$(MAKE) create-release-vim-editor

.PHONY: bump-vim-editor-minor
bump-vim-editor-minor: check-github-token  ## bump vim-editor minor version, tag, release
	cd packages/vim-editor && bump-my-version bump --commit --tag minor
	git push && git push --tags
	@$(MAKE) create-release-vim-editor

.PHONY: bump-vim-editor-major
bump-vim-editor-major: check-github-token  ## bump vim-editor major version, tag, release
	cd packages/vim-editor && bump-my-version bump --commit --tag major
	git push && git push --tags
	@$(MAKE) create-release-vim-editor

.PHONY: create-release-vim-editor
create-release-vim-editor: check-github-token
	@VERSION=$$(cat packages/vim-editor/VERSION); \
	if ! command -v gh &>/dev/null; then \
		echo "gh CLI not installed. Please create the release manually."; exit 1; \
	else \
		echo "Creating GitHub release for vim-editor-v$$VERSION"; \
		gh release create "vim-editor-v$$VERSION" --generate-notes; \
	fi

.PHONY: publish-sandbox
publish-sandbox: check  ## publish sandbox extension to npm
	cd packages/sandbox && npm publish --access public

.PHONY: publish-vim-editor
publish-vim-editor: check  ## publish vim-editor extension to npm
	cd packages/vim-editor && npm publish --access public

.PHONY: check-github-token
check-github-token:  ## check if GITHUB_TOKEN is set
	@if [ -z "$$GITHUB_TOKEN" ]; then \
		echo "GITHUB_TOKEN is not set. Please export your GitHub token before running this command."; \
		exit 1; \
	fi
	@echo "GITHUB_TOKEN is set"

################################################################################
# Misc \
MISC:  ## ############################################################

define PRINT_HELP_PYSCRIPT
import re, sys

for line in sys.stdin:
	match = re.match(r'^([a-zA-Z0-9_-]+):.*?## (.*)$$', line)
	if match:
		target, help = match.groups()
		print("\033[36m%-20s\033[0m %s" % (target, help))
endef
export PRINT_HELP_PYSCRIPT

.PHONY: help
help:
	@python -c "$$PRINT_HELP_PYSCRIPT" < $(MAKEFILE_LIST)
