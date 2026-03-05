.DEFAULT_GOAL := help
MAKEFLAGS += --no-print-directory

SHELL	= bash
.ONESHELL:

# Paths relative to this package
REPO_ROOT := $(shell git rev-parse --show-toplevel)

################################################################################
# Testing \
TESTING:  ## ############################################################

.PHONY: test
test:  ## run path-guard unit tests
	cd $(REPO_ROOT) && npx vitest run packages/sandbox/path-guard.test.ts

.PHONY: test-integration
test-integration:  ## run sandbox integration tests
	cd $(REPO_ROOT) && npx vitest run packages/sandbox/sandbox-extension.test.ts

.PHONY: test-all
test-all:  ## run all sandbox tests
	cd $(REPO_ROOT) && npx vitest run packages/sandbox/

.PHONY: test-watch
test-watch:  ## run tests in watch mode
	cd $(REPO_ROOT) && npx vitest watch packages/sandbox/

.PHONY: test-verbose
test-verbose:  ## run tests with verbose output
	cd $(REPO_ROOT) && npx vitest run --reporter=verbose packages/sandbox/

################################################################################
# Code Quality \
QUALITY:  ## ############################################################

.PHONY: lint
lint:  ## lint with biome
	cd $(REPO_ROOT) && npx biome check packages/sandbox/

.PHONY: lint-fix
lint-fix:  ## autofix linter findings
	cd $(REPO_ROOT) && npx biome check --write packages/sandbox/

.PHONY: check
check: lint test-all  ## run all checks (lint + test)

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
