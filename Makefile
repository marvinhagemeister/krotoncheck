LIBDIR=static/libs

default: run-server

help:
	@echo 'make targets:'
	@echo '  help          This message'
	@echo '  deps          Download and install all dependencies (for compiling / testing / CLI operation)'
	@echo '  test          Run tests'
	@echo '  run-server    Run the server'
	@echo '  clean         Remove temporary files'


deps: 
	(node --version && npm --version) >/dev/null 2>/dev/null || sudo apt-get install -y nodejs npm
	npm install

test:
	TODO
	$(MAKE) lint

clean:
	@npm clean

run-server:
	node-supervisor src/krotoncheck.js

lint: eslint ## Verify source code quality

eslint:
	@eslint src/*.js test/*.js

.PHONY: default help deps test clean run-server lint eslint
