mocha := node_modules/.bin/mocha

.PHONY: all clean install demo

all: clean install
	yarn build &&\
	yarn build_lib

demo: install
	yarn build_demo

run: install
	yarn start

test: install
	env NODE_PATH=$$NODE_PATH:$$PWD/src/ $(mocha) --require babel-core/register --require ignore-styles "./src/**/*.test.js"

test-watch: install
	env NODE_PATH=$$NODE_PATH:$$PWD/src/ $(mocha) -w --require babel-core/register --require ignore-styles "./src/**/*.test.js"

install:
	yarn

clean:
	rm -rf dist
	rm -rf lib
