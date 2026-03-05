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
