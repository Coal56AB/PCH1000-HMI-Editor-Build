CC ?= cc
CFLAGS ?= -std=c99 -O2 -Wall -Wextra -Werror
CPPFLAGS ?= -Iinclude
LDLIBS ?=

SOURCES = src/hmi_gfx.c src/hmi_scene.c src/hmi_scene_generated.c src/hmi_dirty.c src/hmi_dynamic.c
src/hmi_gfx.c: src/font_data.inc

.PHONY: all test references clean
all: build/host_preview build/test_full_frames build/test_dirty_updates build/test_stats

build:
	mkdir -p build

build/host_preview: $(SOURCES) examples/host_preview.c | build
	$(CC) $(CPPFLAGS) $(CFLAGS) $^ $(LDLIBS) -o $@

build/test_full_frames: $(SOURCES) tests/test_full_frames.c | build
	$(CC) $(CPPFLAGS) $(CFLAGS) $^ $(LDLIBS) -o $@

build/test_dirty_updates: $(SOURCES) tests/test_dirty_updates.c | build
	$(CC) $(CPPFLAGS) $(CFLAGS) $^ $(LDLIBS) -o $@

build/test_stats: $(SOURCES) tests/test_stats.c | build
	$(CC) $(CPPFLAGS) $(CFLAGS) $^ $(LDLIBS) -o $@

test: all
	./build/test_full_frames reference/html_rgb565 reference/c_frames
	./build/test_dirty_updates
	./build/test_stats

references:
	node tools/export_html_scene.mjs reference/commands src/hmi_scene_generated.c include/hmi_scene_generated.h

clean:
	rm -f build/host_preview build/test_full_frames build/test_dirty_updates build/test_stats
